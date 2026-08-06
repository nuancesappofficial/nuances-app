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
  // Cards & pronunciation are pure monthly caps (no daily/weekly windows).
  aiGeneration: {
    monthly: number;
  };
  pronunciation: {
    monthly: number;
  };
  // TTS keeps its daily/weekly/monthly windows (unchanged by this refactor).
  tts: {
    daily: number;
    weekly: number;
    monthly: number;
  };
};

// Lite (輕量版): a lighter recurring allowance than Pro.
// Pro / Premium: the existing high allowance.
// Trial: treated like premium while the trial is active.
// Free: no recurring billable allowance (starter cards & pronunciation are
// handled by the lifetime starter allowance elsewhere).
export const PLAN_QUOTAS: Record<PlanType, PlanQuota> = {
  lite: {
    aiGeneration: { monthly: 200 },
    pronunciation: { monthly: 300 },
    tts: { daily: 100, weekly: 150, monthly: 500 },
  },
  premium: {
    aiGeneration: { monthly: 800 },
    pronunciation: { monthly: 1200 },
    tts: { daily: 100, weekly: 150, monthly: 500 },
  },
  trial: {
    aiGeneration: { monthly: 800 },
    pronunciation: { monthly: 1200 },
    tts: { daily: 100, weekly: 150, monthly: 500 },
  },
  free: {
    aiGeneration: { monthly: 0 },
    pronunciation: { monthly: 0 },
    tts: { daily: 0, weekly: 0, monthly: 0 },
  },
};

export function getPlanQuota(planType: PlanType, feature: QuotaFeature): number {
  const quota = PLAN_QUOTAS[planType];
  if (feature === 'ai_generation') return quota.aiGeneration.monthly;
  if (feature === 'pronunciation') return quota.pronunciation.monthly;
  return quota.tts.daily;
}

// Resolve the recurring window quota for a given plan and feature.
// Cards & pronunciation are pure monthly caps regardless of `cadence`; only TTS
// still distinguishes weekly vs monthly.
export function getPlanPeriodQuota(params: {
  planType: PlanType;
  feature: 'ai_generation' | 'pronunciation' | 'tts';
  cadence: 'weekly' | 'monthly';
}): number {
  const { planType, feature, cadence } = params;
  const quota = PLAN_QUOTAS[planType];
  if (feature === 'ai_generation') {
    return quota.aiGeneration.monthly;
  }
  if (feature === 'pronunciation') {
    return quota.pronunciation.monthly;
  }
  return cadence === 'weekly' ? quota.tts.weekly : quota.tts.monthly;
}
