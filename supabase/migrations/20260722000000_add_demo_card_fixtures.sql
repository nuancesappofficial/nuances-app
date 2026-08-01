-- Provider-generated tutorial cards are immutable, service-role-only fixtures.
-- The mobile client can read them only through the authenticated ai-proxy action.
create table if not exists public.demo_card_fixtures (
  fixture_key text primary key,
  fixture_version text not null,
  reply_language text not null,
  response jsonb not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_version, reply_language)
);

alter table public.demo_card_fixtures enable row level security;

revoke all on public.demo_card_fixtures from anon, authenticated;
grant all on public.demo_card_fixtures to service_role;

