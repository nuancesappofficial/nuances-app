-- Service-role-only registry for distribution campaigns created by growth agents.

create extension if not exists pgcrypto;

create table if not exists public.growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null unique
    check (campaign_id ~ '^[a-z0-9_]+(?:-[a-z0-9_]+){4}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  owner_agent text not null
    check (owner_agent ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  manager text not null
    check (manager in ('content_creation', 'cold_messaging', 'engaging')),
  platform text not null
    check (platform ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  method text not null
    check (method ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists growth_campaigns_manager_status_idx
  on public.growth_campaigns (manager, status, created_at desc);
create index if not exists growth_campaigns_owner_agent_idx
  on public.growth_campaigns (owner_agent, created_at desc);

drop trigger if exists update_growth_campaigns_updated_at on public.growth_campaigns;
create trigger update_growth_campaigns_updated_at
before update on public.growth_campaigns
for each row execute function public.update_updated_at_column();

alter table public.growth_campaigns enable row level security;
revoke all on public.growth_campaigns from public, anon, authenticated;
grant all on public.growth_campaigns to service_role;

