import { analytics } from './index';
import { buildProfileAttributes, type UserProfileAttributes } from './profileAttributes';
import { setRevenueCatAttributes } from '@services/subscription/revenueCat';
import type { PlanType } from '@services/settings/userSettings';

/**
 * MODULE 3a: 將標準用戶資料屬性同步到 PostHog（$set）與 RevenueCat（setAttributes）。
 *
 * 在 login / init / onCustomerInfoUpdated 時呼叫。屬性皆為匿名非 PII。
 */
export async function syncUserProfileAttributes(params: {
  planType: PlanType;
  freeStarterPronunciationClaimed?: number;
  freeStarterCardClaimed?: number;
  appUserId?: string | null;
}): Promise<void> {
  const attributes: UserProfileAttributes = buildProfileAttributes({
    planType: params.planType,
    freeStarterPronunciationClaimed: params.freeStarterPronunciationClaimed,
    freeStarterCardClaimed: params.freeStarterCardClaimed,
  });

  // PostHog $set
  try {
    analytics.setProfileAttributes(attributes);
  } catch (error) {
    console.warn('[ProfileSync] PostHog setProfileAttributes failed:', error);
  }

  // RevenueCat setAttributes
  try {
    await setRevenueCatAttributes(attributes, params.appUserId);
  } catch (error) {
    console.warn('[ProfileSync] RevenueCat setAttributes failed:', error);
  }
}
