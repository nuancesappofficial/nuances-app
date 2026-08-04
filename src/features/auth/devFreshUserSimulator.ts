// Dev-only fresh-user simulator.
//
// This module provides a narrow, dev-only bootstrap seam that lets an internal
// tester simulate a brand-new user WITHOUT real Supabase credentials. It is
// strictly gated behind __DEV__ / INTERNAL_TESTER_TOOLS and NEVER weakens the
// production auth requirement: the authenticated navigator still requires a
// real Supabase session in release builds.
//
// The simulated "session" is a plain object that only carries a synthetic user
// id. It is never persisted to SecureStore and is never sent to Supabase. It
// exists solely so the app's existing local bootstrap (local data scope, local
// onboarding/tour/default-card state) can run against a fresh, isolated id.

import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { database } from '@database/index';
import { enforceLocalDataScopeForUser } from '@services/auth/localDataScope';
import { clearUserSettings } from '@services/settings/userSettings';
import { loadUserSettings, saveUserSettings } from '@services/settings/userSettings';
import {
  createDevFreshUserId,
  setActiveDevFreshUserId,
  isDevFreshUserSimulatorEnabled,
  type DevFreshUserSession,
} from './devFreshUserSimulatorCore';

async function clearLocalAccountData(userId: string): Promise<void> {
  const tableNames = [
    'review_history',
    'cards',
    'cached_items',
    'sync_metadata',
    'user_settings',
    'profiles',
  ];

  await database.write(async () => {
    for (const tableName of tableNames) {
      const records = await database
        .get(tableName)
        .query(Q.where('user_id', userId))
        .fetch();
      await Promise.all(records.map((record) => record.destroyPermanently()));
    }
  });
}

async function removeDirectoryIfExists(uri: string): Promise<void> {
  if (!uri) return;
  const info = await FileSystemLegacy.getInfoAsync(uri);
  if (info.exists) {
    await FileSystemLegacy.deleteAsync(uri, { idempotent: true });
  }
}

async function clearLocalAccountCaches(userId: string): Promise<void> {
  const keys = [
    // Legacy unscoped keys
    'card_detail_sticky_notes_v1',
    'deck_album_preferences_v1',
    'local_card_image_map_v1',
    'card_pronunciation_history_v1',
    'user_app_settings_v1',
    'nuances_user_mistake_log_v1',
    'share_extension_ingest_events',
    // Current account-scoped keys
    `card_detail_sticky_notes_v1:${userId}`,
    `deck_album_preferences_v1:${userId}`,
    `local_card_image_map_v1:${userId}`,
    `nuances_card_image_upload_queue_v1:${userId}`,
    `card_pronunciation_history_v1:${userId}`,
    `user_app_settings_v1:${userId}`,
    `share_extension_ingest_events:${userId}`,
    'nuances_trial_started_at',
    'nuances_trial_ends_at',
    `deck_review_prefs_v1:${userId}`,
    `deck_album_sort_preferences_v1:${userId}`,
    `deck_card_detail_seen_v1:${userId}`,
    `deck_quiz_reviewed_v1:${userId}`,
    `nuances:tour_seen:${userId}`,
    `nuances:default_experience_card:v1:${userId}`,
  ];
  await AsyncStorage.multiRemove(keys);

  const documentDirectory = FileSystemLegacy.documentDirectory || '';
  await Promise.all([
    removeDirectoryIfExists(`${documentDirectory}card-images/${userId}/`),
    removeDirectoryIfExists(`${documentDirectory}SharedImages/${userId}/`),
  ]);
}

/**
 * Simulate a brand-new user locally. Returns a synthetic session carrying a
 * fresh, isolated user id. This is dev-only and must never be called from a
 * production path.
 */
export async function simulateFreshUser(): Promise<DevFreshUserSession> {
  if (!isDevFreshUserSimulatorEnabled()) {
    throw new Error('Dev fresh-user simulator is only available in dev builds.');
  }

  const userId = createDevFreshUserId();
  setActiveDevFreshUserId(userId);

  // Isolate the synthetic id from any previous account's local data scope.
  await enforceLocalDataScopeForUser(userId);

  // Reset local onboarding / tutorial / default-card / demo-data state so the
  // simulated user starts completely fresh.
  try {
    await clearLocalAccountData(userId);
  } catch (error) {
    console.warn('[DevFreshUser] local database cleanup failed:', error);
  }
  try {
    await clearLocalAccountCaches(userId);
  } catch (error) {
    console.warn('[DevFreshUser] local cache cleanup failed:', error);
  }
  try {
    await clearUserSettings();
  } catch (error) {
    console.warn('[DevFreshUser] local settings cleanup failed:', error);
  }

  const settings = await loadUserSettings();
  await saveUserSettings({
    ...settings,
    entitlementMode: 'premium',
    planType: 'premium',
    subscriptionExpiresAt: '2099-12-31T23:59:59.000Z',
  });

  return {
    access_token: `dev-fresh-user-token-${userId}`,
    user: {
      id: userId,
      email: 'dev-fresh-user@local.dev',
      app_metadata: {},
      user_metadata: {},
    },
  };
}

export {
  createDevFreshUserId,
  isDevFreshUserId,
  isDevFreshUserSimulatorEnabled,
  type DevFreshUserSession,
} from './devFreshUserSimulatorCore';
