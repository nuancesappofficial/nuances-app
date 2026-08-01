import { NativeModules, Platform } from 'react-native';
import { AndroidShareIntent } from 'android-share-intent';

const MAX_SHARED_QUEUE_ITEMS = 50;
const MAX_IMAGES_PER_SHARED_ITEM = 10;
const MAX_SHARED_TEXT_LENGTH = 2000;

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
  owner_user_id?: string;
}

export type SharedContentRaw = SharedContentDict | SharedContentQueueDict;

export interface SharedContentSnapshot {
  items: SharedContentItem[];
  timestamp: number;
  ownerUserId: string | null;
}

function getSharedDefaultsModule():
  | {
      getSharedContent: () => Promise<unknown>;
      clearSharedContent: () => Promise<unknown>;
      clearSharedContentIfTimestampMatches?: (timestamp: number) => Promise<unknown>;
      setUILanguage?: (language: string) => Promise<unknown>;
      setActiveUserId?: (userId: string | null) => Promise<unknown>;
    }
  | null {
  return (NativeModules.SharedDefaultsModule || null) as
    | {
        getSharedContent: () => Promise<unknown>;
        clearSharedContent: () => Promise<unknown>;
        clearSharedContentIfTimestampMatches?: (timestamp: number) => Promise<unknown>;
        setUILanguage?: (language: string) => Promise<unknown>;
        setActiveUserId?: (userId: string | null) => Promise<unknown>;
      }
    | null;
}

function normalizeSharedContent(raw: unknown): SharedContentSnapshot | null {
  if (raw == null || typeof raw !== 'object') return null;
  const normalizedRaw = raw as SharedContentRaw & Record<string, unknown>;
  const timestamp =
    typeof normalizedRaw.timestamp === 'number' && Number.isFinite(normalizedRaw.timestamp)
      ? normalizedRaw.timestamp
      : 0;
  const ownerUserId =
    typeof normalizedRaw.owner_user_id === 'string' && normalizedRaw.owner_user_id.trim()
      ? normalizedRaw.owner_user_id.trim()
      : null;

  if (Array.isArray(normalizedRaw.items) && normalizedRaw.items.length > 0) {
    const valid: SharedContentItem[] = [];
    for (const item of normalizedRaw.items.slice(0, MAX_SHARED_QUEUE_ITEMS)) {
      if (item && typeof item === 'object') {
        if (item.type === 'text' && typeof item.content === 'string') {
          const content = item.content.trim().slice(0, MAX_SHARED_TEXT_LENGTH);
          if (content) valid.push({ type: 'text', content });
        } else if (item.type === 'image' && Array.isArray(item.images) && item.images.length > 0) {
          const images = (item.images as unknown[])
            .filter((image: unknown): image is string => typeof image === 'string' && image.trim().length > 0)
            .slice(0, MAX_IMAGES_PER_SHARED_ITEM);
          if (images.length > 0) valid.push({ type: 'image', images });
        }
      }
    }
    return valid.length > 0 ? { items: valid, timestamp, ownerUserId } : null;
  }

  if (normalizedRaw.type === 'text' && typeof normalizedRaw.content === 'string') {
    const content = normalizedRaw.content.trim().slice(0, MAX_SHARED_TEXT_LENGTH);
    return content ? { items: [{ type: 'text', content }], timestamp, ownerUserId } : null;
  }
  if (normalizedRaw.type === 'image' && Array.isArray(normalizedRaw.images) && normalizedRaw.images.length > 0) {
    const images = normalizedRaw.images
      .filter((image): image is string => typeof image === 'string' && image.trim().length > 0)
      .slice(0, MAX_IMAGES_PER_SHARED_ITEM);
    return images.length > 0 ? { items: [{ type: 'image', images }], timestamp, ownerUserId } : null;
  }

  return null;
}

/** 取得 shared_content snapshot，包含 timestamp，讓清除 queue 時能避免 race。 */
export async function getAppGroupSharedContentSnapshot(): Promise<SharedContentSnapshot | null> {
  const sharedDefaultsModule = getSharedDefaultsModule();
  if (Platform.OS !== 'ios' || !sharedDefaultsModule) {
    return null;
  }
  try {
    const raw = await sharedDefaultsModule.getSharedContent();
    return normalizeSharedContent(raw);
  } catch {
    return null;
  }
}

/** 取得 shared_content 並正規化為 items 陣列（相容舊版單一格式） */
export async function getAppGroupSharedContent(): Promise<SharedContentItem[] | null> {
  const snapshot = await getAppGroupSharedContentSnapshot();
  return snapshot?.items ?? null;
}

export async function clearAppGroupSharedContent(): Promise<void> {
  const sharedDefaultsModule = getSharedDefaultsModule();
  if (Platform.OS !== 'ios' || !sharedDefaultsModule) return;
  try {
    await sharedDefaultsModule.clearSharedContent();
  } catch {
    // no-op
  }
}

export async function clearAppGroupSharedContentIfUnchanged(timestamp: number): Promise<boolean> {
  const sharedDefaultsModule = getSharedDefaultsModule();
  if (Platform.OS !== 'ios' || !sharedDefaultsModule) return false;
  if (!sharedDefaultsModule.clearSharedContentIfTimestampMatches) {
    return false;
  }
  try {
    return Boolean(await sharedDefaultsModule.clearSharedContentIfTimestampMatches(timestamp));
  } catch {
    return false;
  }
}

export async function setAppGroupUILanguage(language: string): Promise<void> {
  const sharedDefaultsModule = getSharedDefaultsModule();
  if (Platform.OS !== 'ios' || !sharedDefaultsModule?.setUILanguage) return;
  try {
    await sharedDefaultsModule.setUILanguage(language);
  } catch {
    // App Group sync is best-effort; never block settings persistence.
  }
}

export async function setAppGroupActiveUserId(userId: string | null): Promise<void> {
  if (Platform.OS === 'android') {
    await AndroidShareIntent.setActiveUserId(userId).catch(() => undefined);
    return;
  }
  const sharedDefaultsModule = getSharedDefaultsModule();
  if (Platform.OS !== 'ios' || !sharedDefaultsModule?.setActiveUserId) return;
  try {
    await sharedDefaultsModule.setActiveUserId(userId);
  } catch {
    // Account isolation is also enforced again before database ingest.
  }
}
