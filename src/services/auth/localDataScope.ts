import AsyncStorage from '@react-native-async-storage/async-storage';
import { database } from '@database/index';
import { resetUserSettingsMemoryCache } from '@services/settings/userSettings';
import { waitForSyncIdle } from '@services/sync';

const LAST_AUTH_USER_ID_KEY = 'nuances_last_auth_user_id_v1';
const SYNC_SCOPE_VERSION_KEY = 'nuances_sync_scope_version';
// v4 forces one safe full pull for existing installations. Earlier builds had
// a forceFullSync helper that did not actually clear WatermelonDB's cursor, so
// old same-owner cloud cards could remain invisible indefinitely.
const CURRENT_SYNC_SCOPE_VERSION = '4';
const LEGACY_UNSCOPED_ACCOUNT_KEYS = [
  'user_app_settings_v1',
  'deck_album_preferences_v1',
  'card_detail_sticky_notes_v1',
  'card_pronunciation_history_v1',
  'local_card_image_map_v1',
  'nuances_user_mistake_log_v1',
  'nuances_diagnostic_log_v1',
  'share_extension_ingest_events',
] as const;
const WATERMELON_SYNC_CURSOR_KEYS = [
  '__watermelon_last_pulled_at',
  '__watermelon_last_pulled_schema_version',
] as const;

let scopeTransitionQueue: Promise<void> = Promise.resolve();

function serializeScopeTransition(work: () => Promise<void>): Promise<void> {
  const result = scopeTransitionQueue.then(work, work);
  scopeTransitionQueue = result.catch(() => undefined);
  return result;
}

async function resetWatermelonSyncCursor(): Promise<void> {
  await Promise.all(
    WATERMELON_SYNC_CURSOR_KEYS.map((key) => database.adapter.removeLocal(key))
  );
}

async function migrateKnownOwnerLegacyKeys(
  previousUserId: string | null,
  currentUserId: string
): Promise<void> {
  if (previousUserId !== currentUserId) return;

  const legacyValues = await AsyncStorage.multiGet(LEGACY_UNSCOPED_ACCOUNT_KEYS);
  const scopedKeys = LEGACY_UNSCOPED_ACCOUNT_KEYS.map(
    (key) => `${key}:${currentUserId}`
  );
  const scopedValues = await AsyncStorage.multiGet(scopedKeys);
  const writes: Array<[string, string]> = [];

  legacyValues.forEach(([legacyKey, legacyValue], index) => {
    const scopedValue = scopedValues[index]?.[1];
    if (legacyValue !== null && scopedValue === null) {
      writes.push([`${legacyKey}:${currentUserId}`, legacyValue]);
    }
  });

  if (writes.length > 0) {
    await AsyncStorage.multiSet(writes);
  }
}

export async function enforceLocalDataScopeForUser(userId: string): Promise<void> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;

  return serializeScopeTransition(async () => {
    resetUserSettingsMemoryCache();
    await waitForSyncIdle(7000);
    const [previousUserId, existingSyncCursor, syncScopeVersion] = await Promise.all([
      AsyncStorage.getItem(LAST_AUTH_USER_ID_KEY),
      database.adapter.getLocal(WATERMELON_SYNC_CURSOR_KEYS[0]),
      AsyncStorage.getItem(SYNC_SCOPE_VERSION_KEY),
    ]);

    if (
      (previousUserId && previousUserId !== normalizedUserId) ||
      (!previousUserId && existingSyncCursor) ||
      syncScopeVersion !== CURRENT_SYNC_SCOPE_VERSION
    ) {
      // Rows stay on-device and remain isolated by user_id. Only the global
      // Watermelon sync cursor must reset when the active account changes.
      await resetWatermelonSyncCursor();
    }
    await AsyncStorage.multiSet([
      [LAST_AUTH_USER_ID_KEY, normalizedUserId],
      [SYNC_SCOPE_VERSION_KEY, CURRENT_SYNC_SCOPE_VERSION],
    ]);
    await migrateKnownOwnerLegacyKeys(previousUserId, normalizedUserId);
    await AsyncStorage.multiRemove(LEGACY_UNSCOPED_ACCOUNT_KEYS);
  });
}
