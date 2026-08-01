import React from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';

type UseCacheItemCleanupArgs = {
  cacheItems: CachedItem[];
  deletionLocked?: boolean;
};

const DUPLICATE_BURST_WINDOW_MS = 10 * 60 * 1000;

function getOwnedMediaUris(item: CachedItem): string[] {
  const documentRoot = FileSystem.documentDirectory;
  const cacheRoot = FileSystem.cacheDirectory;
  const sharedImageRoot = documentRoot ? `${documentRoot}SharedImages/${item.userId}/` : null;
  return [item.imageStoragePath, item.mediaUri]
    .filter((uri): uri is string => typeof uri === 'string' && uri.startsWith('file://'))
    .filter((uri) =>
      Boolean((sharedImageRoot && uri.startsWith(sharedImageRoot)) || (cacheRoot && uri.startsWith(cacheRoot)))
    );
}

async function deleteOwnedMediaFiles(urisToDelete: string[]): Promise<void> {
  const uris = Array.from(new Set(urisToDelete));
  await Promise.all(uris.map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)));
}

export function useCacheItemCleanup({
  cacheItems,
  deletionLocked = false,
}: UseCacheItemCleanupArgs) {
  const deletingItemIdsRef = React.useRef(new Set<string>());
  const deletingAllRef = React.useRef(false);
  const invalidCleanupRunningRef = React.useRef(false);
  const duplicateCleanupRunningRef = React.useRef(false);

  const deleteCacheItemPermanently = React.useCallback(async (
    item: CachedItem,
    options?: { silent?: boolean }
  ) => {
    if (deletionLocked) {
      console.warn('[CacheList] deletion blocked by active tutorial', {
        itemId: item.id,
      });
      return;
    }
    if (deletingItemIdsRef.current.has(item.id)) return;
    deletingItemIdsRef.current.add(item.id);
    try {
      const currentUserId = await getCurrentSessionUserId();
      if (!currentUserId || item.userId !== currentUserId) {
        throw new Error('Refusing to delete cache data owned by another account');
      }
      const ownedMediaUris = getOwnedMediaUris(item);
      await database.write(async () => {
        await item.destroyPermanently();
      });
      await deleteOwnedMediaFiles(ownedMediaUris);
    } catch (error) {
      console.error('[CacheList] delete cache item failed:', error);
      if (!options?.silent) {
        Alert.alert('刪除失敗', '無法刪除這筆暫存資料，請稍後再試。');
      }
    } finally {
      deletingItemIdsRef.current.delete(item.id);
    }
  }, [deletionLocked]);

  const deleteAllCacheItemsPermanently = React.useCallback(async (): Promise<boolean> => {
    if (deletionLocked) {
      console.warn('[CacheList] delete-all blocked by active tutorial');
      return false;
    }
    if (deletingAllRef.current) return false;
    const currentUserId = await getCurrentSessionUserId();
    if (!currentUserId) return false;
    const itemsToDelete = cacheItems.filter(
      (item) => item.userId === currentUserId && !deletingItemIdsRef.current.has(item.id)
    );
    if (itemsToDelete.length === 0) return true;

    deletingAllRef.current = true;
    itemsToDelete.forEach((item) => deletingItemIdsRef.current.add(item.id));
    const ownedMediaUris = itemsToDelete.flatMap(getOwnedMediaUris);
    try {
      await database.write(async () => {
        await database.batch(...itemsToDelete.map((item) => item.prepareDestroyPermanently()));
      });
      await deleteOwnedMediaFiles(ownedMediaUris);
      return true;
    } catch (error) {
      console.error('[CacheList] delete all cache items failed:', error);
      return false;
    } finally {
      itemsToDelete.forEach((item) => deletingItemIdsRef.current.delete(item.id));
      deletingAllRef.current = false;
    }
  }, [cacheItems, deletionLocked]);

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

  React.useEffect(() => {
    if (cacheItems.length < 2 || duplicateCleanupRunningRef.current) return;

    const seenText = new Map<string, CachedItem>();
    const duplicates: CachedItem[] = [];
    for (const item of cacheItems) {
      if (item.contentType !== 'text') continue;
      const normalized = item.contentText?.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
      if (!normalized) continue;
      const seenItem = seenText.get(normalized);
      const isSameBurst = Boolean(
        seenItem &&
        seenItem.sourceApp === item.sourceApp &&
        Math.abs(seenItem.createdAt.getTime() - item.createdAt.getTime()) <= DUPLICATE_BURST_WINDOW_MS
      );
      if (isSameBurst) {
        duplicates.push(item);
      } else {
        seenText.set(normalized, item);
      }
    }
    if (duplicates.length === 0) return;

    duplicateCleanupRunningRef.current = true;
    void (async () => {
      try {
        const currentUserId = await getCurrentSessionUserId();
        const ownedDuplicates = currentUserId
          ? duplicates.filter((item) => item.userId === currentUserId && !deletingItemIdsRef.current.has(item.id))
          : [];
        if (ownedDuplicates.length === 0) return;
        await database.write(async () => {
          await database.batch(...ownedDuplicates.map((item) => item.prepareDestroyPermanently()));
        });
      } catch (error) {
        console.error('[CacheList] duplicate cache cleanup failed:', error);
      } finally {
        duplicateCleanupRunningRef.current = false;
      }
    })();
  }, [cacheItems]);

  return { deleteCacheItemPermanently, deleteAllCacheItemsPermanently };
}
