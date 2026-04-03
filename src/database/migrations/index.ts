// WatermelonDB Migrations
// This file will contain schema migrations as the app evolves
// ⚠️ Always create migrations when changing the schema!

import {
  schemaMigrations,
  addColumns,
  createTable,
} from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    // Migration from v1 to v2: Add Share Extension support fields
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'cached_items',
          columns: [
            { name: 'type', type: 'string', isOptional: true },
            { name: 'media_uri', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'cards',
          columns: [
            { name: 'part_of_speech', type: 'string', isOptional: true },
            { name: 'frequent_collocations', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        createTable({
          name: 'user_settings',
          columns: [
            { name: 'user_id', type: 'string', isIndexed: true },
            { name: 'is_premium', type: 'boolean' },
            { name: 'daily_voice_uses', type: 'number' },
            { name: 'last_voice_reset_date', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: 'cards',
          columns: [
            { name: 'image_url', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
  ],
});
