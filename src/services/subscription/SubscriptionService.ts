import { Model, Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type Profile from '@database/models/Profile';
import type UserSettings from '@database/models/UserSettings';
import { supabase } from '@services/supabase/client';
import {
  loadUserSettings,
  normalizeEntitlementMode,
  saveUserSettings,
  type PlanType,
  type UserAppSettings,
} from '@services/settings/userSettings';
import {
  configureRevenueCat,
  getRevenueCatCustomerInfo,
  getRevenueCatExpiration,
  hasRevenueCatPremium,
  purchaseRevenueCatPremium,
  restoreRevenueCatPurchases,
} from './revenueCat';

const DAILY_FREE_VOICE_LIMIT = 3;
const FREE_CACHE_CARD_LIMIT = 5;
const DEV_BYPASS_ENABLED = String(process.env.EXPO_PUBLIC_SUBSCRIPTION_DEV_BYPASS || '').toLowerCase() === 'true';
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const TRIAL_STARTED_AT_KEY = 'nuances_trial_started_at';
const TRIAL_ENDS_AT_KEY = 'nuances_trial_ends_at';
const SYNC_ENTITLEMENT_EDGE_FUNCTION_NAME =
  process.env.EXPO_PUBLIC_SYNC_ENTITLEMENT_FUNCTION_NAME || 'sync-entitlement';
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

type UserSettingsRecord = Model & {
  userId: string;
  isPremium: boolean;
  dailyVoiceUses: number;
  lastVoiceResetDate: string;
  createdAt: number;
  updatedAt: number;
};

export type EntitlementSnapshot = {
  planType: PlanType;
  isPremium: boolean;
  trialEndsAt: string | null;
  subscriptionExpiresAt: string | null;
  canUseCloudAI: boolean;
  canUsePronunciationCoach: boolean;
  canUseCloudTTS: boolean;
  canUseAutoCardGeneration: boolean;
  canUseManualOCRCardCreation: boolean;
  dailyVoiceUses: number;
  dailyVoiceLimit: number;
  remainingVoiceUses: number;
  lastVoiceResetDate: string;
  cacheCardLimit: number | null;
  devBypass: boolean;
};

export type ConsumeVoiceQuotaResult = {
  allowed: boolean;
  consumed: boolean;
  snapshot: EntitlementSnapshot;
};

type RemoteEntitlementPayload = {
  planType?: PlanType;
  trialEndsAt?: string | null;
  subscriptionExpiresAt?: string | null;
  canUseCloudAI?: boolean;
  canUsePronunciationCoach?: boolean;
  canUseCloudTTS?: boolean;
  canUseAutoCardGeneration?: boolean;
  canUseManualOCRCardCreation?: boolean;
  cacheCardLimit?: number | null;
};

function toDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function asUserSettingsRecord(model: Model): UserSettingsRecord {
  return model as unknown as UserSettingsRecord;
}

function getTrialDatesFromMetadata(metadata: unknown): {
  trialStartedAt: string | null;
  trialEndsAt: string | null;
} {
  const meta = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : null;
  const trialStartedAt =
    meta && typeof meta[TRIAL_STARTED_AT_KEY] === 'string' && meta[TRIAL_STARTED_AT_KEY]
      ? (meta[TRIAL_STARTED_AT_KEY] as string)
      : null;
  const trialEndsAt =
    meta && typeof meta[TRIAL_ENDS_AT_KEY] === 'string' && meta[TRIAL_ENDS_AT_KEY]
      ? (meta[TRIAL_ENDS_AT_KEY] as string)
      : null;
  return { trialStartedAt, trialEndsAt };
}

function isFutureIso(value: string | null | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now;
}

function calcRemaining(dailyVoiceUses: number, planType: PlanType): number {
  if (planType !== 'free') return Number.POSITIVE_INFINITY;
  return Math.max(0, DAILY_FREE_VOICE_LIMIT - dailyVoiceUses);
}

function buildSnapshot(params: {
  planType: PlanType;
  dailyVoiceUses: number;
  lastVoiceResetDate: string;
  devBypass: boolean;
  trialEndsAt: string | null;
  subscriptionExpiresAt: string | null;
}): EntitlementSnapshot {
  const { planType, dailyVoiceUses, lastVoiceResetDate, devBypass, trialEndsAt, subscriptionExpiresAt } = params;
  const canUseCloudFeatures = planType !== 'free';
  return {
    planType,
    isPremium: planType === 'premium',
    trialEndsAt,
    subscriptionExpiresAt,
    canUseCloudAI: canUseCloudFeatures,
    canUsePronunciationCoach: canUseCloudFeatures,
    canUseCloudTTS: canUseCloudFeatures,
    canUseAutoCardGeneration: canUseCloudFeatures,
    canUseManualOCRCardCreation: true,
    dailyVoiceUses,
    dailyVoiceLimit: DAILY_FREE_VOICE_LIMIT,
    remainingVoiceUses: calcRemaining(dailyVoiceUses, planType),
    lastVoiceResetDate,
    cacheCardLimit: planType === 'free' ? FREE_CACHE_CARD_LIMIT : null,
    devBypass,
  };
}

function buildDevSnapshot(mode: PlanType): EntitlementSnapshot {
  const today = toDateKey();
  return buildSnapshot({
    planType: mode,
    dailyVoiceUses: 0,
    lastVoiceResetDate: today,
    devBypass: true,
    trialEndsAt: null,
    subscriptionExpiresAt: mode === 'premium' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
  });
}

function getDevOverridePlan(settings: UserAppSettings): PlanType | null {
  if (!DEV_BYPASS_ENABLED) return null;
  const normalized = normalizeEntitlementMode(settings.entitlementMode);
  return normalized;
}

async function getOrCreateUserSettingsRecord(userId: string): Promise<UserSettingsRecord> {
  const collection = database.get<UserSettings>('user_settings');
  const today = toDateKey();

  const existingModels = await collection.query(Q.where('user_id', userId)).fetch();
  const existing = existingModels[0];

  if (!existing) {
    const now = Date.now();
    const created = await database.write(async () => {
      const model = await collection.create((rawModel: UserSettings) => {
        const record = asUserSettingsRecord(rawModel as unknown as Model);
        record.userId = userId;
        record.isPremium = false;
        record.dailyVoiceUses = 0;
        record.lastVoiceResetDate = today;
        record.createdAt = now;
        record.updatedAt = now;
      });
      return asUserSettingsRecord(model as unknown as Model);
    });

    return created;
  }

  const record = asUserSettingsRecord(existing as unknown as Model);

  if (record.lastVoiceResetDate !== today) {
    const now = Date.now();
    await database.write(async () => {
      await record.update((mutableModel: Model) => {
        const mutable = asUserSettingsRecord(mutableModel);
        mutable.dailyVoiceUses = 0;
        mutable.lastVoiceResetDate = today;
        mutable.updatedAt = now;
      });
    });
  }

  return record;
}

async function readLocalProfilePlan(userId: string): Promise<{
  planType: PlanType;
  subscriptionExpiresAt: string | null;
}> {
  try {
    const collection = database.get<Profile>('profiles');
    const profiles = await collection.query(Q.where('user_id', userId)).fetch();
    const profile = profiles[0];
    if (!profile) {
      return { planType: 'free', subscriptionExpiresAt: null };
    }

    const tier = profile.subscriptionTier;
    const expiresAt = profile.subscriptionExpiresAt?.getTime();
    if (tier === 'pro' && (!expiresAt || expiresAt > Date.now())) {
      return {
        planType: 'premium',
        subscriptionExpiresAt: profile.subscriptionExpiresAt?.toISOString?.() || null,
      };
    }
    return { planType: 'free', subscriptionExpiresAt: profile.subscriptionExpiresAt?.toISOString?.() || null };
  } catch (error) {
    console.warn('[Subscription] local profile lookup failed:', error);
    return { planType: 'free', subscriptionExpiresAt: null };
  }
}

function resolveTrialPlan(settings: UserAppSettings, now = Date.now()): PlanType {
  return isFutureIso(settings.trialEndsAt, now) ? 'trial' : 'free';
}

async function persistSettings(next: UserAppSettings): Promise<UserAppSettings> {
  await saveUserSettings(next);
  return next;
}

async function syncSettingsPlan(
  planType: PlanType,
  trialStartedAt: string | null,
  trialEndsAt: string | null,
  subscriptionExpiresAt: string | null,
  lastEntitlementSyncAt?: string | null
) {
  const settings = await loadUserSettings();
  const next = {
    ...settings,
    planType,
    entitlementMode: DEV_BYPASS_ENABLED ? settings.entitlementMode : planType,
    trialStartedAt,
    trialEndsAt,
    subscriptionExpiresAt,
    lastEntitlementSyncAt: lastEntitlementSyncAt ?? settings.lastEntitlementSyncAt,
  };
  return persistSettings(next);
}

async function persistTrialMetadataToAuth(trialStartedAt: string, trialEndsAt: string): Promise<void> {
  try {
    const { error } = await supabase.auth.updateUser({
      data: {
        [TRIAL_STARTED_AT_KEY]: trialStartedAt,
        [TRIAL_ENDS_AT_KEY]: trialEndsAt,
      },
    });
    if (error) {
      console.warn('[Subscription] update trial metadata failed:', error.message);
    }
  } catch (error) {
    console.warn('[Subscription] update trial metadata failed:', error);
  }
}

async function getAuthHeaders(): Promise<{ Authorization: string } | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token?.trim();
  if (!accessToken) return null;
  return { Authorization: `Bearer ${accessToken}` };
}

