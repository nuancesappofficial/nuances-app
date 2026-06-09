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
import { database } from '@database/index';
import CachedItem from '@database/models/CachedItem';
import { getCurrentCacheCardCount } from '@services/cache/cacheLimitService';
import type { PlanType } from '@services/settings/userSettings';
import {
  getAppGroupSharedContentSnapshot,
  clearAppGroupSharedContentIfUnchanged,
  type SharedContentItem,
} from '../../native/SharedDefaultsModule';

const MAX_TEXT_LENGTH = 2000;
const SHARED_IMAGES_SUBDIR = 'SharedImages';
const SHARE_INGEST_EVENTS_KEY = 'share_extension_ingest_events';
const MAX_SHARE_INGEST_EVENTS = 120;

let currentIngestPromise: Promise<ShareContentProcessResult> | null = null;

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
    const raw = await AsyncStorage.getItem(SHARE_INGEST_EVENTS_KEY);
    const existing = raw ? (JSON.parse(raw) as ShareIngestEvent[]) : [];
    const next: ShareIngestEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...event,
    };
    const merged = [next, ...existing].slice(0, MAX_SHARE_INGEST_EVENTS);
    await AsyncStorage.setItem(SHARE_INGEST_EVENTS_KEY, JSON.stringify(merged));
  } catch {
    // Avoid breaking ingest flow when local event log write fails.
  }
}

