import { Model, Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type UserSettings from '@database/models/UserSettings';
import { loadUserSettings } from '@services/settings/userSettings';

const DAILY_FREE_VOICE_LIMIT = 3;
const DEV_BYPASS_ENABLED = typeof __DEV__ !== 'undefined' && __DEV__ === true;

type UserSettingsRecord = Model & {
  userId: string;
  isPremium: boolean;
  dailyVoiceUses: number;
  lastVoiceResetDate: string;
  createdAt: number;
  updatedAt: number;
};

export type EntitlementSnapshot = {
  isPremium: boolean;
  dailyVoiceUses: number;
  dailyVoiceLimit: number;
  remainingVoiceUses: number;
  lastVoiceResetDate: string;
  devBypass: boolean;
};

export type ConsumeVoiceQuotaResult = {
  allowed: boolean;
  consumed: boolean;
  snapshot: EntitlementSnapshot;
};

function toDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calcRemaining(dailyVoiceUses: number, isPremium: boolean): number {
  if (isPremium) return Number.POSITIVE_INFINITY;
  return Math.max(0, DAILY_FREE_VOICE_LIMIT - dailyVoiceUses);
}

function toSnapshot(record: UserSettingsRecord, devBypass: boolean): EntitlementSnapshot {
  return {
    isPremium: record.isPremium,
    dailyVoiceUses: record.dailyVoiceUses,
    dailyVoiceLimit: DAILY_FREE_VOICE_LIMIT,
    remainingVoiceUses: calcRemaining(record.dailyVoiceUses, record.isPremium),
    lastVoiceResetDate: record.lastVoiceResetDate,
    devBypass,
  };
}

function buildDevSnapshot(): EntitlementSnapshot {
  const today = toDateKey();
  return {
    isPremium: true,
    dailyVoiceUses: 0,
    dailyVoiceLimit: DAILY_FREE_VOICE_LIMIT,
    remainingVoiceUses: Number.POSITIVE_INFINITY,
    lastVoiceResetDate: today,
    devBypass: true,
  };
}

function asUserSettingsRecord(model: Model): UserSettingsRecord {
  return model as unknown as UserSettingsRecord;
}

async function isForcedPremiumMode(): Promise<boolean> {
  const settings = await loadUserSettings();
  return settings.entitlementMode === 'premium';
}

async function isForcedGuestMode(): Promise<boolean> {
  const settings = await loadUserSettings();
  return settings.entitlementMode === 'guest';
}

/**
 * Required WatermelonDB query logic:
 * - 以 user_id 取得 user_settings
 * - 若不存在則建立預設資料
 * - 若跨日則自動 reset daily_voice_uses
 */
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

export const SubscriptionService = {
  /**
   * 全域開發者 bypass：
   * __DEV__ = true 時永遠視為可用，不讀寫 quota。
   */
  isDevBypassEnabled(): boolean {
    return DEV_BYPASS_ENABLED;
  },

  async getEntitlementSnapshot(userId: string): Promise<EntitlementSnapshot> {
    const forcedGuest = await isForcedGuestMode();
    const forcedPremium = await isForcedPremiumMode();
    if (forcedPremium) {
      return buildDevSnapshot();
    }
    if (forcedGuest) {
      const record = await getOrCreateUserSettingsRecord(userId);
      const guestSnapshot = toSnapshot(record, false);
      return { ...guestSnapshot, isPremium: false };
    }

    if (DEV_BYPASS_ENABLED) {
      return buildDevSnapshot();
    }

    const record = await getOrCreateUserSettingsRecord(userId);
    return toSnapshot(record, false);
  },

  async isPremium(userId: string): Promise<boolean> {
    const forcedGuest = await isForcedGuestMode();
    if (forcedGuest) return false;

    const forcedPremium = await isForcedPremiumMode();
    if (forcedPremium) return true;

    if (DEV_BYPASS_ENABLED) return true;
    const record = await getOrCreateUserSettingsRecord(userId);
    return record.isPremium;
  },

  async canUsePronunciationCoach(userId: string): Promise<boolean> {
    const forcedGuest = await isForcedGuestMode();
    if (!forcedGuest && __DEV__) return true;

    const record = await getOrCreateUserSettingsRecord(userId);
    if (record.isPremium) return true;
    return record.dailyVoiceUses < DAILY_FREE_VOICE_LIMIT;
  },

  /**
   * 只在 production + 非 premium 扣次數。
   * 回傳扣額後快照，供 UI 直接更新剩餘次數。
   */
  async consumeVoiceQuota(userId: string): Promise<ConsumeVoiceQuotaResult> {
    const forcedGuest = await isForcedGuestMode();
    if (!forcedGuest && DEV_BYPASS_ENABLED) {
      return {
        allowed: true,
        consumed: false,
        snapshot: buildDevSnapshot(),
      };
    }

    const record = await getOrCreateUserSettingsRecord(userId);

    if (record.isPremium) {
      return {
        allowed: true,
        consumed: false,
        snapshot: toSnapshot(record, false),
      };
    }

    if (record.dailyVoiceUses >= DAILY_FREE_VOICE_LIMIT) {
      return {
        allowed: false,
        consumed: false,
        snapshot: toSnapshot(record, false),
      };
    }

    const now = Date.now();
    await database.write(async () => {
      await record.update((mutableModel: Model) => {
        const mutable = asUserSettingsRecord(mutableModel);
        mutable.dailyVoiceUses += 1;
        mutable.updatedAt = now;
      });
    });

    return {
      allowed: true,
      consumed: true,
      snapshot: toSnapshot(record, false),
    };
  },
};

export default SubscriptionService;
