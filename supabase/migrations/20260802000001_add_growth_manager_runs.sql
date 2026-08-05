-- Auditable manager reports and approval-gated sub-agent task queue.

create table if not exists public.growth_manager_runs (
  id uuid primary key default gen_random_uuid(),
  manager text not null check (manager = 'content_creation'),
  minimum_views integer not null check (minimum_views > 0),
  report jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.growth_campaign_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  manager_run_id uuid not null references public.growth_manager_runs(id) on delete cascade,
  campaign_id text not null references public.growth_campaigns(campaign_id) on delete cascade,
  views integer not null check (views >= 0),
  engagements integer not null check (engagements >= 0),
  card_creators integer not null check (card_creators >= 0),
  paying_users integer not null check (paying_users >= 0),
  observed_at timestamptz not null default now()
);

create table if not exists public.growth_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  manager_run_id uuid not null references public.growth_manager_runs(id) on delete cascade,
  campaign_id text not null references public.growth_campaigns(campaign_id) on delete cascade,
  assigned_agent text not null
    check (assigned_agent ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  action text not null
    check (action in ('create_more_variants', 'create_revised_variant')),
  brief text not null check (char_length(btrim(brief)) between 1 and 500),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'running', 'completed', 'cancelled')),
  requires_approval boolean not null default true check (requires_approval),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists growth_manager_runs_created_at_idx
  on public.growth_manager_runs (created_at desc);
create index if not exists growth_performance_campaign_idx
  on public.growth_campaign_performance_snapshots (campaign_id, observed_at desc);
create index if not exists growth_agent_tasks_queue_idx
  on public.growth_agent_tasks (assigned_agent, status, created_at);

drop trigger if exists update_growth_agent_tasks_updated_at on public.growth_agent_tasks;
create trigger update_growth_agent_tasks_updated_at
before update on public.growth_agent_tasks
for each row execute function public.update_updated_at_column();

alter table public.growth_manager_runs enable row level security;
alter table public.growth_campaign_performance_snapshots enable row level security;
alter table public.growth_agent_tasks enable row level security;

revoke all on public.growth_manager_runs from public, anon, authenticated;
revoke all on public.growth_campaign_performance_snapshots from public, anon, authenticated;
revoke all on public.growth_agent_tasks from public, anon, authenticated;
grant all on public.growth_manager_runs to service_role;
grant all on public.growth_campaign_performance_snapshots to service_role;
grant all on public.growth_agent_tasks to service_role;

