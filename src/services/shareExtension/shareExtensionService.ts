/**
 * Share Extension 資料處理服務
 *
 * 從 App Group UserDefaults 讀取 Share Extension 傳遞的資料，
 * 寫入 WatermelonDB 的 cached_items 表
 *
 * 路徑流程：Share Extension (Swift) 儲存圖片到 App Group 容器
 * → 主 App 複製到 documentDirectory/SharedImages/
 * → 儲存 file:// URI 到 media_uri / imageStoragePath
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';
import { Platform } from 'react-native';
import { AndroidShareIntent, type AndroidSharedPayload } from 'android-share-intent';
import { database } from '@database/index';
import CachedItem from '@database/models/CachedItem';
import { getCurrentCacheCardCount, getRemainingCacheCapacity } from '@services/cache/cacheLimitService';
import type { PlanType } from '@services/settings/userSettings';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import { logDiagnosticEvent } from '@services/logging/diagnosticsLog';
import {
  getAppGroupSharedContentSnapshot,
  clearAppGroupSharedContentIfUnchanged,
  type SharedContentItem,
} from '../../native/SharedDefaultsModule';

const MAX_TEXT_LENGTH = 2000;
const MAX_IMAGES_PER_SHARED_ITEM = 10;
const SHARED_IMAGES_SUBDIR = 'SharedImages';
const SHARE_INGEST_EVENTS_KEY = 'share_extension_ingest_events';
const MAX_SHARE_INGEST_EVENTS = 120;

let currentIngestPromise: Promise<ShareContentProcessResult> | null = null;

async function assertActiveAccount(expectedUserId: string): Promise<void> {
  const currentUserId = await getCurrentSessionUserId();
  if (currentUserId !== expectedUserId) {
    throw new Error('Account changed during share ingest');
  }
}

function getShareIngestEventsKey(userId?: string | null): string {
  return `${SHARE_INGEST_EVENTS_KEY}:${userId ?? 'guest'}`;
}

export interface ShareContentProcessResult {
  addedCount: number;
  blockedCount: number;
  currentCacheCount: number;
  planType: PlanType;
}

export type ShareIngestEventLevel = 'info' | 'warn' | 'error';

export interface ShareIngestEvent {
  id: string;
  timestamp: string;
  level: ShareIngestEventLevel;
  stage: string;
  message: string;
  meta?: Record<string, unknown>;
}


async function appendShareIngestEvent(
  event: Omit<ShareIngestEvent, 'id' | 'timestamp'>
): Promise<void> {
  try {
    const eventUserId =
      typeof event.meta?.userId === 'string' ? event.meta.userId : null;
    const storageKey = getShareIngestEventsKey(eventUserId);
    const raw = await AsyncStorage.getItem(storageKey);
    const existing = raw ? (JSON.parse(raw) as ShareIngestEvent[]) : [];
    const next: ShareIngestEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...event,
    };
    const merged = [next, ...existing].slice(0, MAX_SHARE_INGEST_EVENTS);
    await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
    void logDiagnosticEvent({
      severity: event.level,
      category: 'share_extension',
      event: `share_${event.stage}`,
      message: event.message,
      context: event.meta,
      requestId: next.id,
      userId: eventUserId,
    });
  } catch {
    // Avoid breaking ingest flow when local event log write fails.
  }
}

export async function getShareIngestEvents(): Promise<ShareIngestEvent[]> {
  try {
    const userId = await getCurrentSessionUserId();
    const raw = await AsyncStorage.getItem(getShareIngestEventsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShareIngestEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function clearShareIngestEvents(): Promise<void> {
  const userId = await getCurrentSessionUserId();
  await AsyncStorage.removeItem(getShareIngestEventsKey(userId));
}

/**
 * 取得 App 的 document 目錄路徑（file:// 格式，結尾含 /）
 * 優先使用 legacy documentDirectory，fallback 到 Paths.document.uri
 */
