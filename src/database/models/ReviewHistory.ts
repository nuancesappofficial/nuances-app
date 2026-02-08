import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, json, relation } from '@nozbe/watermelondb/decorators';
import type { ReviewRating, PronunciationFeedback } from '../../types/database.types';
import type Card from './Card';

export default class ReviewHistory extends Model {
  static table = 'review_history';

  static associations = {
    cards: { type: 'belongs_to', key: 'card_id' },
  } as const;

  @field('user_id') userId!: string;
  @field('card_id') cardId!: string;

  @relation('cards', 'card_id') card?: Card;

  @field('rating') rating!: ReviewRating;
  @field('time_spent_seconds') timeSpentSeconds?: number;
  @field('user_audio_url') userAudioUrl?: string;
  @field('pronunciation_score') pronunciationScore?: number;

  @json('pronunciation_feedback', (json) => json)
  pronunciationFeedback?: PronunciationFeedback;

  @readonly @date('reviewed_at') reviewedAt!: Date;
}
