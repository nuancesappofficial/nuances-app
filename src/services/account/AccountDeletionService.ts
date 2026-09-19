import { supabase } from '@services/supabase/client';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import { clearUserSettings } from '@services/settings/userSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { resolveAccountDeletionStorageKeys } from '@/features/tour/tutorialFlowPolicy';

const DELETE_ACCOUNT_FUNCTION_NAME = process.env.EXPO_PUBLIC_DELETE_ACCOUNT_FUNCTION_NAME || 'delete-account';

export type DeleteAccountResult = {
  deleted: boolean;
  userId?: string;
  steps?: Array<{
    name: string;
    deleted?: number | null;
    skipped?: boolean;
  }>;
};

export async function clearLocalAccountDataForUser(userId: string): Promise<void> {
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
      const records = await database.get(tableName).query(Q.where('user_id', userId)).fetch();
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

export async function clearLocalAccountCaches(userId: string): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const keysToRemove = resolveAccountDeletionStorageKeys(allKeys, userId);
  // Explicitly ensure user_app_settings_v1 and local_card_image_map_v1 scoped artifacts are purged
  const criticalKeys = [`user_app_settings_v1:${userId}`, `local_card_image_map_v1:${userId}`];
  for (const key of criticalKeys) {
    if (!keysToRemove.includes(key)) {
      keysToRemove.push(key);
    }
  }
  if (keysToRemove.length > 0) {
    await AsyncStorage.multiRemove(keysToRemove);
  }

  const documentDirectory = FileSystemLegacy.documentDirectory || '';
  await Promise.all([
    removeDirectoryIfExists(`${documentDirectory}card-images/${userId}/`),
    removeDirectoryIfExists(`${documentDirectory}SharedImages/${userId}/`),
  ]);
}

export async function deleteCurrentAccount(): Promise<DeleteAccountResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('You must be signed in to delete your account.');
  }

  const { data, error } = await supabase.functions.invoke<DeleteAccountResult>(DELETE_ACCOUNT_FUNCTION_NAME, {
    method: 'POST',
    body: {},
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    throw new Error(error.message || 'Account deletion failed.');
  }

  if (!data?.deleted) {
    throw new Error('Account deletion did not complete.');
  }

  try {
    await clearLocalAccountDataForUser(session.user.id);
  } catch (error) {
    console.warn('[AccountDeletion] local database cleanup failed:', error);
  }
  try {
    await clearLocalAccountCaches(session.user.id);
  } catch (error) {
    console.warn('[AccountDeletion] local cache cleanup failed:', error);
  }
  try {
    await clearUserSettings();
  } catch (error) {
    console.warn('[AccountDeletion] local settings cleanup failed:', error);
  }
  await supabase.auth.signOut();
  return data;
}

export default {
  deleteCurrentAccount,
};
