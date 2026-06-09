import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import CachedItem from '@database/models/CachedItem';

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
