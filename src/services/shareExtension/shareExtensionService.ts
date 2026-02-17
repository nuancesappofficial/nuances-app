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
import { database } from '@database/index';
import CachedItem from '@database/models/CachedItem';
import {
  getAppGroupSharedContent,
  clearAppGroupSharedContent,
  type SharedContentItem,
} from '../../native/SharedDefaultsModule';

const MAX_TEXT_LENGTH = 2000;
const SHARED_IMAGES_SUBDIR = 'SharedImages';

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
export async function checkAndProcessSharedContent(userId: string): Promise<number> {
  try {
    const items: SharedContentItem[] | null = await getAppGroupSharedContent();

    if (!items || items.length === 0) {
      return 0;
    }

    let totalCount = 0;

    for (const item of items) {
      if (item.type === 'text' && item.content) {
        await saveTextToCache(userId, item.content);
        totalCount += 1;
      } else if (item.type === 'image' && item.images && item.images.length > 0) {
        await saveImagesToCache(userId, item.images);
        totalCount += item.images.length;
      }
    }

    await clearAppGroupSharedContent();
    return totalCount;
  } catch (error) {
    console.error('Error processing shared content:', error);
    return 0;
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
      });
    });

    console.log('Text saved to cache successfully');
  } catch (error) {
    console.error('Error saving text to cache:', error);
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

      // 寫入資料庫，使用 file:// URI 確保 Image 組件可存取
      const mediaUri = targetPath.startsWith('file://') ? targetPath : toFileUri(targetPath);
      await database.write(async () => {
        await database.get<CachedItem>('cached_items').create((item) => {
          item.userId = userId;
          item.type = 'image';
          item.contentType = 'image';
          item.mediaUri = mediaUri;
          item.imageStoragePath = mediaUri;
          item.contentText = undefined; // OCR 會在後續流程填入
          item.sourceApp = 'share_sheet';
          item.aiAnalysisCompleted = false;
          item.convertedToCard = false;
        });
      });

      console.log(`Image saved to cache: ${mediaUri}`);
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
    throw error;
  }
}

/**
 * 手動觸發讀取共享資料（用於測試或手動同步）
 */
export async function manualCheckSharedContent(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const count = await checkAndProcessSharedContent(userId);

    if (count > 0) {
      return { success: true, message: `成功匯入 ${count} 個分享內容` };
    }
    return { success: false, message: '沒有待處理的分享內容' };
  } catch (error) {
    return {
      success: false,
      message: `處理分享內容失敗: ${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}