function getAppDocumentDirectory(): string {
  const fromLegacy = FileSystem.documentDirectory;
  if (fromLegacy && fromLegacy.length > 0) {
    return fromLegacy.endsWith('/') ? fromLegacy : `${fromLegacy}/`;
  }
  try {
    const fromPaths = Paths.document.uri;
    if (fromPaths && fromPaths.length > 0) {
      return fromPaths.endsWith('/') ? fromPaths : `${fromPaths}/`;
    }
  } catch {
    // Paths.document 在 native 尚未準備好時可能拋錯，忽略
  }
  throw new Error('Document directory not available');
}

/**
 * 正規化來源路徑：Swift 可能回傳純 path，expo-file-system 期望 file:// URI
 */
function toFileUri(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('file://')) return trimmed;
  return `file://${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function getValidatedSharedImagePath(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  const localPath = trimmed.startsWith('file://') ? trimmed.slice('file://'.length) : trimmed;
  if (!localPath.startsWith('/') || !localPath.includes('/Library/Caches/SharedMedia/')) return null;
  const fileName = localPath.split('/').pop();
  if (!fileName || !/^[A-Za-z0-9-]+\.(?:jpe?g|png|heic)$/i.test(fileName)) return null;
  return localPath;
}

function getSafeErrorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'UnknownError';
}

async function cleanupSharedImagePaths(items: SharedContentItem[]): Promise<void> {
  const paths = items
    .flatMap((item) => (item.type === 'image' && Array.isArray(item.images) ? item.images : []))
    .map(getValidatedSharedImagePath)
    .filter((path): path is string => Boolean(path));
  await Promise.all(
    paths.map((path) => FileSystem.deleteAsync(toFileUri(path), { idempotent: true }).catch(() => undefined))
  );
}

export interface SharedContent {
  type: 'text' | 'image';
  content?: string;
  images?: string[];
  timestamp: number;
}

export async function hasPendingSharedContent(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      const payloads = await AndroidShareIntent.getPendingSharedPayloads();
      return payloads.length > 0;
    }
    const snapshot = await getAppGroupSharedContentSnapshot();
    return Boolean(snapshot?.items?.length);
  } catch {
    return false;
  }
}

/**
 * 檢查是否有新的共享內容（從 App Group UserDefaults 讀取）
 * 支援隊列格式，連續分享文字/圖片時會累加處理
 * @returns 成功入庫的卡片數量（0 表示無新內容或失敗）
 */
export async function checkAndProcessSharedContent(userId: string): Promise<ShareContentProcessResult> {
  if (currentIngestPromise) {
    await appendShareIngestEvent({
      level: 'warn',
      stage: 'check_concurrent',
      message: 'Skipped duplicate share ingest trigger while another run is active',
      meta: { userId },
    });
    return currentIngestPromise;
  }

  currentIngestPromise = (async () => {
    try {
      if (Platform.OS === 'android') {
        return await processAndroidSharedContent(userId);
      }
      const snapshot = await getAppGroupSharedContentSnapshot();
      const items: SharedContentItem[] | null = snapshot?.items ?? null;

      if (!items || items.length === 0) {
        return {
          addedCount: 0,
          blockedCount: 0,
          currentCacheCount: 0,
          planType: 'premium',
        };
      }

      await assertActiveAccount(userId);

      if (snapshot?.ownerUserId !== userId) {
        const cleared = await clearAppGroupSharedContentIfUnchanged(snapshot?.timestamp ?? 0);
        if (cleared) {
          await cleanupSharedImagePaths(items);
        }
        await appendShareIngestEvent({
          level: 'warn',
          stage: 'check_owner_mismatch',
          message: 'Discarded shared content owned by another or unknown account',
          meta: {
            userId,
            ownerUserId: snapshot?.ownerUserId ?? null,
            itemCount: items.length,
            cleared,
          },
        });
        return {
          addedCount: 0,
          blockedCount: items.length,
          currentCacheCount: await getCurrentCacheCardCount(userId).catch(() => 0),
          planType: 'premium',
        };
      }

      await appendShareIngestEvent({
        level: 'info',
        stage: 'check_found',
        message: 'Found pending shared content items',
        meta: { userId, itemCount: items.length, timestamp: snapshot?.timestamp ?? 0 },
      });

      const remainingCapacity = await getRemainingCacheCapacity(userId);
      const { totalCount, blockedCount } = await saveBatchSharedContentToCache(
        userId,
        items,
        remainingCapacity
      );

      await assertActiveAccount(userId);
      const cleared = await clearAppGroupSharedContentIfUnchanged(snapshot?.timestamp ?? 0);
      if (cleared) {
        await cleanupSharedImagePaths(items);
      }
      await appendShareIngestEvent({
        level: 'info',
        stage: 'check_complete',
        message: 'Finished processing shared content and cleared App Group queue',
        meta: { userId, totalCount, blockedCount, cleared },
      });
      const currentCacheCount = await getCurrentCacheCardCount(userId).catch(() => totalCount);
      return {
        addedCount: totalCount,
        blockedCount,
        currentCacheCount,
        planType: 'premium',
      };
    } catch (error) {
      await appendShareIngestEvent({
        level: 'error',
        stage: 'check_error',
        message: 'Processing shared content failed',
        meta: {
          userId,
          errorName: getSafeErrorName(error),
        },
      });
      return {
        addedCount: 0,
        blockedCount: 0,
        currentCacheCount: 0,
        planType: 'premium',
      };
    }
  })();

  try {
    return await currentIngestPromise;
  } finally {
    currentIngestPromise = null;
  }
}

async function processAndroidSharedContent(userId: string): Promise<ShareContentProcessResult> {
  const payloads = (await AndroidShareIntent.getPendingSharedPayloads()).slice(0, 50);
  if (payloads.length === 0) {
    return {
      addedCount: 0,
      blockedCount: 0,
      currentCacheCount: 0,
      planType: 'premium',
    };
  }

  await assertActiveAccount(userId);

  let addedCount = 0;
  let blockedCount = 0;
  let remainingCapacity = await getRemainingCacheCapacity(userId);

  for (const payload of payloads) {
    await assertActiveAccount(userId);
    if (!payload.id || payload.ownerUserId !== userId) {
      blockedCount += 1;
      if (payload.id) await AndroidShareIntent.rejectSharedPayloads([payload.id]);
      continue;
    }

    let completed = false;
    if (payload.type === 'text') {
      const text = typeof payload.text === 'string' ? payload.text.trim().slice(0, MAX_TEXT_LENGTH) : '';
      if (!text || remainingCapacity <= 0) {
        blockedCount += 1;
        completed = true;
      } else {
        const created = await saveTextToCache(userId, text, 'android_share_sheet');
        if (created) { addedCount += 1; remainingCapacity -= 1; }
        completed = true;
      }
    } else if (payload.type === 'image') {
      const images = Array.isArray(payload.imageUris) ? payload.imageUris.slice(0, MAX_IMAGES_PER_SHARED_ITEM) : [];
      const accepted = images.slice(0, Math.max(0, remainingCapacity));
      const rejected = images.slice(accepted.length);
      const created = await saveAndroidImagesToCache(userId, accepted);
      addedCount += created;
      remainingCapacity -= created;
      blockedCount += rejected.length;
      await Promise.all(rejected
        .filter((uri) => isOwnedAndroidSharedImage(uri, userId))
        .map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)));
      completed = true;
    }

    if (completed) {
      await assertActiveAccount(userId);
      await AndroidShareIntent.acknowledgeSharedPayloads([payload.id]);
    }
  }

  return {
    addedCount,
    blockedCount,
    currentCacheCount: await getCurrentCacheCardCount(userId).catch(() => addedCount),
    planType: 'premium',
  };
}

/**
 * 儲存純文字到 Cache
 */
async function saveTextToCache(
  userId: string,
  text: string,
  sourceApp: 'share_sheet' | 'android_share_sheet' = 'share_sheet'
): Promise<boolean> {
  try {
    // 套用字數限制
    const limitedText = text.length > MAX_TEXT_LENGTH 
      ? text.substring(0, MAX_TEXT_LENGTH) 
      : text;

    await assertActiveAccount(userId);
    let created = false;
    await database.write(async () => {
      const collection = database.get<CachedItem>('cached_items');
      const duplicate = await collection
        .query(
          Q.where('user_id', userId),
          Q.where('content_type', 'text'),
          Q.where('content_text', limitedText),
          Q.where('deleted_at', null),
          Q.take(1)
        )
        .fetch();
      if (duplicate.length > 0) return;

      await collection.create((item) => {
        item.userId = userId;
        item.type = 'text';
        item.contentType = 'text';
        item.contentText = limitedText;
        item.sourceApp = sourceApp;
        item.aiAnalysisCompleted = false;
        item.convertedToCard = false;
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);
        item.expiresAt = expiresAt;
      });
      created = true;
    });

    return created;
  } catch (error) {
    await appendShareIngestEvent({
      level: 'error',
      stage: 'save_text_error',
      message: 'Failed to save shared text to cache',
      meta: {
        userId,
        errorName: getSafeErrorName(error),
      },
    });
    throw error;
  }
}

function isOwnedAndroidSharedImage(uri: string, userId: string): boolean {
  if (!uri.startsWith('file://')) return false;
  const path = decodeURIComponent(uri.slice('file://'.length));
  const safeUserId = userId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  return path.includes(`/files/SharedImages/${safeUserId}/`) &&
    /^[a-f0-9]{32}_\d+\.(?:jpe?g|png|webp)$/i.test(path.split('/').pop() ?? '');
}

async function saveAndroidImagesToCache(userId: string, imageUris: string[]): Promise<number> {
  const validUris = imageUris.filter((uri) => typeof uri === 'string' && isOwnedAndroidSharedImage(uri, userId));
  if (validUris.length === 0) return 0;
  await assertActiveAccount(userId);
  let createdCount = 0;
  await database.write(async () => {
    const collection = database.get<CachedItem>('cached_items');
    const existing = await collection.query(
      Q.where('user_id', userId), Q.where('content_type', 'image'), Q.where('deleted_at', null),
      Q.or(Q.where('image_storage_path', Q.oneOf(validUris)), Q.where('media_uri', Q.oneOf(validUris)))
    ).fetch();
    const existingUris = new Set(existing.flatMap((item) => [item.imageStoragePath, item.mediaUri]).filter(Boolean));
    for (const mediaUri of validUris) {
      if (existingUris.has(mediaUri)) continue;
      await collection.create((item) => {
        item.userId = userId;
        item.type = 'image';
        item.contentType = 'image';
        item.mediaUri = mediaUri;
        item.imageStoragePath = mediaUri;
        item.contentText = undefined;
        item.sourceApp = 'android_share_sheet';
        item.aiAnalysisCompleted = false;
        item.convertedToCard = false;
        item.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      });
      createdCount += 1;
    }
  });
  return createdCount;
}

/**
 * 批次儲存多個共享內容到 Cache（iOS Share Extension 專用）
 * 一次性複製檔案，並在單一 database.write 中原子性寫入所有卡片，
 * 確保 UI 僅收到一次通知，所有卡片完整進入進場動畫隊列。
 */
async function saveBatchSharedContentToCache(
  userId: string,
  items: SharedContentItem[],
  initialCapacity: number
): Promise<{ totalCount: number; blockedCount: number }> {
  await assertActiveAccount(userId);
  const appDocumentDir = getAppDocumentDirectory();
  const dirPath = `${appDocumentDir}${SHARED_IMAGES_SUBDIR}/${userId}/`;

  let remainingCapacity = initialCapacity;
  let blockedCount = 0;

  const validTextItems: string[] = [];
  const validImageItems: string[] = [];

  for (const item of items) {
    if (item.type === 'text' && item.content) {
      if (remainingCapacity <= 0) {
        blockedCount += 1;
        continue;
      }
      const trimmed = item.content.trim();
      if (!trimmed) {
        blockedCount += 1;
        continue;
      }
      const textToSave =
        trimmed.length > MAX_TEXT_LENGTH ? trimmed.substring(0, MAX_TEXT_LENGTH) : trimmed;
      validTextItems.push(textToSave);
      remainingCapacity -= 1;
    } else if (item.type === 'image' && Array.isArray(item.images) && item.images.length > 0) {
      const validatedPaths = item.images
        .slice(0, MAX_IMAGES_PER_SHARED_ITEM)
        .map(getValidatedSharedImagePath)
        .filter((path): path is string => Boolean(path));

      const accepted = validatedPaths.slice(0, Math.max(0, remainingCapacity));
      validImageItems.push(...accepted);
      remainingCapacity -= accepted.length;
      blockedCount += Math.max(0, item.images.length - accepted.length);
    } else {
      blockedCount += 1;
      await appendShareIngestEvent({
        level: 'warn',
        stage: 'ingest_item_skipped',
        message: 'Skipped unsupported or empty shared item',
        meta: { userId, itemType: item?.type ?? 'unknown' },
      });
    }
  }

  const copiedMediaUris: string[] = [];
  if (validImageItems.length > 0) {
    const dirInfo = await FileSystem.getInfoAsync(dirPath);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
    }

    for (const sharedPath of validImageItems) {
      const fromUri = toFileUri(sharedPath);
      const fileName = sharedPath.split('/').pop();
      if (!fileName) continue;
      const targetPath = `${dirPath}${fileName}`;

      await FileSystem.copyAsync({
        from: fromUri,
        to: targetPath,
      });

      const targetInfo = await FileSystem.getInfoAsync(targetPath);
      if (!targetInfo.exists) {
        throw new Error(`Copy failed: target file not found at ${targetPath}`);
      }

      const mediaUri = targetPath.startsWith('file://') ? targetPath : toFileUri(targetPath);
      copiedMediaUris.push(mediaUri);
    }
  }

  let totalCount = 0;
  if (validTextItems.length > 0 || copiedMediaUris.length > 0) {
    await assertActiveAccount(userId);
    await database.write(async () => {
      const collection = database.get<CachedItem>('cached_items');

      if (validTextItems.length > 0) {
        const existingTextItems = await collection
          .query(
            Q.where('user_id', userId),
            Q.where('content_type', 'text'),
            Q.where('deleted_at', null),
            Q.where('content_text', Q.oneOf(validTextItems))
          )
          .fetch();
        const existingTexts = new Set(existingTextItems.map((i) => i.contentText).filter(Boolean));

        for (const text of validTextItems) {
          if (existingTexts.has(text)) continue;
          await collection.create((item) => {
            item.userId = userId;
            item.type = 'text';
            item.contentType = 'text';
            item.contentText = text;
            item.sourceApp = 'share_sheet';
            item.aiAnalysisCompleted = false;
            item.convertedToCard = false;
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 10);
            item.expiresAt = expiresAt;
          });
          totalCount += 1;
        }
      }

      if (copiedMediaUris.length > 0) {
        const existingImageItems = await collection
          .query(
            Q.where('user_id', userId),
            Q.where('content_type', 'image'),
            Q.where('deleted_at', null),
            Q.or(
              Q.where('image_storage_path', Q.oneOf(copiedMediaUris)),
              Q.where('media_uri', Q.oneOf(copiedMediaUris))
            )
          )
          .fetch();
        const existingUris = new Set(
          existingImageItems.flatMap((item) => [item.imageStoragePath, item.mediaUri]).filter(Boolean)
        );

        for (const mediaUri of copiedMediaUris) {
          if (existingUris.has(mediaUri)) continue;
          await collection.create((item) => {
            item.userId = userId;
            item.type = 'image';
            item.contentType = 'image';
            item.mediaUri = mediaUri;
            item.imageStoragePath = mediaUri;
            item.contentText = undefined;
            item.sourceApp = 'share_sheet';
            item.aiAnalysisCompleted = false;
            item.convertedToCard = false;
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 10);
            item.expiresAt = expiresAt;
          });
          totalCount += 1;
        }
      }
    });
  }

  await appendShareIngestEvent({
    level: 'info',
    stage: 'ingest_batch_ok',
    message: 'Processed batch shared content',
    meta: {
      userId,
      itemCount: items.length,
      createdCount: totalCount,
      blockedCount,
    },
  });

  return { totalCount, blockedCount };
}

/**
 * 手動觸發讀取共享資料（用於測試或手動同步）
 */
export async function manualCheckSharedContent(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const result = await checkAndProcessSharedContent(userId);

    if (result.addedCount > 0) {
      return { success: true, message: `成功匯入 ${result.addedCount} 個分享內容` };
    }
    return { success: false, message: '沒有待處理的分享內容' };
  } catch (error) {
    return {
      success: false,
      message: `處理分享內容失敗: ${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}
