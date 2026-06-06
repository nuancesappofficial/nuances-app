alter table public.profiles
  add column if not exists ai_breakdown_mode text not null default 'context';

alter table public.profiles
  drop constraint if exists profiles_ai_breakdown_mode_check;

alter table public.profiles
  add constraint profiles_ai_breakdown_mode_check
  check (ai_breakdown_mode in ('short_punchy', 'context', 'deep_dive'));
