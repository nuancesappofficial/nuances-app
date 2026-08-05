-- Reviewable output from content sub-agents. Publishing stays out of scope.

create table if not exists public.growth_content_drafts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.growth_agent_tasks(id) on delete cascade,
  campaign_id text not null references public.growth_campaigns(campaign_id) on delete cascade,
  agent text not null check (agent ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  platform text not null,
  method text not null,
  source_brief jsonb not null,
  script jsonb not null,
  tracking_url text not null,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'rejected', 'published')),
  requires_publish_approval boolean not null default true check (requires_publish_approval),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists growth_content_drafts_review_queue_idx
  on public.growth_content_drafts (status, created_at desc);

drop trigger if exists update_growth_content_drafts_updated_at on public.growth_content_drafts;
create trigger update_growth_content_drafts_updated_at
before update on public.growth_content_drafts
for each row execute function public.update_updated_at_column();

alter table public.growth_content_drafts enable row level security;
revoke all on public.growth_content_drafts from public, anon, authenticated;
grant all on public.growth_content_drafts to service_role;
