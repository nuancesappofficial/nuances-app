alter table public.profiles
  add column if not exists english_level text,
  add column if not exists onboarding_completed boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_learning_goal_check;

alter table public.profiles
  add constraint profiles_learning_goal_check
  check (
    learning_goal is null
    or learning_goal in ('ielts', 'casual', 'professional', 'business', 'everyday', 'academic', 'slang')
  );

alter table public.profiles
  drop constraint if exists profiles_english_level_check;

alter table public.profiles
  add constraint profiles_english_level_check
  check (
    english_level is null
    or english_level in ('beginner', 'intermediate', 'advanced')
  );
