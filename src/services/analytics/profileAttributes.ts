import type { PlanType } from '@services/settings/userSettings';

/**
 * MODULE 3a: 標準用戶資料屬性（PostHog $set / RevenueCat setAttributes 共用）。
 *
 * 屬性值皆為匿名、非 PII：tier、配額數字、free_starter 進度。
 * 不含姓名、email、GPS、卡片內容。
 */

export type SubscriptionTier = 'free' | 'lite' | 'pro';

export type UserProfileAttributes = {
  /** 訂閱層級。 */
  subscription_tier: SubscriptionTier;
  /** 每月卡片生成額度（0 | 200 | 800）。 */
  monthly_card_quota: number;
  /** 每月發音額度（0 | 300 | 1200）。 */
  monthly_pronunciation_quota: number;
  /** 已使用的免費試用發音次數（0-20）。 */
  free_starter_pronunciation_claimed: number;
  /** 已使用的免費試用卡片次數（0-20）。 */
  free_starter_card_claimed: number;
};

/** 各 tier 的每月配額（與 server planQuotas.ts 對齊）。 */
const CARD_QUOTA_BY_TIER: Record<SubscriptionTier, number> = {
  free: 0,
  lite: 200,
  pro: 800,
};

const PRONUNCIATION_QUOTA_BY_TIER: Record<SubscriptionTier, number> = {
  free: 0,
  lite: 300,
  pro: 1200,
};

export function resolveSubscriptionTier(planType: PlanType): SubscriptionTier {
  if (planType === 'lite') return 'lite';
  if (planType === 'premium' || planType === 'trial') return 'pro';
  return 'free';
}

export function buildProfileAttributes(params: {
  planType: PlanType;
  freeStarterPronunciationClaimed?: number;
  freeStarterCardClaimed?: number;
}): UserProfileAttributes {
  const tier = resolveSubscriptionTier(params.planType);
  return {
    subscription_tier: tier,
    monthly_card_quota: CARD_QUOTA_BY_TIER[tier],
    monthly_pronunciation_quota: PRONUNCIATION_QUOTA_BY_TIER[tier],
    free_starter_pronunciation_claimed: Math.max(
      0,
      Math.min(20, Math.floor(params.freeStarterPronunciationClaimed ?? 0))
    ),
    free_starter_card_claimed: Math.max(
      0,
      Math.min(20, Math.floor(params.freeStarterCardClaimed ?? 0))
    ),
  };
}
