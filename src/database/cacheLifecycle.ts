import { Q, type Model } from '@nozbe/watermelondb';
import type CachedItem from '@database/models/CachedItem';
import { database } from './index';

const FREE_CACHE_TTL_MS = 10 * 60 * 1000;

type UserSettingsRecord = Model & {
  isPremium: boolean;
};

function asUserSettingsRecord(model: Model): UserSettingsRecord {
  return model as unknown as UserSettingsRecord;
}

async function isPremiumUser(userId: string): Promise<boolean> {
  const settingsCollection = database.get<Model>('user_settings');
  const settings = await settingsCollection.query(Q.where('user_id', userId)).fetch();
  const first = settings[0];
  if (!first) return false;
  return Boolean(asUserSettingsRecord(first).isPremium);
}

export async function purgeExpiredFreeCacheOnForeground(userId: string): Promise<number> {
  if (!userId) return 0;
  const isPremium = await isPremiumUser(userId);
  if (isPremium) return 0;

  const cutoffTimestamp = Date.now() - FREE_CACHE_TTL_MS;
  const collection = database.get<CachedItem>('cached_items');
  const expiredItems = await collection
    .query(
      Q.where('user_id', userId),
      Q.where('created_at', Q.lt(cutoffTimestamp)),
      Q.where('converted_to_card', false)
    )
    .fetch();

  // Local-first v1.4 policy update:
  // Expired free cache should remain locally for future premium upsell unlock,
  // so we only count expired items here and do not delete them.
  return expiredItems.length;
}
