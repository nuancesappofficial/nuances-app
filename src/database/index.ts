import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { Platform } from 'react-native';

import schema from './schema';
import migrations from './migrations';
import {
  Profile,
  CachedItem,
  Card,
  ReviewHistory,
  SyncMetadata,
  UserSettings,
} from './models';

// Create the SQLite adapter
const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: Platform.OS === 'ios', // JSI is stable on iOS; Android uses standard bridge
  onSetUpError: (error) => {
    console.error('Database setup error:', error);
  },
});

// Create and export the database instance
export const database = new Database({
  adapter,
  modelClasses: [Profile, CachedItem, Card, ReviewHistory, SyncMetadata, UserSettings],
});
