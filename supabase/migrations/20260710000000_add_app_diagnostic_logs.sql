create table if not exists public.app_diagnostic_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  session_id text not null,
  level text not null check (level in ('debug', 'info', 'warn', 'error', 'fatal')),
  category text not null,
  event text not null,
  message text,
  context jsonb not null default '{}'::jsonb,
  runtime jsonb not null default '{}'::jsonb,
  platform text,
  os_version text,
  app_version text,
  build_version text
);

alter table public.app_diagnostic_logs enable row level security;

drop policy if exists "Users can insert their own diagnostic logs" on public.app_diagnostic_logs;
create policy "Users can insert their own diagnostic logs"
  on public.app_diagnostic_logs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can view their own diagnostic logs" on public.app_diagnostic_logs;
create policy "Users can view their own diagnostic logs"
  on public.app_diagnostic_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists app_diagnostic_logs_user_time_idx
  on public.app_diagnostic_logs (user_id, occurred_at desc);

create index if not exists app_diagnostic_logs_level_time_idx
  on public.app_diagnostic_logs (level, occurred_at desc);

create index if not exists app_diagnostic_logs_request_id_idx
  on public.app_diagnostic_logs (request_id);

create index if not exists app_diagnostic_logs_event_time_idx
  on public.app_diagnostic_logs (event, occurred_at desc);
