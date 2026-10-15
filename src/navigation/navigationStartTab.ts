import { database } from '../database';
import type CachedItem from '../database/models/CachedItem';
import { Q } from '@nozbe/watermelondb';

export * from './navigationStartTabCore';

export async function fetchUserHasCacheItems(userId: string): Promise<boolean> {
  try {
    const count = await database
      .get<CachedItem>('cached_items')
      .query(Q.where('user_id', userId), Q.where('deleted_at', null))
      .fetchCount();
    return count > 0;
  } catch (error) {
    console.warn('[StartTab] fetchUserHasCacheItems failed:', error);
    return false;
  }
}
