-- Persistent, service-role-only AI cost ledger and Taipei-time dashboard views.

create extension if not exists pgcrypto;

create table if not exists public.ai_model_pricing (
  provider text not null check (provider in ('openai', 'gemini')),
  model_code text not null,
  input_usd_per_million numeric(14, 6) not null check (input_usd_per_million >= 0),
  output_usd_per_million numeric(14, 6) not null check (output_usd_per_million >= 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  primary key (provider, model_code, effective_from),
  check (effective_to is null or effective_to > effective_from)
);

create table if not exists public.ai_cost_settings (
  id boolean primary key default true check (id),
  usd_to_twd numeric(12, 6) not null default 32.5 check (usd_to_twd > 0),
  updated_at timestamptz not null default now()
);

insert into public.ai_cost_settings (id, usd_to_twd)
values (true, 32.5)
on conflict (id) do nothing;

create table if not exists public.ai_usage_cost_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  request_id text not null,
  attempt_index integer not null default 1 check (attempt_index > 0),
  user_id uuid references auth.users(id) on delete set null,
  capability text not null,
  stage text not null,
  provider text not null check (provider in ('openai', 'gemini')),
  model_code text not null,
  status text not null default 'success' check (status in ('success', 'error', 'cancelled')),
  provider_attempts integer not null default 1 check (provider_attempts >= 0),
  schema_retries integer not null default 0 check (schema_retries >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  total_tokens bigint generated always as (input_tokens + output_tokens) stored,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  ttfb_ms integer check (ttfb_ms is null or ttfb_ms >= 0),
  input_usd_per_million numeric(14, 6) not null default 0,
  output_usd_per_million numeric(14, 6) not null default 0,
  usd_to_twd numeric(12, 6) not null default 32.5,
  estimated_cost_usd numeric(18, 8) generated always as (
    ((input_tokens::numeric * input_usd_per_million) +
     (output_tokens::numeric * output_usd_per_million)) / 1000000
  ) stored,
  estimated_cost_twd numeric(18, 6) generated always as (
    (((input_tokens::numeric * input_usd_per_million) +
      (output_tokens::numeric * output_usd_per_million)) / 1000000) * usd_to_twd
  ) stored,
  pricing_missing boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (request_id, stage, attempt_index)
);

create index if not exists ai_usage_cost_events_occurred_at_idx
  on public.ai_usage_cost_events (occurred_at desc);
create index if not exists ai_usage_cost_events_breakdown_idx
  on public.ai_usage_cost_events (capability, stage, provider, model_code, occurred_at desc);
create index if not exists ai_usage_cost_events_user_idx
  on public.ai_usage_cost_events (user_id, occurred_at desc);

alter table public.ai_model_pricing enable row level security;
alter table public.ai_cost_settings enable row level security;
alter table public.ai_usage_cost_events enable row level security;

revoke all on public.ai_model_pricing from anon, authenticated;
revoke all on public.ai_cost_settings from anon, authenticated;
revoke all on public.ai_usage_cost_events from anon, authenticated;
grant all on public.ai_model_pricing to service_role;
grant all on public.ai_cost_settings to service_role;
grant all on public.ai_usage_cost_events to service_role;

create or replace function public.record_ai_cost_event(
  p_request_id text,
  p_user_id uuid,
  p_capability text,
  p_stage text,
  p_provider text,
  p_model_code text,
  p_status text default 'success',
  p_attempt_index integer default 1,
  p_provider_attempts integer default 1,
  p_schema_retries integer default 0,
  p_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_latency_ms integer default null,
  p_ttfb_ms integer default null,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pricing public.ai_model_pricing%rowtype;
  v_fx numeric(12, 6);
  v_id uuid;
begin
  select * into v_pricing
  from public.ai_model_pricing
  where provider = lower(p_provider)
    and model_code = p_model_code
    and effective_from <= p_occurred_at
    and (effective_to is null or effective_to > p_occurred_at)
  order by effective_from desc
  limit 1;

  select usd_to_twd into v_fx
  from public.ai_cost_settings
  where id = true;

  insert into public.ai_usage_cost_events (
    occurred_at, request_id, attempt_index, user_id, capability, stage,
    provider, model_code, status, provider_attempts, schema_retries,
    input_tokens, output_tokens, latency_ms, ttfb_ms,
    input_usd_per_million, output_usd_per_million, usd_to_twd,
    pricing_missing, metadata
  ) values (
    p_occurred_at,
    p_request_id,
    greatest(coalesce(p_attempt_index, 1), 1),
    p_user_id,
    p_capability,
    p_stage,
    lower(p_provider),
    p_model_code,
    p_status,
    greatest(coalesce(p_provider_attempts, 1), 0),
    greatest(coalesce(p_schema_retries, 0), 0),
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    p_latency_ms,
    p_ttfb_ms,
    coalesce(v_pricing.input_usd_per_million, 0),
    coalesce(v_pricing.output_usd_per_million, 0),
    coalesce(v_fx, 32.5),
    v_pricing.model_code is null,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (request_id, stage, attempt_index) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_ai_cost_event(
  text, uuid, text, text, text, text, text, integer, integer, integer,
  bigint, bigint, integer, integer, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_ai_cost_event(
  text, uuid, text, text, text, text, text, integer, integer, integer,
  bigint, bigint, integer, integer, jsonb, timestamptz
) to service_role;

create or replace view public.ai_cost_summary_twd
with (security_invoker = true)
as
select
  (occurred_at at time zone 'Asia/Taipei')::date as usage_date_taipei,
  occurred_at,
  request_id,
  user_id,
  capability,
  stage,
  provider,
  model_code,
  status,
  provider_attempts,
  schema_retries,
  input_tokens,
  output_tokens,
  total_tokens,
  latency_ms,
  ttfb_ms,
  estimated_cost_usd,
  estimated_cost_twd,
  pricing_missing
from public.ai_usage_cost_events;

create or replace view public.ai_cost_daily_twd
with (security_invoker = true)
as
select
  usage_date_taipei,
  count(*) filter (where status = 'success') as successful_calls,
  count(*) filter (where status <> 'success') as failed_calls,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  sum(total_tokens) as total_tokens,
  round(sum(estimated_cost_usd), 6) as cost_usd,
  round(sum(estimated_cost_twd), 2) as cost_twd
from public.ai_cost_summary_twd
group by usage_date_taipei;

create or replace view public.ai_cost_breakdown_twd
with (security_invoker = true)
as
select
  capability,
  stage,
  provider,
  model_code,
  count(*) as calls,
  count(*) filter (where status = 'success') as successful_calls,
  count(*) filter (where status <> 'success') as failed_calls,
  sum(schema_retries) as retries,
  sum(total_tokens) as tokens,
  round(sum(estimated_cost_usd), 6) as cost_usd,
  round(sum(estimated_cost_twd), 2) as cost_twd
from public.ai_cost_summary_twd
group by capability, stage, provider, model_code;

revoke all on public.ai_cost_summary_twd from anon, authenticated;
revoke all on public.ai_cost_daily_twd from anon, authenticated;
revoke all on public.ai_cost_breakdown_twd from anon, authenticated;
grant select on public.ai_cost_summary_twd to service_role;
grant select on public.ai_cost_daily_twd to service_role;
grant select on public.ai_cost_breakdown_twd to service_role;

-- Pricing snapshots in USD per one million text tokens. Update effective dates
-- instead of overwriting rows when providers change their public prices.
insert into public.ai_model_pricing (
  provider, model_code, input_usd_per_million, output_usd_per_million,
  effective_from, source_url, notes
)
values
  ('openai', 'gpt-4o-mini', 0.15, 0.60, '2024-07-18T00:00:00Z',
   'https://developers.openai.com/api/docs/models/gpt-4o-mini', 'Standard text token pricing'),
  ('gemini', 'gemini-3.5-flash', 1.50, 9.00, '2026-01-01T00:00:00Z',
   'https://ai.google.dev/gemini-api/docs/pricing', 'Standard paid-tier text pricing'),
  ('gemini', 'gemini-3.1-flash-lite', 0.25, 1.50, '2026-01-01T00:00:00Z',
   'https://ai.google.dev/gemini-api/docs/pricing', 'Standard paid-tier text pricing'),
  ('gemini', 'gemini-2.5-flash', 0.30, 2.50, '2025-06-01T00:00:00Z',
   'https://ai.google.dev/gemini-api/docs/pricing', 'Standard paid-tier text pricing'),
  ('gemini', 'gemini-2.5-flash-lite', 0.10, 0.40, '2025-06-01T00:00:00Z',
   'https://ai.google.dev/gemini-api/docs/pricing', 'Standard paid-tier text pricing')
on conflict (provider, model_code, effective_from) do update set
  input_usd_per_million = excluded.input_usd_per_million,
  output_usd_per_million = excluded.output_usd_per_million,
  source_url = excluded.source_url,
  notes = excluded.notes;