export async function getShareIngestEvents(): Promise<ShareIngestEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(SHARE_INGEST_EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShareIngestEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function clearShareIngestEvents(): Promise<void> {
  await AsyncStorage.removeItem(SHARE_INGEST_EVENTS_KEY);
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

export interface SharedContent {
  type: 'text' | 'image';
  content?: string;
  images?: string[];
  timestamp: number;
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
      await appendShareIngestEvent({
        level: 'info',
        stage: 'check_start',
        message: 'Start checking App Group shared content',
        meta: { userId },
      });
      const snapshot = await getAppGroupSharedContentSnapshot();
      const items: SharedContentItem[] | null = snapshot?.items ?? null;

      if (!items || items.length === 0) {
        await appendShareIngestEvent({
          level: 'info',
          stage: 'check_empty',
          message: 'No pending shared content',
          meta: { userId },
        });
        return {
          addedCount: 0,
          blockedCount: 0,
          currentCacheCount: 0,
          planType: 'premium',
        };
      }

      await appendShareIngestEvent({
        level: 'info',
        stage: 'check_found',
        message: 'Found pending shared content items',
        meta: { userId, itemCount: items.length, timestamp: snapshot?.timestamp ?? 0 },
      });

      let totalCount = 0;

      for (const item of items) {
        if (item.type === 'text' && item.content) {
          await saveTextToCache(userId, item.content);
          totalCount += 1;
          await appendShareIngestEvent({
            level: 'info',
            stage: 'ingest_text_ok',
            message: 'Saved shared text item to cache',
            meta: { userId, textLength: item.content.length },
          });
        } else if (item.type === 'image' && item.images && item.images.length > 0) {
          await saveImagesToCache(userId, item.images);
          totalCount += item.images.length;
          await appendShareIngestEvent({
            level: 'info',
            stage: 'ingest_image_ok',
            message: 'Saved shared image items to cache',
            meta: {
              userId,
              imageCount: item.images.length,
              acceptedImageCount: item.images.length,
              blockedImageCount: 0,
            },
          });
        } else {
          await appendShareIngestEvent({
            level: 'warn',
            stage: 'ingest_item_skipped',
            message: 'Skipped unsupported or empty shared item',
            meta: { userId, itemType: item?.type ?? 'unknown' },
          });
        }
      }

      const cleared = await clearAppGroupSharedContentIfUnchanged(snapshot?.timestamp ?? 0);
      await appendShareIngestEvent({
        level: 'info',
        stage: 'check_complete',
        message: 'Finished processing shared content and cleared App Group queue',
        meta: { userId, totalCount, blockedCount: 0, cleared },
      });
      const currentCacheCount = await getCurrentCacheCardCount(userId).catch(() => totalCount);
      return {
        addedCount: totalCount,
        blockedCount: 0,
        currentCacheCount,
        planType: 'premium',
      };
    } catch (error) {
      console.error('Error processing shared content:', error);
      await appendShareIngestEvent({
        level: 'error',
        stage: 'check_error',
        message: 'Processing shared content failed',
        meta: {
          userId,
          error: error instanceof Error ? error.message : String(error),
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

/**
 * 儲存純文字到 Cache
 */
async function saveTextToCache(userId: string, text: string): Promise<void> {
  try {
    // 套用字數限制
    const limitedText = text.length > MAX_TEXT_LENGTH 
      ? text.substring(0, MAX_TEXT_LENGTH) 
      : text;

    await database.write(async () => {
      await database.get<CachedItem>('cached_items').create((item) => {
        item.userId = userId;
        item.type = 'text';
        item.contentType = 'text';
        item.contentText = limitedText;
        item.sourceApp = 'share_sheet';
        item.aiAnalysisCompleted = false;
        item.convertedToCard = false;
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);
        item.expiresAt = expiresAt;
      });
    });

    console.log('Text saved to cache successfully');
  } catch (error) {
    console.error('Error saving text to cache:', error);
    await appendShareIngestEvent({
      level: 'error',
      stage: 'save_text_error',
      message: 'Failed to save shared text to cache',
      meta: {
        userId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

/**
 * 儲存圖片到 Cache
 * 圖片已在 Share Extension 進行過壓縮與轉檔
 * 來源：App Group 共享容器 (Swift 寫入)
 * 目標：App documentDirectory/SharedImages/
 */
async function saveImagesToCache(userId: string, imagePaths: string[]): Promise<void> {
  const appDocumentDir = getAppDocumentDirectory();
  const dirPath = `${appDocumentDir}${SHARED_IMAGES_SUBDIR}/`;

  try {
    // 確保目標目錄存在（在迴圈外建立，避免重複檢查）
    const dirInfo = await FileSystem.getInfoAsync(dirPath);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
    }

    const copiedMediaUris: string[] = [];

    for (const sharedPath of imagePaths) {
      if (!sharedPath || typeof sharedPath !== 'string') {
        console.warn('Skip invalid image path:', sharedPath);
        continue;
      }

      // 正規化來源路徑（Swift 可能回傳純 path 或 file:// URI）
      const fromUri = toFileUri(sharedPath);
      const fileName = sharedPath.split('/').pop() || `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.jpg`;
      const targetPath = `${dirPath}${fileName}`;

      // 複製檔案：從 App Group 容器到 App 的 document 目錄
      await FileSystem.copyAsync({
        from: fromUri,
        to: targetPath,
      });

      // 驗證複製後檔案存在
      const targetInfo = await FileSystem.getInfoAsync(targetPath);
      if (!targetInfo.exists) {
        throw new Error(`Copy failed: target file not found at ${targetPath}`);
      }

      // 先收集成功複製的檔案，稍後一次批量寫入 DB，避免逐筆寫入造成 UI 多次重排閃現
      const mediaUri = targetPath.startsWith('file://') ? targetPath : toFileUri(targetPath);
      copiedMediaUris.push(mediaUri);

      console.log(`Image saved to cache: ${mediaUri}`);
    }

    if (copiedMediaUris.length > 0) {
      await database.write(async () => {
        const collection = database.get<CachedItem>('cached_items');
        for (const mediaUri of copiedMediaUris) {
          await collection.create((item) => {
            item.userId = userId;
            item.type = 'image';
            item.contentType = 'image';
            item.mediaUri = mediaUri;
            item.imageStoragePath = mediaUri;
            item.contentText = undefined; // OCR 會在後續流程填入
            item.sourceApp = 'share_sheet';
            item.aiAnalysisCompleted = false;
            item.convertedToCard = false;
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 10);
            item.expiresAt = expiresAt;
          });
        }
      });
    }

    // 清理共享容器中的圖片（可選，失敗不影響主流程）
    for (const sharedPath of imagePaths) {
      try {
        await FileSystem.deleteAsync(toFileUri(sharedPath), { idempotent: true });
      } catch (cleanupError) {
        console.warn('Failed to cleanup shared image:', cleanupError);
      }
    }
  } catch (error) {
    console.error('Error saving images to cache:', error);
    await appendShareIngestEvent({
      level: 'error',
      stage: 'save_images_error',
      message: 'Failed to save shared images to cache',
      meta: {
        userId,
        imageCount: imagePaths.length,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
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
