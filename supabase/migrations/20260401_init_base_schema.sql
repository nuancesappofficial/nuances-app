-- Nuances base schema for a fresh Supabase project.
-- This migration intentionally creates the baseline tables that older incremental
-- migrations assume already exist in the previous project.

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  display_name text,
  learning_goal text check (learning_goal in ('ielts', 'casual', 'professional', 'business', 'everyday', 'academic', 'slang')),
  english_level text check (english_level in ('beginner', 'intermediate', 'advanced')),
  target_language text not null default 'en',
  native_language text not null default 'zh-TW',
  onboarding_completed boolean not null default false,
  has_seen_tour boolean not null default false,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'pro')),
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cached_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content_type text not null check (content_type in ('text', 'image', 'video')),
  type text check (type in ('text', 'image')),
  content_text text,
  content_url text,
  media_uri text,
  source_app text,
  user_keywords text,
  image_annotations jsonb,
  ai_highlighted_terms jsonb,
  ai_analysis_completed boolean not null default false,
  image_storage_path text,
  audio_storage_path text,
  expires_at timestamptz,
  converted_to_card boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.cards (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  cached_item_id uuid references public.cached_items(id) on delete set null,
  target_word text not null,
  target_phrase text,
  original_sentence text not null,
  definition text not null,
  part_of_speech text,
  contextual_explanation text,
  frequent_collocations text,
  phonetic_transcription text,
  reference_audio_url text,
  difficulty_level integer check (difficulty_level between 1 and 5),
  tags text[],
  source_app text,
  image_url text,
  ease_factor real not null default 2.5,
  interval_days integer not null default 1,
  repetitions integer not null default 0,
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.review_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  card_id uuid references public.cards(id) on delete cascade,
  rating integer not null check (rating between 1 and 4),
  time_spent_seconds integer,
  user_audio_url text,
  pronunciation_score real,
  pronunciation_feedback jsonb,
  reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_metadata (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  table_name text not null,
  last_pulled_at timestamptz not null default now(),
  last_pushed_at timestamptz not null default now(),
  unique (user_id, table_name)
);

create table if not exists public.cached_pronunciations (
  id uuid default gen_random_uuid() primary key,
  phrase text not null,
  voice text not null,
  audio_url text not null,
  created_at timestamptz not null default now(),
  unique (phrase, voice)
);

create index if not exists idx_cached_items_user_id on public.cached_items(user_id);
create index if not exists idx_cached_items_created_at on public.cached_items(created_at desc);
create index if not exists idx_cached_items_expires_at on public.cached_items(expires_at);
create index if not exists idx_cached_items_free_limit on public.cached_items(user_id, converted_to_card, deleted_at, created_at desc);

create index if not exists idx_cards_user_id on public.cards(user_id);
create index if not exists idx_cards_next_review_at on public.cards(next_review_at);
create index if not exists idx_cards_cached_item_id on public.cards(cached_item_id);

create index if not exists idx_review_history_user_id on public.review_history(user_id);
create index if not exists idx_review_history_card_id on public.review_history(card_id);
create index if not exists idx_review_history_reviewed_at on public.review_history(reviewed_at desc);

create index if not exists idx_cached_pronunciations_phrase_voice on public.cached_pronunciations(phrase, voice);

alter table public.profiles enable row level security;
alter table public.cached_items enable row level security;
alter table public.cards enable row level security;
alter table public.review_history enable row level security;
alter table public.sync_metadata enable row level security;
alter table public.cached_pronunciations enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can view their own profile') then
    create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can insert their own profile') then
    create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can update their own profile') then
    create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cached_items' and policyname = 'Users can view their own cached items') then
    create policy "Users can view their own cached items" on public.cached_items for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cached_items' and policyname = 'Users can insert their own cached items') then
    create policy "Users can insert their own cached items" on public.cached_items for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cached_items' and policyname = 'Users can update their own cached items') then
    create policy "Users can update their own cached items" on public.cached_items for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cached_items' and policyname = 'Users can delete their own cached items') then
    create policy "Users can delete their own cached items" on public.cached_items for delete using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cards' and policyname = 'Users can view their own cards') then
    create policy "Users can view their own cards" on public.cards for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cards' and policyname = 'Users can insert their own cards') then
    create policy "Users can insert their own cards" on public.cards for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cards' and policyname = 'Users can update their own cards') then
    create policy "Users can update their own cards" on public.cards for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cards' and policyname = 'Users can delete their own cards') then
    create policy "Users can delete their own cards" on public.cards for delete using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'review_history' and policyname = 'Users can view their own review history') then
    create policy "Users can view their own review history" on public.review_history for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'review_history' and policyname = 'Users can insert their own review history') then
    create policy "Users can insert their own review history" on public.review_history for insert with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sync_metadata' and policyname = 'Users can manage their own sync metadata') then
    create policy "Users can manage their own sync metadata" on public.sync_metadata for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_profiles_updated_at on public.profiles;
create trigger update_profiles_updated_at before update on public.profiles for each row execute function public.update_updated_at_column();

drop trigger if exists update_cached_items_updated_at on public.cached_items;
create trigger update_cached_items_updated_at before update on public.cached_items for each row execute function public.update_updated_at_column();

drop trigger if exists update_cards_updated_at on public.cards;
create trigger update_cards_updated_at before update on public.cards for each row execute function public.update_updated_at_column();

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cached-images', 'cached-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  ('audio_cache', 'audio_cache', true, 5242880, array['audio/mpeg', 'audio/mp3'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public can read Nuances public buckets') then
    create policy "Public can read Nuances public buckets" on storage.objects for select using (bucket_id in ('cached-images', 'audio_cache'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated users can upload cached images') then
    create policy "Authenticated users can upload cached images" on storage.objects for insert to authenticated with check (bucket_id = 'cached-images');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated users can update cached images') then
    create policy "Authenticated users can update cached images" on storage.objects for update to authenticated using (bucket_id = 'cached-images') with check (bucket_id = 'cached-images');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated users can delete cached images') then
    create policy "Authenticated users can delete cached images" on storage.objects for delete to authenticated using (bucket_id = 'cached-images');
  end if;
end $$;
