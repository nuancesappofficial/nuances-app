-- Migration: Add realtime messaging system (Push Tokens, In-App Messages, Read Receipts)

-- 1. User Push Tokens
create table if not exists public.user_push_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  push_token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  app_version text,
  updated_at timestamptz not null default now(),
  primary key (user_id, push_token)
);

alter table public.user_push_tokens enable row level security;

drop policy if exists "Users can manage their own push tokens" on public.user_push_tokens;
create policy "Users can manage their own push tokens"
  on public.user_push_tokens
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. App Messages (Announcements & Real-time Messages)
create table if not exists public.app_messages (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'both' check (type in ('push', 'in_app', 'both')),
  title text not null,
  body text not null,
  target_type text not null default 'all' check (target_type in ('all', 'user')),
  target_user_id uuid references auth.users(id) on delete cascade,
  target_email text,
  action_url text,
  action_text text,
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table public.app_messages enable row level security;

drop policy if exists "Users can view active messages addressed to them or all" on public.app_messages;
create policy "Users can view active messages addressed to them or all"
  on public.app_messages
  for select
  to authenticated
  using (
    is_active = true
    and (expires_at is null or expires_at > now())
    and (target_type = 'all' or target_user_id = auth.uid())
  );

-- Enable Supabase Realtime broadcast on app_messages
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    alter publication supabase_realtime add table public.app_messages;
  end if;
exception when others then
  null;
end $$;

-- 3. User Read Messages (Tracks which messages a user has seen/dismissed)
create table if not exists public.user_read_messages (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.app_messages(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

alter table public.user_read_messages enable row level security;

drop policy if exists "Users can manage their read message receipts" on public.user_read_messages;
create policy "Users can manage their read message receipts"
  on public.user_read_messages
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
