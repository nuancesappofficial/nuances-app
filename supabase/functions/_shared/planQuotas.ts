// Map a RevenueCat product identifier to a plan tier. Lite products carry a
// 'lite' marker in their identifier (e.g. "..._lite_monthly"); anything else
// that is active resolves to the full premium tier.
export function resolvePlanTypeFromProductId(
  productId: string | null | undefined
): 'lite' | 'premium' {
  const value = typeof productId === 'string' ? productId.toLowerCase() : '';
  return value.includes('lite') ? 'lite' : 'premium';
}

// Centralized usage-quota table for every subscription plan.
//
// This is the single source of truth for fair-use limits across the edge
// proxies (ai-proxy, tts-proxy). Proxies read quotas from here by planType
// instead of scattering hard-coded environment constants.
//
// Note: the Free "lifetime 20 starter cards" allowance is intentionally NOT
// here — it is a per-user, per-email reservation flow owned by
// freeStarterAllowance.ts / the free_starter_card_allowance RPC, and must stay
// untouched. This table only covers recurring billable usage windows.

export type PlanType = 'trial' | 'free' | 'lite' | 'premium';

export type QuotaFeature = 'ai_generation' | 'pronunciation' | 'tts';

export type PlanQuota = {
  aiGeneration: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  pronunciation: {
    daily: number;
  };
  tts: {
    daily: number;
    weekly: number;
    monthly: number;
  };
};

// Lite (輕量版): a lighter recurring allowance than Pro.
// Pro / Premium: the existing high allowance.
// Trial: treated like premium while the trial is active.
// Free: no recurring billable allowance (starter cards are handled elsewhere).
export const PLAN_QUOTAS: Record<PlanType, PlanQuota> = {
  lite: {
    aiGeneration: { daily: 30, weekly: 50, monthly: 200 },
    pronunciation: { daily: 15 },
    tts: { daily: 100, weekly: 150, monthly: 500 },
  },
  premium: {
    aiGeneration: { daily: 100, weekly: 200, monthly: 800 },
    pronunciation: { daily: 60 },
    tts: { daily: 100, weekly: 150, monthly: 500 },
  },
  trial: {
    aiGeneration: { daily: 100, weekly: 200, monthly: 800 },
    pronunciation: { daily: 60 },
    tts: { daily: 100, weekly: 150, monthly: 500 },
  },
  free: {
    aiGeneration: { daily: 0, weekly: 0, monthly: 0 },
    pronunciation: { daily: 0 },
    tts: { daily: 0, weekly: 0, monthly: 0 },
  },
};

export function getPlanQuota(planType: PlanType, feature: QuotaFeature): number {
  const quota = PLAN_QUOTAS[planType];
  if (feature === 'ai_generation') return quota.aiGeneration.daily;
  if (feature === 'pronunciation') return quota.pronunciation.daily;
  return quota.tts.daily;
}

// Resolve the recurring window quota for a given plan and feature.
// `cadence` mirrors the subscription product cadence (weekly vs monthly).
export function getPlanPeriodQuota(params: {
  planType: PlanType;
  feature: 'ai_generation' | 'pronunciation' | 'tts';
  cadence: 'weekly' | 'monthly';
}): number {
  const { planType, feature, cadence } = params;
  const quota = PLAN_QUOTAS[planType];
  if (feature === 'ai_generation') {
    return cadence === 'weekly' ? quota.aiGeneration.weekly : quota.aiGeneration.monthly;
  }
  if (feature === 'tts') {
    return cadence === 'weekly' ? quota.tts.weekly : quota.tts.monthly;
  }
  // pronunciation has no weekly/monthly window in the current model; fall back
  // to the daily figure so callers always get a sane number.
  return quota.pronunciation.daily;
}
