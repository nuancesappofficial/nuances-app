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

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { enforceLocalDataScopeForUser } from '@services/auth/localDataScope';
import { clearLocalAccountDataForUser } from '@services/account/AccountDeletionService';
import { clearUserSettings } from '@services/settings/userSettings';
import { loadUserSettings, saveUserSettings } from '@services/settings/userSettings';
import {
  createDevFreshUserId,
  setActiveDevFreshUserId,
  isDevFreshUserSimulatorEnabled,
  type DevFreshUserSession,
} from './devFreshUserSimulatorCore';
import { resolveAccountDeletionStorageKeys } from '../tour/tutorialFlowPolicy';

async function removeDirectoryIfExists(uri: string): Promise<void> {
  if (!uri) return;
  const info = await FileSystemLegacy.getInfoAsync(uri);
  if (info.exists) {
    await FileSystemLegacy.deleteAsync(uri, { idempotent: true });
  }
}

async function clearLocalAccountCaches(userId: string): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const keysToRemove = resolveAccountDeletionStorageKeys(allKeys, userId);
  if (keysToRemove.length > 0) {
    await AsyncStorage.multiRemove(keysToRemove);
  }

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
    await clearLocalAccountDataForUser(userId);
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
