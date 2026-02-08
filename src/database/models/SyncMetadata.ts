import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class SyncMetadata extends Model {
  static table = 'sync_metadata';

  @field('user_id') userId!: string;
  @field('table_name') tableName!: string;
  @date('last_pulled_at') lastPulledAt!: Date;
  @date('last_pushed_at') lastPushedAt!: Date;
}
