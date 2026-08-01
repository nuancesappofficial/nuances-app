import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';

export type AlbumSortMode =
  | 'recently_added'
  | 'recently_reviewed'
  | 'alphabetical';

export const DEFAULT_ALBUM_SORT_MODE: AlbumSortMode = 'recently_added';

const ALBUM_SORT_PREFERENCES_KEY_PREFIX = 'deck_album_sort_preferences_v1';
const VALID_SORT_MODES = new Set<AlbumSortMode>([
  'recently_added',
  'recently_reviewed',
  'alphabetical',
]);

function normalizeSortMode(value: unknown): AlbumSortMode {
  return typeof value === 'string' &&
    VALID_SORT_MODES.has(value as AlbumSortMode)
    ? (value as AlbumSortMode)
    : DEFAULT_ALBUM_SORT_MODE;
}

function buildStorageKey(userId: string | null): string {
  return `${ALBUM_SORT_PREFERENCES_KEY_PREFIX}:${userId ?? 'guest'}`;
}

async function loadAllPreferences(): Promise<Record<string, AlbumSortMode>> {
  try {
    const userId = await getCurrentSessionUserId();
    const raw = await AsyncStorage.getItem(buildStorageKey(userId));
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).map(([albumId, mode]) => [
        albumId,
        normalizeSortMode(mode),
      ])
    );
  } catch (error) {
    console.warn('[AlbumSortPreferences] load failed:', error);
    return {};
  }
}

export async function loadAlbumSortMode(
  albumId: string
): Promise<AlbumSortMode> {
  const all = await loadAllPreferences();
  return all[albumId] ?? DEFAULT_ALBUM_SORT_MODE;
}

export async function saveAlbumSortMode(
  albumId: string,
  mode: AlbumSortMode
): Promise<void> {
  const userId = await getCurrentSessionUserId();
  const all = await loadAllPreferences();
  all[albumId] = normalizeSortMode(mode);
  await AsyncStorage.setItem(buildStorageKey(userId), JSON.stringify(all));
}
