import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class UserSettings extends Model {
  static table = 'user_settings';

  @field('user_id') userId!: string;
  @field('is_premium') isPremium!: boolean;
  @field('daily_voice_uses') dailyVoiceUses!: number;
  @field('last_voice_reset_date') lastVoiceResetDate!: string;
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;
}
