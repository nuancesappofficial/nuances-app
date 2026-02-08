import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';
import type { LearningGoal, SubscriptionTier } from '../../types/database.types';

export default class Profile extends Model {
  static table = 'profiles';

  @field('user_id') userId!: string;
  @field('email') email!: string;
  @field('display_name') displayName?: string;
  @field('learning_goal') learningGoal?: LearningGoal;
  @field('target_language') targetLanguage!: string;
  @field('native_language') nativeLanguage!: string;
  @field('subscription_tier') subscriptionTier!: SubscriptionTier;
  @date('subscription_expires_at') subscriptionExpiresAt?: Date;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
