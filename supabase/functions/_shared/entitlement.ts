import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type PlanType = 'trial' | 'free' | 'premium';

type AuthenticatedUserLike = {
  user_metadata?: Record<string, unknown> | null;
} | null;

type RevenueCatEntitlementState = {
  isActive: boolean;
  isTrial: boolean;
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

function extractRevenueCatPeriodType(entitlement: any): string {
  return String(
    entitlement?.period_type ??
    entitlement?.periodType ??
    entitlement?.store_period_type ??
    entitlement?.storePeriodType ??
    ''
  ).trim().toLowerCase();
}

function isRevenueCatTrialPeriod(entitlement: any): boolean {
  const periodType = extractRevenueCatPeriodType(entitlement);
  return periodType.includes('trial') || periodType.includes('intro');
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
      isTrial: isRevenueCatTrialPeriod(entitlement),
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
    isTrial: false,
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
      trial_started_at: null,
      trial_ends_at: null,
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
    .select('status, expires_at, product_id, raw_event')
    .eq('user_id', userId)
    .eq('provider', 'revenuecat')
    .eq('entitlement_id', REVENUECAT_ENTITLEMENT_ID)
    .maybeSingle();

  if (error) {
    console.warn('[entitlement] subscription lookup failed', {
      user: userId.slice(-8),
      error: error.message,
    });
  }

  const subscriptionExpiresAt = parseIso(subscription?.expires_at ?? null);
  const hasPremium = subscription?.status === 'active' && (!subscriptionExpiresAt || isFutureIso(subscriptionExpiresAt));
  const rawSubscriber = subscription?.raw_event ?? null;
  const rawEntitlement = (rawSubscriber as any)?.entitlements?.[REVENUECAT_ENTITLEMENT_ID] ?? null;
  const isTrial = hasPremium && isRevenueCatTrialPeriod(rawEntitlement);
  const planType: PlanType = hasPremium ? (isTrial ? 'trial' : 'premium') : 'free';
  const trialEndsAt = isTrial ? subscriptionExpiresAt : null;
  const productId =
    typeof subscription?.product_id === 'string' && subscription.product_id.trim()
      ? subscription.product_id.trim()
      : typeof rawEntitlement?.product_identifier === 'string'
        ? rawEntitlement.product_identifier
        : typeof rawEntitlement?.productIdentifier === 'string'
          ? rawEntitlement.productIdentifier
          : null;

  return {
    planType,
    productId,
    trialEndsAt,
    subscriptionExpiresAt,
    canUseCloudAI: planType !== 'free',
    canUseCloudTTS: planType !== 'free',
    // Coach and Quiz share a server-managed pronunciation quota. Free learners
    // retain access while their Starter Allowance remains active.
    canUsePronunciationCoach: true,
    canUseAutoCardGeneration: planType !== 'free',
    canUseManualOCRCardCreation: planType !== 'free',
    cacheCardLimit: null,
  };
}
