import React from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@services/supabase/client';
import { getCurrentAuthUserId } from '@services/auth/userIdentity';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type UseCacheItemCleanupArgs = {
  cacheItems: CachedItem[];
};

export function useCacheItemCleanup({ cacheItems }: UseCacheItemCleanupArgs) {
  const deletingItemIdsRef = React.useRef(new Set<string>());
  const invalidCleanupRunningRef = React.useRef(false);

  const deleteCacheItemPermanently = React.useCallback(async (
    item: CachedItem,
    options?: { silent?: boolean }
  ) => {
    if (deletingItemIdsRef.current.has(item.id)) return;
    deletingItemIdsRef.current.add(item.id);
    try {
      const itemId = item.id;
      const userId = item.userId || (await getCurrentAuthUserId());
      if (!userId) {
        throw new Error('Missing user id for deletion');
      }

      await database.write(async () => {
        await item.destroyPermanently();
      });

      if (isUuid(itemId)) {
        const { error: remoteDeleteError } = await supabase
          .from('cached_items')
          .delete()
          .eq('id', itemId)
          .eq('user_id', userId);
        if (remoteDeleteError) {
          throw remoteDeleteError;
        }
      }
    } catch (error) {
      console.error('[CacheList] delete cache item failed:', error);
      if (!options?.silent) {
        Alert.alert('刪除失敗', '無法同步刪除到後端，請稍後再試。');
      }
    } finally {
      deletingItemIdsRef.current.delete(item.id);
    }
  }, []);

  React.useEffect(() => {
    if (cacheItems.length === 0) return;
    if (invalidCleanupRunningRef.current) return;

    let cancelled = false;
    invalidCleanupRunningRef.current = true;
    const runInvalidImageCleanup = async () => {
      try {
        const invalidItems: CachedItem[] = [];

        for (const item of cacheItems) {
          if (item.contentType !== 'image') continue;
          if (deletingItemIdsRef.current.has(item.id)) continue;

          const imageSource =
            item.imageStoragePath?.trim() ||
            item.mediaUri?.trim() ||
            item.contentUrl?.trim() ||
            '';

          if (!imageSource) {
            invalidItems.push(item);
            continue;
          }

          const lower = imageSource.toLowerCase();
          const isHttpRemote = lower.startsWith('http://') || lower.startsWith('https://');
          const isLocalPath =
            lower.startsWith('file://') ||
            imageSource.startsWith('/') ||
            lower.startsWith('content://') ||
            lower.startsWith('ph://');

          if (!isHttpRemote && !isLocalPath) {
            invalidItems.push(item);
            continue;
          }

          const needsLocalExistenceCheck = lower.startsWith('file://') || imageSource.startsWith('/');
          if (!needsLocalExistenceCheck) continue;

          const normalizedLocalPath = imageSource.startsWith('file://')
            ? imageSource
            : `file://${imageSource}`;
          try {
            const info = await FileSystem.getInfoAsync(normalizedLocalPath);
            if (!info.exists) {
              invalidItems.push(item);
            }
          } catch {
            invalidItems.push(item);
          }
        }

        if (cancelled || invalidItems.length === 0) return;
        for (const item of invalidItems) {
          if (cancelled) return;
          // eslint-disable-next-line no-await-in-loop
          await deleteCacheItemPermanently(item, { silent: true });
        }
      } finally {
        invalidCleanupRunningRef.current = false;
      }
    };

    void runInvalidImageCleanup();
    return () => {
      cancelled = true;
    };
  }, [cacheItems, deleteCacheItemPermanently]);

  return { deleteCacheItemPermanently };
}
