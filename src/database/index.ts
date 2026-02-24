import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

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
  jsi: true, // Enable JSI for better performance
  onSetUpError: (error) => {
    console.error('Database setup error:', error);
  },
});

// Create and export the database instance
export const database = new Database({
  adapter,
  modelClasses: [Profile, CachedItem, Card, ReviewHistory, SyncMetadata, UserSettings],
});
