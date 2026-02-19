import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, json } from '@nozbe/watermelondb/decorators';
import type { ContentType, ImageAnnotation } from '../../types/database.types';

export default class CachedItem extends Model {
  static table = 'cached_items';

  @field('user_id') userId!: string;
  @field('content_type') contentType!: ContentType;
  @field('type') type?: 'text' | 'image'; // Share Extension 專用
  @field('content_text') contentText?: string;
  @field('content_url') contentUrl?: string;
  @field('media_uri') mediaUri?: string; // Share Extension 圖片本地路徑
  @field('source_app') sourceApp?: string;
  @field('user_keywords') userKeywords?: string;

  @json('image_annotations', (json) => json) imageAnnotations?: ImageAnnotation[];
  @json('ai_highlighted_terms', (json) => json) aiHighlightedTerms?: string[];

  @field('ai_analysis_completed') aiAnalysisCompleted!: boolean;
  @field('image_storage_path') imageStoragePath?: string;
  @field('audio_storage_path') audioStoragePath?: string;
  @date('expires_at') expiresAt?: Date;
  @field('converted_to_card') convertedToCard!: boolean;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
  @date('deleted_at') deletedAt?: Date;
}
