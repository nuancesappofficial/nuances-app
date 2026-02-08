import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import schema from './schema';
import {
  Profile,
  CachedItem,
  Card,
  ReviewHistory,
  SyncMetadata,
} from './models';

// Create the SQLite adapter
const adapter = new SQLiteAdapter({
  schema,
  // (Optional) migrations can be added here when schema changes
  // migrations,
  jsi: true, // Enable JSI for better performance
  onSetUpError: (error) => {
    console.error('Database setup error:', error);
  },
});

// Create and export the database instance
export const database = new Database({
  adapter,
  modelClasses: [Profile, CachedItem, Card, ReviewHistory, SyncMetadata],
});
