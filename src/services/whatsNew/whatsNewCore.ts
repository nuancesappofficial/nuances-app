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
};

export const LAST_SEEN_WHATS_NEW_KEY = 'nuances_last_seen_whats_new_version';

export interface StorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

export function resolveWhatsNewToDisplay(
  currentVersion: string,
  lastSeenVersion: string | null,
  config: Record<string, WhatsNewRelease>
): WhatsNewRelease | null {
  if (!currentVersion) return null;
  if (lastSeenVersion === currentVersion) return null;
  return config[currentVersion] || null;
}
