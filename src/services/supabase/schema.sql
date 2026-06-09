-- Nuances App - Supabase Database Schema
-- Version: 1.0.0
-- Date: 2026-02-08

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Row Level Security on all tables
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- ============================================
-- USERS TABLE (extends Supabase Auth)
-- ============================================
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    learning_goal TEXT CHECK (learning_goal IN ('ielts', 'casual', 'professional', 'business', 'everyday', 'academic', 'slang')),
    english_level TEXT CHECK (english_level IN ('beginner', 'intermediate', 'advanced')),
    target_language TEXT DEFAULT 'en',
    native_language TEXT DEFAULT 'zh-TW',
    ai_breakdown_mode TEXT NOT NULL DEFAULT 'context'
        CHECK (ai_breakdown_mode IN ('short_punchy', 'context', 'deep_dive')),
    onboarding_completed BOOLEAN NOT NULL DEFAULT false,
    has_seen_tour BOOLEAN NOT NULL DEFAULT false,
    subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro')),
    subscription_expires_at TIMESTAMPTZ,
    trial_started_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    pronunciation_used_today INTEGER NOT NULL DEFAULT 0 CHECK (pronunciation_used_today >= 0),
    last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.subscriptions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    provider TEXT NOT NULL DEFAULT 'revenuecat',
    product_id TEXT,
    entitlement_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'expired'
        CHECK (status IN ('active', 'expired', 'revoked', 'grace_period')),
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    environment TEXT,
    last_synced_at TIMESTAMPTZ,
    raw_event JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, provider, entitlement_id)
);

-- ============================================
-- CACHED ITEMS TABLE
-- ============================================
CREATE TABLE public.cached_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    
    -- Content
    content_type TEXT NOT NULL CHECK (content_type IN ('text', 'image', 'video')),
    content_text TEXT,
    content_url TEXT,
    source_app TEXT, -- e.g., 'Safari', 'Instagram', 'Reddit'
    
    -- Keywords & Annotations
    user_keywords TEXT, -- User-provided context from Share Extension
    image_annotations JSONB, -- Bounding boxes: [{ x, y, width, height }]
    
    -- AI Analysis
    ai_highlighted_terms JSONB, -- Array of highlighted words: ['term1', 'term2']
    ai_analysis_completed BOOLEAN DEFAULT FALSE,
    
    -- Storage
    image_storage_path TEXT, -- Supabase Storage path
    audio_storage_path TEXT, -- If video/audio content
    
    -- Metadata
    expires_at TIMESTAMPTZ, -- For free tier: created_at + 24 hours
    converted_to_card BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- Soft delete
);

-- ============================================
-- CARDS TABLE
-- ============================================
CREATE TABLE public.cards (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    cached_item_id UUID REFERENCES public.cached_items(id) ON DELETE SET NULL,
    
    -- Card Content
    target_word TEXT NOT NULL,
    target_phrase TEXT, -- Full phrase containing the word
    original_sentence TEXT NOT NULL, -- Context from cached item
    definition TEXT NOT NULL,
    part_of_speech TEXT, -- e.g. noun/verb/adjective
    contextual_explanation TEXT, -- AI-generated explanation
    frequent_collocations TEXT, -- frequent collocation or common phrase

    -- Pronunciation
    phonetic_transcription TEXT,
    reference_audio_url TEXT, -- Supabase Storage or TTS generated
    
    -- Metadata
    difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 5),
    tags TEXT[], -- e.g., ['slang', 'business', 'ielts']
    source_app TEXT,
    image_url TEXT, -- card cover image url/path stored in backend
    
    -- SRS Data
    ease_factor REAL DEFAULT 2.5,
    interval_days INTEGER DEFAULT 1,
    repetitions INTEGER DEFAULT 0,
    next_review_at TIMESTAMPTZ DEFAULT NOW(),
    last_reviewed_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================
-- REVIEW HISTORY TABLE
-- ============================================
CREATE TABLE public.review_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
    
    -- Review Data
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4), -- 1: Again, 2: Hard, 3: Good, 4: Easy
    time_spent_seconds INTEGER,
    
    -- Pronunciation Data (if applicable)
    user_audio_url TEXT,
    pronunciation_score REAL, -- 0-100 from Azure AI
    pronunciation_feedback JSONB, -- Detailed feedback from Azure
    
    -- Timestamps
    reviewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SYNC METADATA TABLE (for WatermelonDB sync)
-- ============================================
CREATE TABLE public.sync_metadata (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    table_name TEXT NOT NULL,
    last_pulled_at TIMESTAMPTZ DEFAULT NOW(),
    last_pushed_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, table_name)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_cached_items_user_id ON public.cached_items(user_id);
CREATE INDEX idx_cached_items_created_at ON public.cached_items(created_at DESC);
CREATE INDEX idx_cached_items_expires_at ON public.cached_items(expires_at);

CREATE INDEX idx_cards_user_id ON public.cards(user_id);
CREATE INDEX idx_cards_next_review_at ON public.cards(next_review_at);
CREATE INDEX idx_cards_cached_item_id ON public.cards(cached_item_id);

CREATE INDEX idx_review_history_user_id ON public.review_history(user_id);
CREATE INDEX idx_review_history_card_id ON public.review_history(card_id);
CREATE INDEX idx_review_history_reviewed_at ON public.review_history(reviewed_at DESC);
CREATE INDEX idx_subscriptions_user_status ON public.subscriptions(user_id, status);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Cached Items
ALTER TABLE public.cached_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own cached items"
    ON public.cached_items FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cached items"
    ON public.cached_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cached items"
    ON public.cached_items FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cached items"
    ON public.cached_items FOR DELETE
    USING (auth.uid() = user_id);

-- Cards
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own cards"
    ON public.cards FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cards"
    ON public.cards FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cards"
    ON public.cards FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cards"
    ON public.cards FOR DELETE
    USING (auth.uid() = user_id);

-- Review History
ALTER TABLE public.review_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own review history"
    ON public.review_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own review history"
    ON public.review_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id);

-- Sync Metadata
ALTER TABLE public.sync_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sync metadata"
    ON public.sync_metadata FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================
-- TRIGGERS FOR updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cached_items_updated_at
    BEFORE UPDATE ON public.cached_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cards_updated_at
    BEFORE UPDATE ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTION: Auto-create profile on signup
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- STORAGE BUCKETS (to be created in Supabase Dashboard)
-- ============================================

-- Bucket: 'cached-images'
-- - Public: false
-- - Allowed MIME types: image/jpeg, image/png, image/webp
-- - Max file size: 10MB

-- Bucket: 'audio-files'
-- - Public: false
-- - Allowed MIME types: audio/mpeg, audio/wav, audio/webm
-- - Max file size: 5MB

-- RLS policies for Storage:
-- Users can only access their own files (use user_id prefix in path)
