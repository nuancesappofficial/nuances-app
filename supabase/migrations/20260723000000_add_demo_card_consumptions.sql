-- Each account may consume the onboarding card fixture exactly once.
create table if not exists public.demo_card_consumptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fixture_version text not null,
  consumed_at timestamptz not null default now()
);

alter table public.demo_card_consumptions enable row level security;

revoke all on public.demo_card_consumptions from anon, authenticated;
grant all on public.demo_card_consumptions to service_role;

