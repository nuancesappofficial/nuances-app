import { NativeModules, Platform } from 'react-native';

/** 單一項目：文字或圖片 */
export interface SharedContentItem {
  type: 'text' | 'image';
  content?: string;
  images?: string[];
}

/** 舊版單一格式 */
export interface SharedContentDict {
  type: 'text' | 'image';
  content?: string;
  images?: string[];
  timestamp?: number;
}

/** 新版隊列格式 { items: [...] } */
export interface SharedContentQueueDict {
  items?: SharedContentItem[];
  timestamp?: number;
}

export type SharedContentRaw = SharedContentDict | SharedContentQueueDict;

const { SharedDefaultsModule } = NativeModules;

/** 取得 shared_content 並正規化為 items 陣列（相容舊版單一格式） */
export async function getAppGroupSharedContent(): Promise<SharedContentItem[] | null> {
  if (Platform.OS !== 'ios' || !SharedDefaultsModule) {
    return null;
  }
  try {
    const raw = await SharedDefaultsModule.getSharedContent();
    if (raw == null || typeof raw !== 'object') return null;

    if (Array.isArray(raw.items) && raw.items.length > 0) {
      const valid: SharedContentItem[] = [];
      for (const item of raw.items) {
        if (item && typeof item === 'object') {
          if (item.type === 'text' && typeof item.content === 'string') {
            valid.push({ type: 'text', content: item.content });
          } else if (item.type === 'image' && Array.isArray(item.images) && item.images.length > 0) {
            valid.push({ type: 'image', images: item.images });
          }
        }
      }
      return valid.length > 0 ? valid : null;
    }

    if (raw.type === 'text' && typeof raw.content === 'string') {
      return [{ type: 'text', content: raw.content }];
    }
    if (raw.type === 'image' && Array.isArray(raw.images) && raw.images.length > 0) {
      return [{ type: 'image', images: raw.images }];
    }

    return null;
  } catch {
    return null;
  }
}

export async function clearAppGroupSharedContent(): Promise<void> {
  if (Platform.OS !== 'ios' || !SharedDefaultsModule) return;
  try {
    await SharedDefaultsModule.clearSharedContent();
  } catch {
    // no-op
  }
}
