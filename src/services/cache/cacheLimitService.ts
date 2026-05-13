import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import CachedItem from '@database/models/CachedItem';
import SubscriptionService from '@services/subscription/SubscriptionService';
import type { PlanType } from '@services/settings/userSettings';

export const FREE_CACHE_CARD_LIMIT = 5;

export type CacheCapacitySnapshot = {
  planType: PlanType;
  currentCount: number;
  limit: number | null;
  remainingSlots: number;
  isAtLimit: boolean;
};

export async function getCurrentCacheCardCount(userId: string): Promise<number> {
  const collection = database.get<CachedItem>('cached_items');
  const activeCacheItems = await collection
    .query(
      Q.where('user_id', userId),
      Q.where('deleted_at', null),
      Q.where('converted_to_card', false)
    )
    .fetch();

  return activeCacheItems.length;
}

export async function getCacheCapacitySnapshot(userId: string): Promise<CacheCapacitySnapshot> {
  const [entitlement, currentCount] = await Promise.all([
    SubscriptionService.getEntitlementSnapshot(userId),
    getCurrentCacheCardCount(userId),
  ]);

  if (entitlement.planType !== 'free') {
    return {
      planType: entitlement.planType,
      currentCount,
      limit: null,
      remainingSlots: Number.POSITIVE_INFINITY,
      isAtLimit: false,
    };
  }

  const remainingSlots = Math.max(0, FREE_CACHE_CARD_LIMIT - currentCount);
  return {
    planType: 'free',
    currentCount,
    limit: FREE_CACHE_CARD_LIMIT,
    remainingSlots,
    isAtLimit: remainingSlots <= 0,
  };
}

export function formatCacheLimitReachedMessage(snapshot: CacheCapacitySnapshot): string {
  const limitLabel = snapshot.limit ?? FREE_CACHE_CARD_LIMIT;
  return `快取已滿（${snapshot.currentCount}/${limitLabel}）。請先處理現有卡片或升級方案後再新增。`;
}
