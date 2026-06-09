import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type PlanType = 'trial' | 'free' | 'premium';

type AuthenticatedUserLike = {
  user_metadata?: Record<string, unknown> | null;
} | null;

type RevenueCatEntitlementState = {
  isActive: boolean;
  productId: string | null;
  entitlementId: string;
  purchaseDate: string | null;
  expiresAt: string | null;
  environment: string | null;
  status: 'active' | 'expired';
  rawSubscriber: unknown;
};

const REVENUECAT_SECRET_KEY = (Deno.env.get('REVENUECAT_SECRET_KEY') ?? '').trim();
const REVENUECAT_ENTITLEMENT_ID = (Deno.env.get('REVENUECAT_ENTITLEMENT_ID') ?? 'premium').trim();
const REVENUECAT_API_BASE = (Deno.env.get('REVENUECAT_API_BASE') ?? 'https://api.revenuecat.com/v1').replace(/\/+$/, '');
const TRIAL_DURATION_MS = Number(Deno.env.get('TRIAL_DURATION_MS') ?? String(7 * 24 * 60 * 60 * 1000));

function parseIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function isFutureIso(value: string | null | undefined): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export function createServiceRoleClient() {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function ensureServerTrialEnrollment(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
}) {
  const { supabase, userId } = params;
  const { data: profile, error: selectError } = await supabase
    .from('profiles')
    .select('trial_started_at, trial_ends_at')
    .eq('id', userId)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  const existingTrialEndsAt = parseIso(profile?.trial_ends_at ?? null);
  if (profile?.trial_started_at && existingTrialEndsAt) {
    return {
      trialStartedAt: parseIso(profile.trial_started_at),
      trialEndsAt: existingTrialEndsAt,
    };
  }

  const now = new Date();
  const trialStartedAt = now.toISOString();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DURATION_MS).toISOString();

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      trial_started_at: trialStartedAt,
      trial_ends_at: trialEndsAt,
      updated_at: trialStartedAt,
    })
    .eq('id', userId);

  if (updateError) {
    throw updateError;
  }

  return { trialStartedAt, trialEndsAt };
}

async function fetchRevenueCatSubscriber(appUserId: string): Promise<any | null> {
  if (!REVENUECAT_SECRET_KEY || !appUserId) return null;
  const endpoint = `${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${REVENUECAT_SECRET_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RevenueCat subscriber lookup failed (${response.status}): ${text || '<empty>'}`);
  }

  return response.json();
}

function extractRevenueCatEntitlementState(payload: any): RevenueCatEntitlementState {
  const subscriber = payload?.subscriber ?? {};
  const entitlement = subscriber?.entitlements?.[REVENUECAT_ENTITLEMENT_ID] ?? null;
  const activeExpiresAt = parseIso(entitlement?.expires_date ?? entitlement?.expiresDate ?? null);
  const activePurchaseDate = parseIso(entitlement?.purchase_date ?? entitlement?.purchaseDate ?? null);
  const productId =
    typeof entitlement?.product_identifier === 'string'
      ? entitlement.product_identifier
      : typeof entitlement?.productIdentifier === 'string'
        ? entitlement.productIdentifier
        : null;
  const environment =
    typeof subscriber?.original_app_user_id === 'string'
      ? typeof payload?.subscriber?.original_application_version === 'string'
        ? null
        : null
      : null;

  if (productId && (!activeExpiresAt || isFutureIso(activeExpiresAt))) {
    return {
      isActive: true,
      productId,
      entitlementId: REVENUECAT_ENTITLEMENT_ID,
      purchaseDate: activePurchaseDate,
      expiresAt: activeExpiresAt,
      environment,
      status: 'active',
      rawSubscriber: subscriber,
    };
  }

  const subscriptions = subscriber?.subscriptions && typeof subscriber.subscriptions === 'object'
    ? Object.entries(subscriber.subscriptions)
    : [];
  const latest = subscriptions.reduce<{
    productId: string | null;
    expiresAt: string | null;
    purchaseDate: string | null;
  }>(
    (acc, [candidateId, rawValue]) => {
      const expiresAt = parseIso((rawValue as any)?.expires_date ?? (rawValue as any)?.expiresDate ?? null);
      if (!expiresAt) return acc;
      if (!acc.expiresAt || Date.parse(expiresAt) > Date.parse(acc.expiresAt)) {
        return {
          productId: candidateId,
          expiresAt,
          purchaseDate: parseIso((rawValue as any)?.purchase_date ?? (rawValue as any)?.purchaseDate ?? null),
        };
      }
      return acc;
    },
    { productId: productId, expiresAt: activeExpiresAt, purchaseDate: activePurchaseDate }
  );

  return {
    isActive: false,
    productId: latest.productId,
    entitlementId: REVENUECAT_ENTITLEMENT_ID,
    purchaseDate: latest.purchaseDate,
    expiresAt: latest.expiresAt,
    environment,
    status: 'expired',
    rawSubscriber: subscriber,
  };
}

export async function syncRevenueCatSubscriptionToSupabase(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
}) {
  const { supabase, userId } = params;
  if (!REVENUECAT_SECRET_KEY || !userId) {
    return null;
  }

  const subscriberPayload = await fetchRevenueCatSubscriber(userId);
  const entitlement = extractRevenueCatEntitlementState(subscriberPayload);
  const nowIso = new Date().toISOString();

  await supabase.from('subscriptions').upsert(
    {
      user_id: userId,
      provider: 'revenuecat',
      product_id: entitlement.productId,
      entitlement_id: entitlement.entitlementId,
      status: entitlement.status,
      started_at: entitlement.purchaseDate,
      expires_at: entitlement.expiresAt,
      environment: entitlement.environment ?? 'production',
      last_synced_at: nowIso,
      raw_event: entitlement.rawSubscriber,
      updated_at: nowIso,
    },
    { onConflict: 'user_id,provider,entitlement_id' }
  );

  await supabase
    .from('profiles')
    .update({
      subscription_tier: entitlement.isActive ? 'pro' : 'free',
      subscription_expires_at: entitlement.expiresAt,
      updated_at: nowIso,
    })
    .eq('id', userId);

  return entitlement;
}

export async function resolveServerEntitlement(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  user?: AuthenticatedUserLike;
}) {
  const { supabase, userId } = params;

  const { data: subscription, error } = await supabase
    .from('subscriptions')
    .select('status, expires_at')
    .eq('user_id', userId)
    .eq('provider', 'revenuecat')
    .eq('entitlement_id', REVENUECAT_ENTITLEMENT_ID)
    .maybeSingle();

  if (error) {
    console.warn('[entitlement] subscription lookup failed', { userId, error: error.message });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('trial_ends_at')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.warn('[entitlement] trial lookup failed', { userId, error: profileError.message });
  }

  const subscriptionExpiresAt = parseIso(subscription?.expires_at ?? null);
  const trialEndsAt = parseIso(profile?.trial_ends_at ?? null);
  const hasPremium = subscription?.status === 'active' && (!subscriptionExpiresAt || isFutureIso(subscriptionExpiresAt));
  const planType: PlanType = hasPremium ? 'premium' : isFutureIso(trialEndsAt) ? 'trial' : 'free';

  return {
    planType,
    trialEndsAt,
    subscriptionExpiresAt,
    canUseCloudAI: planType !== 'free',
    canUseCloudTTS: planType !== 'free',
    canUsePronunciationCoach: planType !== 'free',
    canUseAutoCardGeneration: planType !== 'free',
    canUseManualOCRCardCreation: planType !== 'free',
    cacheCardLimit: null,
  };
}
