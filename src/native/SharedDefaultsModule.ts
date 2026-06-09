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

export interface SharedContentSnapshot {
  items: SharedContentItem[];
  timestamp: number;
}

function getSharedDefaultsModule():
  | {
      getSharedContent: () => Promise<unknown>;
      clearSharedContent: () => Promise<unknown>;
      clearSharedContentIfTimestampMatches?: (timestamp: number) => Promise<unknown>;
      setUILanguage?: (language: string) => Promise<unknown>;
    }
  | null {
  return (NativeModules.SharedDefaultsModule || null) as
    | {
        getSharedContent: () => Promise<unknown>;
        clearSharedContent: () => Promise<unknown>;
        clearSharedContentIfTimestampMatches?: (timestamp: number) => Promise<unknown>;
        setUILanguage?: (language: string) => Promise<unknown>;
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

  if (Array.isArray(normalizedRaw.items) && normalizedRaw.items.length > 0) {
    const valid: SharedContentItem[] = [];
    for (const item of normalizedRaw.items) {
      if (item && typeof item === 'object') {
        if (item.type === 'text' && typeof item.content === 'string') {
          valid.push({ type: 'text', content: item.content });
        } else if (item.type === 'image' && Array.isArray(item.images) && item.images.length > 0) {
          valid.push({ type: 'image', images: item.images });
        }
      }
    }
    return valid.length > 0 ? { items: valid, timestamp } : null;
  }

  if (normalizedRaw.type === 'text' && typeof normalizedRaw.content === 'string') {
    return { items: [{ type: 'text', content: normalizedRaw.content }], timestamp };
  }
  if (normalizedRaw.type === 'image' && Array.isArray(normalizedRaw.images) && normalizedRaw.images.length > 0) {
    return { items: [{ type: 'image', images: normalizedRaw.images }], timestamp };
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
    await clearAppGroupSharedContent();
    return true;
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
