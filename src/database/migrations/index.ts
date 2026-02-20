// WatermelonDB Migrations
// This file will contain schema migrations as the app evolves
// ⚠️ Always create migrations when changing the schema!

import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

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
  ],
});
