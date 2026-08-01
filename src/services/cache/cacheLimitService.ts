import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import CachedItem from '@database/models/CachedItem';

export const MAX_ACTIVE_CACHE_ITEMS = 500;

export async function getCurrentCacheCardCount(userId: string): Promise<number> {
  const collection = database.get<CachedItem>('cached_items');
  return collection
    .query(
      Q.where('user_id', userId),
      Q.where('deleted_at', null),
      Q.where('converted_to_card', false)
    )
    .fetchCount();
}

export async function getRemainingCacheCapacity(userId: string): Promise<number> {
  const count = await getCurrentCacheCardCount(userId);
  return Math.max(0, MAX_ACTIVE_CACHE_ITEMS - count);
}
