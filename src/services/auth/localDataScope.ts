import AsyncStorage from '@react-native-async-storage/async-storage';
import { database } from '@database/index';

const LAST_AUTH_USER_ID_KEY = 'nuances_last_auth_user_id_v1';
const USER_SCOPED_TABLES = [
  'cards',
  'cached_items',
  'review_history',
  'profiles',
  'sync_metadata',
  'user_settings',
] as const;

type UserScopedRecord = {
  userId?: string;
  prepareDestroyPermanently: () => unknown;
};

export async function enforceLocalDataScopeForUser(userId: string): Promise<void> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;

  await database.write(async () => {
    const preparedDeletes: unknown[] = [];

    for (const tableName of USER_SCOPED_TABLES) {
      const records = (await database.get(tableName).query().fetch()) as UserScopedRecord[];
      records.forEach((record) => {
        if (record.userId === normalizedUserId) return;
        preparedDeletes.push(record.prepareDestroyPermanently());
      });
    }

    if (preparedDeletes.length > 0) {
      await database.batch(...(preparedDeletes as any[]));
    }
  });

  await AsyncStorage.setItem(LAST_AUTH_USER_ID_KEY, normalizedUserId);
}

