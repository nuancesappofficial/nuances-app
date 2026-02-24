// Supabase Database Types
// Generated types based on schema.sql

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      cached_items: {
        Row: CachedItem;
        Insert: CachedItemInsert;
        Update: CachedItemUpdate;
      };
      cards: {
        Row: Card;
        Insert: CardInsert;
        Update: CardUpdate;
      };
      review_history: {
        Row: ReviewHistory;
        Insert: ReviewHistoryInsert;
        Update: ReviewHistoryUpdate;
      };
      sync_metadata: {
        Row: SyncMetadata;
        Insert: SyncMetadataInsert;
        Update: SyncMetadataUpdate;
      };
    };
  };
}

// Profile Types
export type LearningGoal = 'ielts' | 'casual' | 'professional';
export type SubscriptionTier = 'free' | 'pro';

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  learning_goal: LearningGoal | null;
  target_language: string;
  native_language: string;
  subscription_tier: SubscriptionTier;
  subscription_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileInsert = Omit<
  Profile,
  'created_at' | 'updated_at' | 'id'
> & {
  id: string;
};

export type ProfileUpdate = Partial<Omit<Profile, 'id' | 'created_at'>>;

// Cached Item Types
export type ContentType = 'text' | 'image' | 'video';

export type ImageAnnotation = {
  // Legacy rectangle annotation fields
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // OCR block fields used by current image pipeline
  id?: string;
  text?: string;
  frame?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence?: number;
};

export type CachedItem = {
  id: string;
  user_id: string;
  content_type: ContentType;
  content_text: string | null;
  content_url: string | null;
  source_app: string | null;
  user_keywords: string | null;
  image_annotations: ImageAnnotation[] | null;
  ai_highlighted_terms: string[] | null;
  ai_analysis_completed: boolean;
  image_storage_path: string | null;
  audio_storage_path: string | null;
  expires_at: string | null;
  converted_to_card: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CachedItemInsert = Omit<
  CachedItem,
  'id' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export type CachedItemUpdate = Partial<
  Omit<CachedItem, 'id' | 'user_id' | 'created_at'>
>;

// Card Types
export type Card = {
  id: string;
  user_id: string;
  cached_item_id: string | null;
  target_word: string;
  target_phrase: string | null;
  original_sentence: string;
  definition: string;
  contextual_explanation: string | null;
  phonetic_transcription: string | null;
  reference_audio_url: string | null;
  difficulty_level: number | null;
  tags: string[] | null;
  source_app: string | null;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CardInsert = Omit<
  Card,
  'id' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export type CardUpdate = Partial<
  Omit<Card, 'id' | 'user_id' | 'created_at'>
>;

// Review History Types
export type ReviewRating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export type PronunciationFeedback = {
  accuracy_score: number;
  fluency_score: number;
  completeness_score: number;
  prosody_score: number;
  phonemes: {
    phoneme: string;
    accuracy_score: number;
  }[];
  words: {
    word: string;
    accuracy_score: number;
    error_type?: string;
  }[];
  feedback_text: string;
};

export type ReviewHistory = {
  id: string;
  user_id: string;
  card_id: string;
  rating: ReviewRating;
  time_spent_seconds: number | null;
  user_audio_url: string | null;
  pronunciation_score: number | null;
  pronunciation_feedback: PronunciationFeedback | null;
  reviewed_at: string;
};

export type ReviewHistoryInsert = Omit<ReviewHistory, 'id' | 'reviewed_at'>;

export type ReviewHistoryUpdate = Partial<
  Omit<ReviewHistory, 'id' | 'user_id' | 'card_id'>
>;

// Sync Metadata Types
export type SyncMetadata = {
  id: string;
  user_id: string;
  table_name: string;
  last_pulled_at: string;
  last_pushed_at: string;
};

export type SyncMetadataInsert = Omit<SyncMetadata, 'id'>;

export type SyncMetadataUpdate = Partial<
  Omit<SyncMetadata, 'id' | 'user_id' | 'table_name'>
>;
