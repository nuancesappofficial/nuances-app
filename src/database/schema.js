// WatermelonDB Schema
// ⚠️ 重要：每次修改此文件時，必須增加 version 號！
// Version: 1

import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 1,
  tables: [
    // ============================================
    // PROFILES TABLE
    // ============================================
    tableSchema({
      name: 'profiles',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'email', type: 'string' },
        { name: 'display_name', type: 'string', isOptional: true },
        { name: 'learning_goal', type: 'string', isOptional: true }, // 'ielts' | 'casual' | 'professional'
        { name: 'target_language', type: 'string' },
        { name: 'native_language', type: 'string' },
        { name: 'subscription_tier', type: 'string' }, // 'free' | 'pro'
        { name: 'subscription_expires_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ============================================
    // CACHED ITEMS TABLE
    // ============================================
    tableSchema({
      name: 'cached_items',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'content_type', type: 'string' }, // 'text' | 'url' | 'image' | 'video'
        { name: 'content_text', type: 'string', isOptional: true },
        { name: 'content_url', type: 'string', isOptional: true },
        { name: 'source_app', type: 'string', isOptional: true },
        { name: 'user_keywords', type: 'string', isOptional: true },
        { name: 'image_annotations', type: 'string', isOptional: true }, // JSON string
        { name: 'ai_highlighted_terms', type: 'string', isOptional: true }, // JSON string
        { name: 'ai_analysis_completed', type: 'boolean' },
        { name: 'image_storage_path', type: 'string', isOptional: true },
        { name: 'audio_storage_path', type: 'string', isOptional: true },
        { name: 'expires_at', type: 'number', isOptional: true },
        { name: 'converted_to_card', type: 'boolean' },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted_at', type: 'number', isOptional: true },
      ],
    }),

    // ============================================
    // CARDS TABLE
    // ============================================
    tableSchema({
      name: 'cards',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'cached_item_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'target_word', type: 'string' },
        { name: 'target_phrase', type: 'string', isOptional: true },
        { name: 'original_sentence', type: 'string' },
        { name: 'definition', type: 'string' },
        { name: 'contextual_explanation', type: 'string', isOptional: true },
        { name: 'phonetic_transcription', type: 'string', isOptional: true },
        { name: 'reference_audio_url', type: 'string', isOptional: true },
        { name: 'difficulty_level', type: 'number', isOptional: true },
        { name: 'tags', type: 'string', isOptional: true }, // JSON string array
        { name: 'source_app', type: 'string', isOptional: true },
        // SRS fields
        { name: 'ease_factor', type: 'number' },
        { name: 'interval_days', type: 'number' },
        { name: 'repetitions', type: 'number' },
        { name: 'next_review_at', type: 'number', isIndexed: true },
        { name: 'last_reviewed_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'deleted_at', type: 'number', isOptional: true },
      ],
    }),

    // ============================================
    // REVIEW HISTORY TABLE
    // ============================================
    tableSchema({
      name: 'review_history',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'card_id', type: 'string', isIndexed: true },
        { name: 'rating', type: 'number' }, // 1-4
        { name: 'time_spent_seconds', type: 'number', isOptional: true },
        { name: 'user_audio_url', type: 'string', isOptional: true },
        { name: 'pronunciation_score', type: 'number', isOptional: true },
        { name: 'pronunciation_feedback', type: 'string', isOptional: true }, // JSON string
        { name: 'reviewed_at', type: 'number', isIndexed: true },
      ],
    }),

    // ============================================
    // SYNC METADATA TABLE
    // ============================================
    tableSchema({
      name: 'sync_metadata',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'table_name', type: 'string' },
        { name: 'last_pulled_at', type: 'number' },
        { name: 'last_pushed_at', type: 'number' },
      ],
    }),
  ],
});
