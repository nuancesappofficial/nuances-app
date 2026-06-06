import { supabase } from '@services/supabase/client';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import { clearUserSettings } from '@services/settings/userSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystemLegacy from 'expo-file-system/legacy';

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

async function clearLocalAccountCaches(userId: string): Promise<void> {
  const keys = [
    'card_detail_sticky_notes_v1',
    'deck_album_preferences_v1',
    'local_card_image_map_v1',
    'card_pronunciation_history_v1',
    'share_extension_ingest_events',
    'nuances_trial_started_at',
    'nuances_trial_ends_at',
    `deck_review_prefs_v1:${userId}`,
    `deck_card_detail_seen_v1:${userId}`,
    `deck_quiz_reviewed_v1:${userId}`,
  ];
  await AsyncStorage.multiRemove(keys);

  const documentDirectory = FileSystemLegacy.documentDirectory || '';
  await Promise.all([
    removeDirectoryIfExists(`${documentDirectory}card-images/`),
    removeDirectoryIfExists(`${documentDirectory}SharedImages/`),
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
    await clearLocalAccountData(session.user.id);
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
