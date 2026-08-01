-- Allow each account one real pronunciation assessment for the default demo quiz.
-- Failed provider requests remain retryable, while successful assessments are final.
create table if not exists public.demo_pronunciation_consumptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fixture_version text not null,
  status text not null default 'processing'
    check (status in ('processing', 'success', 'failed')),
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.demo_pronunciation_consumptions enable row level security;

revoke all on public.demo_pronunciation_consumptions from anon, authenticated;
grant all on public.demo_pronunciation_consumptions to service_role;