async function invokeSyncEntitlementEndpoint(): Promise<RemoteEntitlementPayload | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const authHeaders = await getAuthHeaders();
  if (!authHeaders?.Authorization) return null;

  const endpoint = `${SUPABASE_URL}/functions/v1/${SYNC_ENTITLEMENT_EDGE_FUNCTION_NAME}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: authHeaders.Authorization,
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      const text = await response.text();
      console.warn('[Subscription] sync-entitlement failed:', response.status, text);
      return null;
    }
    return (await response.json()) as RemoteEntitlementPayload;
  } catch (error) {
    console.warn('[Subscription] sync-entitlement network failed:', error);
    return null;
  }
}

async function applyRevenueCatCache(userId: string): Promise<void> {
  try {
    const customerInfo = await getRevenueCatCustomerInfo(userId);
    if (!customerInfo) return;

    const settings = await loadUserSettings();
    const nowIso = new Date().toISOString();
    const hasPremium = hasRevenueCatPremium(customerInfo);
    const subscriptionExpiresAt = getRevenueCatExpiration(customerInfo);
    if (hasPremium) {
      await persistSettings({
        ...settings,
        planType: 'premium',
        entitlementMode: DEV_BYPASS_ENABLED ? settings.entitlementMode : 'premium',
        subscriptionExpiresAt,
        lastEntitlementSyncAt: nowIso,
      });
      return;
    }

    const fallbackPlan = resolveTrialPlan(settings);
    await persistSettings({
      ...settings,
      planType: fallbackPlan,
      entitlementMode: DEV_BYPASS_ENABLED ? settings.entitlementMode : fallbackPlan,
      subscriptionExpiresAt: null,
      lastEntitlementSyncAt: nowIso,
    });
  } catch (error) {
    console.warn('[Subscription] RevenueCat customer cache sync failed:', error);
  }
}

async function applyServerSnapshotToSettings(snapshot: RemoteEntitlementPayload): Promise<void> {
  const settings = await loadUserSettings();
  const nextPlan = snapshot.planType || settings.planType;
  await persistSettings({
    ...settings,
    planType: nextPlan,
    entitlementMode: DEV_BYPASS_ENABLED ? settings.entitlementMode : nextPlan,
    trialEndsAt: typeof snapshot.trialEndsAt === 'string' ? snapshot.trialEndsAt : settings.trialEndsAt,
    subscriptionExpiresAt:
      typeof snapshot.subscriptionExpiresAt === 'string' || snapshot.subscriptionExpiresAt === null
        ? snapshot.subscriptionExpiresAt
        : settings.subscriptionExpiresAt,
    lastEntitlementSyncAt: new Date().toISOString(),
  });
}

async function resolveEffectivePlanType(userId: string): Promise<{
  planType: PlanType;
  trialEndsAt: string | null;
  subscriptionExpiresAt: string | null;
}> {
  const settings = await loadUserSettings();
  const devOverride = getDevOverridePlan(settings);
  if (devOverride) {
    return {
      planType: devOverride,
      trialEndsAt: settings.trialEndsAt,
      subscriptionExpiresAt: settings.subscriptionExpiresAt,
    };
  }

  if (settings.planType === 'premium' && isFutureIso(settings.subscriptionExpiresAt)) {
    return {
      planType: 'premium',
      trialEndsAt: settings.trialEndsAt,
      subscriptionExpiresAt: settings.subscriptionExpiresAt,
    };
  }

  const profilePlan = await readLocalProfilePlan(userId);
  if (profilePlan.planType === 'premium') {
    if (
      settings.planType !== 'premium' ||
      settings.subscriptionExpiresAt !== profilePlan.subscriptionExpiresAt
    ) {
      await syncSettingsPlan(
        'premium',
        settings.trialStartedAt,
        settings.trialEndsAt,
        profilePlan.subscriptionExpiresAt
      );
    }
    return {
      planType: 'premium',
      trialEndsAt: settings.trialEndsAt,
      subscriptionExpiresAt: profilePlan.subscriptionExpiresAt,
    };
  }

  const trialPlan = resolveTrialPlan(settings);
  if (settings.planType !== trialPlan || settings.subscriptionExpiresAt) {
    await syncSettingsPlan(trialPlan, settings.trialStartedAt, settings.trialEndsAt, null);
  }
  return {
    planType: trialPlan,
    trialEndsAt: settings.trialEndsAt,
    subscriptionExpiresAt: null,
  };
}

export const SubscriptionService = {
  TRIAL_DURATION_MS,
  TRIAL_STARTED_AT_KEY,
  TRIAL_ENDS_AT_KEY,
  FREE_CACHE_CARD_LIMIT,

  isDevBypassEnabled(): boolean {
    return DEV_BYPASS_ENABLED;
  },

  async ensureTrialEnrollment(): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return;

    const currentSettings = await loadUserSettings();
    if (DEV_BYPASS_ENABLED && (currentSettings.entitlementMode === 'free' || currentSettings.entitlementMode === 'premium')) {
      return;
    }

    const { trialStartedAt: metadataStart, trialEndsAt: metadataEnd } = getTrialDatesFromMetadata(user.user_metadata);
    const existingTrialStartedAt = metadataStart || currentSettings.trialStartedAt;
    const existingTrialEndsAt = metadataEnd || currentSettings.trialEndsAt;

    if (existingTrialStartedAt && existingTrialEndsAt) {
      const planType = isFutureIso(existingTrialEndsAt) ? 'trial' : 'free';
      await syncSettingsPlan(
        currentSettings.planType === 'premium' ? 'premium' : planType,
        existingTrialStartedAt,
        existingTrialEndsAt,
        currentSettings.subscriptionExpiresAt
      );
      if (metadataStart !== existingTrialStartedAt || metadataEnd !== existingTrialEndsAt) {
        await persistTrialMetadataToAuth(existingTrialStartedAt, existingTrialEndsAt);
      }
      return;
    }

    const now = new Date();
    const trialStartedAt = now.toISOString();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_MS).toISOString();
    await syncSettingsPlan('trial', trialStartedAt, trialEndsAt, currentSettings.subscriptionExpiresAt);
    await persistTrialMetadataToAuth(trialStartedAt, trialEndsAt);
  },

  async syncEntitlements(userId: string, options?: { preferServer?: boolean }): Promise<EntitlementSnapshot> {
    if (!userId) {
      return this.getEntitlementSnapshot(userId);
    }
    await configureRevenueCat(userId);
    await this.ensureTrialEnrollment();
    await applyRevenueCatCache(userId);
    if (options?.preferServer !== false) {
      const remote = await invokeSyncEntitlementEndpoint();
      if (remote) {
        await applyServerSnapshotToSettings(remote);
      }
    }
    return this.getEntitlementSnapshot(userId);
  },

  async getEntitlementSnapshot(userId: string): Promise<EntitlementSnapshot> {
    if (!userId) {
      return buildSnapshot({
        planType: 'free',
        dailyVoiceUses: 0,
        lastVoiceResetDate: toDateKey(),
        devBypass: false,
        trialEndsAt: null,
        subscriptionExpiresAt: null,
      });
    }

    const settings = await loadUserSettings();
    const devOverride = getDevOverridePlan(settings);
    if (devOverride) {
      return buildDevSnapshot(devOverride);
    }

    const record = await getOrCreateUserSettingsRecord(userId);
    const { planType, trialEndsAt, subscriptionExpiresAt } = await resolveEffectivePlanType(userId);
    return buildSnapshot({
      planType,
      dailyVoiceUses: record.dailyVoiceUses,
      lastVoiceResetDate: record.lastVoiceResetDate,
      devBypass: false,
      trialEndsAt,
      subscriptionExpiresAt,
    });
  },

  async purchasePremium(userId: string): Promise<EntitlementSnapshot> {
    const customerInfo = await purchaseRevenueCatPremium(userId);
    const settings = await loadUserSettings();
    await persistSettings({
      ...settings,
      planType: hasRevenueCatPremium(customerInfo) ? 'premium' : settings.planType,
      entitlementMode: DEV_BYPASS_ENABLED ? settings.entitlementMode : hasRevenueCatPremium(customerInfo) ? 'premium' : settings.planType,
      subscriptionExpiresAt: getRevenueCatExpiration(customerInfo),
      lastEntitlementSyncAt: new Date().toISOString(),
    });
    return this.syncEntitlements(userId, { preferServer: true });
  },

  async restorePurchases(userId: string): Promise<EntitlementSnapshot> {
    const customerInfo = await restoreRevenueCatPurchases(userId);
    const settings = await loadUserSettings();
    await persistSettings({
      ...settings,
      planType: hasRevenueCatPremium(customerInfo) ? 'premium' : resolveTrialPlan(settings),
      entitlementMode:
        DEV_BYPASS_ENABLED
          ? settings.entitlementMode
          : hasRevenueCatPremium(customerInfo)
            ? 'premium'
            : resolveTrialPlan(settings),
      subscriptionExpiresAt: getRevenueCatExpiration(customerInfo),
      lastEntitlementSyncAt: new Date().toISOString(),
    });
    return this.syncEntitlements(userId, { preferServer: true });
  },

  async isPremium(userId: string): Promise<boolean> {
    const snapshot = await this.getEntitlementSnapshot(userId);
    return snapshot.planType === 'premium';
  },

  async canUsePronunciationCoach(userId: string): Promise<boolean> {
    const snapshot = await this.getEntitlementSnapshot(userId);
    return snapshot.canUsePronunciationCoach;
  },

  async canUseCloudAI(userId: string): Promise<boolean> {
    const snapshot = await this.getEntitlementSnapshot(userId);
    return snapshot.canUseCloudAI;
  },

  async canUseCloudTTS(userId: string): Promise<boolean> {
    const snapshot = await this.getEntitlementSnapshot(userId);
    return snapshot.canUseCloudTTS;
  },

  async consumeVoiceQuota(userId: string): Promise<ConsumeVoiceQuotaResult> {
    const snapshot = await this.getEntitlementSnapshot(userId);
    if (snapshot.planType === 'free') {
      return {
        allowed: false,
        consumed: false,
        snapshot,
      };
    }
    return {
      allowed: true,
      consumed: false,
      snapshot,
    };
  },
};

export default SubscriptionService;
