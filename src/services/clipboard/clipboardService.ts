/**
 * 剪貼簿服務
 * 
 * 提供快速從剪貼簿貼上文字到 Cache 的功能
 * 符合 iOS 隱私規範，不會觸發系統警告
 */

import * as Clipboard from 'expo-clipboard';
import { database } from '@database/index';
import CachedItem from '@database/models/CachedItem';
import {
  formatCacheLimitReachedMessage,
  getCacheCapacitySnapshot,
} from '@services/cache/cacheLimitService';

const MAX_TEXT_LENGTH = 2000;

export interface ClipboardPasteResult {
  success: boolean;
  message: string;
  textLength?: number;
}

/**
 * 從剪貼簿讀取文字並儲存到 Cache
 */
export async function pasteTextFromClipboard(userId: string): Promise<ClipboardPasteResult> {
  try {
    // 檢查剪貼簿是否有文字
    const hasString = await Clipboard.hasStringAsync();
    
    if (!hasString) {
      return {
        success: false,
        message: '剪貼簿中沒有文字內容',
      };
    }

    // 讀取文字
    const text = await Clipboard.getStringAsync();
    
    if (!text || text.trim().length === 0) {
      return {
        success: false,
        message: '剪貼簿內容為空',
      };
    }

    // 套用字數限制
    const trimmedText = text.trim();
    const limitedText = trimmedText.length > MAX_TEXT_LENGTH 
      ? trimmedText.substring(0, MAX_TEXT_LENGTH) 
      : trimmedText;

    const capacity = await getCacheCapacitySnapshot(userId);
    if (capacity.isAtLimit) {
      return {
        success: false,
        message: formatCacheLimitReachedMessage(capacity),
      };
    }

    // 儲存到資料庫
    await database.write(async () => {
      await database.get<CachedItem>('cached_items').create((item) => {
        item.userId = userId;
        item.type = 'text';
        item.contentType = 'text';
        item.contentText = limitedText;
        item.sourceApp = 'clipboard';
        item.aiAnalysisCompleted = false;
        item.convertedToCard = false;
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);
        item.expiresAt = expiresAt;
      });
    });

    return {
      success: true,
      message: '已成功貼上文字到 Cache',
      textLength: limitedText.length,
    };
  } catch (error) {
    console.error('Error pasting from clipboard:', error);
    return {
      success: false,
      message: `貼上失敗: ${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}

/**
 * 檢查剪貼簿是否有可用的文字（不會觸發讀取，避免隱私警告）
 */
export async function hasClipboardText(): Promise<boolean> {
  try {
    return await Clipboard.hasStringAsync();
  } catch (error) {
    console.error('Error checking clipboard:', error);
    return false;
  }
}
