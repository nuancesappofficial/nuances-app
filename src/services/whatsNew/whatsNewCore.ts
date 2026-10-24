export type WhatsNewItem = {
  number: string;
  title: string;
  description?: string;
};

export type WhatsNewRelease = {
  version: string;
  title: string;
  badge?: string;
  subtitle?: string;
  items: WhatsNewItem[];
  localized?: Partial<Record<string, { title?: string; items: WhatsNewItem[] }>>;
};

export const LAST_SEEN_WHATS_NEW_KEY = 'nuances_last_seen_whats_new_version';

export interface StorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

export function resolveWhatsNewToDisplay(
  currentVersion: string,
  lastSeenVersion: string | null,
  isFirstInstall: boolean,
  config: Record<string, WhatsNewRelease>
): WhatsNewRelease | null {
  if (!currentVersion) return null;
  if (isFirstInstall) return null;
  if (lastSeenVersion === currentVersion) return null;
  return config[currentVersion] || null;
}

export async function checkIfBrandNewUser(storage: StorageAdapter): Promise<boolean> {
  const [firstOpen, lastUserId, settings] = await Promise.all([
    storage.getItem('@nuances/analytics/first-app-opened/v1'),
    storage.getItem('nuances_last_auth_user_id_v1'),
    storage.getItem('user_app_settings_v1'),
  ]);
  const hasExistingData = Boolean(firstOpen || lastUserId || settings);
  return !hasExistingData;
}

