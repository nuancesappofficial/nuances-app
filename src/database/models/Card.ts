import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, json, relation } from '@nozbe/watermelondb/decorators';
import type CachedItem from './CachedItem';

export default class Card extends Model {
  static table = 'cards';

  static associations = {
    cached_items: { type: 'belongs_to', key: 'cached_item_id' },
  } as const;

  @field('user_id') userId!: string;
  @field('cached_item_id') cachedItemId?: string;

  @relation('cached_items', 'cached_item_id') cachedItem?: CachedItem;

  @field('target_word') targetWord!: string;
  @field('target_phrase') targetPhrase?: string;
  @field('original_sentence') originalSentence!: string;
  @field('definition') definition!: string;
  @field('contextual_explanation') contextualExplanation?: string;
  @field('phonetic_transcription') phoneticTranscription?: string;
  @field('reference_audio_url') referenceAudioUrl?: string;
  @field('difficulty_level') difficultyLevel?: number;

  @json('tags', (json) => json) tags?: string[];

  @field('source_app') sourceApp?: string;

  // SRS fields
  @field('ease_factor') easeFactor!: number;
  @field('interval_days') intervalDays!: number;
  @field('repetitions') repetitions!: number;
  @date('next_review_at') nextReviewAt!: Date;
  @date('last_reviewed_at') lastReviewedAt?: Date;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
  @date('deleted_at') deletedAt?: Date;
}
