// WatermelonDB Migrations
// This file will contain schema migrations as the app evolves
// ⚠️ Always create migrations when changing the schema!

import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    // Example migration from v1 to v2:
    // {
    //   toVersion: 2,
    //   steps: [
    //     addColumns({
    //       table: 'cached_items',
    //       columns: [
    //         { name: 'new_field', type: 'string', isOptional: true },
    //       ],
    //     }),
    //   ],
    // },
  ],
});
