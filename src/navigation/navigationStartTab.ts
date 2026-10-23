import { database } from '../database';
import type CachedItem from '../database/models/CachedItem';
import { Q } from '@nozbe/watermelondb';

export * from './navigationStartTabCore';

export async function fetchUserHasCacheItems(userId: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<number>((resolve) => {
    timer = setTimeout(() => resolve(0), 3000);
  });

  try {
    const countQuery = database
      .get<CachedItem>('cached_items')
      .query(Q.where('user_id', userId), Q.where('deleted_at', null))
      .fetchCount();

    const count = await Promise.race([countQuery, timeoutPromise]);
    return count > 0;
  } catch (error) {
    console.warn('[StartTab] fetchUserHasCacheItems failed:', error);
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
