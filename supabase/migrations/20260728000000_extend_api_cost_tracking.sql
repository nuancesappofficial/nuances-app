-- Extend the token-only AI ledger to metered APIs such as Azure Speech.
-- Azure prices vary by region, offer, and commitment tier, so the migration
-- records exact usage but intentionally flags Azure prices as missing until
-- the project's contracted rates are entered.

drop view if exists public.ai_cost_unit_economics_twd;
drop view if exists public.ai_cost_breakdown_twd;
drop view if exists public.ai_cost_daily_twd;
drop view if exists public.ai_cost_summary_twd;

alter table public.ai_model_pricing
  drop constraint if exists ai_model_pricing_provider_check;
alter table public.ai_model_pricing
  add constraint ai_model_pricing_provider_check
  check (provider in ('openai', 'gemini', 'azure'));

alter table public.ai_model_pricing
  add column if not exists billing_unit text not null default 'tokens'
    check (billing_unit in ('tokens', 'characters', 'audio_seconds', 'requests')),
  add column if not exists usd_per_unit numeric(18, 10)
    check (usd_per_unit is null or usd_per_unit >= 0);

alter table public.ai_usage_cost_events
  drop constraint if exists ai_usage_cost_events_provider_check;
alter table public.ai_usage_cost_events
  add constraint ai_usage_cost_events_provider_check
  check (provider in ('openai', 'gemini', 'azure'));

alter table public.ai_usage_cost_events
  add column if not exists billing_unit text not null default 'tokens'
    check (billing_unit in ('tokens', 'characters', 'audio_seconds', 'requests')),
  add column if not exists billable_quantity numeric(18, 4) not null default 0
    check (billable_quantity >= 0),
  add column if not exists unit_price_usd numeric(18, 10) not null default 0
    check (unit_price_usd >= 0);

alter table public.ai_usage_cost_events
  drop column if exists estimated_cost_usd,
  drop column if exists estimated_cost_twd;

alter table public.ai_usage_cost_events
  add column estimated_cost_usd numeric(18, 8) generated always as (
    case
      when billing_unit = 'tokens' then
        ((input_tokens::numeric * input_usd_per_million) +
         (output_tokens::numeric * output_usd_per_million)) / 1000000
      else billable_quantity * unit_price_usd
    end
  ) stored,
  add column estimated_cost_twd numeric(18, 6) generated always as (
    (case
      when billing_unit = 'tokens' then
        ((input_tokens::numeric * input_usd_per_million) +
         (output_tokens::numeric * output_usd_per_million)) / 1000000
      else billable_quantity * unit_price_usd
    end) * usd_to_twd
  ) stored;

drop function if exists public.record_ai_cost_event(
  text, uuid, text, text, text, text, text, integer, integer, integer,
  bigint, bigint, integer, integer, jsonb, timestamptz
);

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
  p_occurred_at timestamptz default now(),
  p_billing_unit text default 'tokens',
  p_billable_quantity numeric default 0
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
    and billing_unit = p_billing_unit
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
    input_tokens, output_tokens, billing_unit, billable_quantity,
    latency_ms, ttfb_ms, input_usd_per_million, output_usd_per_million,
    unit_price_usd, usd_to_twd, pricing_missing, metadata
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
    p_billing_unit,
    greatest(coalesce(p_billable_quantity, 0), 0),
    p_latency_ms,
    p_ttfb_ms,
    coalesce(v_pricing.input_usd_per_million, 0),
    coalesce(v_pricing.output_usd_per_million, 0),
    coalesce(v_pricing.usd_per_unit, 0),
    coalesce(v_fx, 32.5),
    case
      when p_billing_unit = 'tokens' then v_pricing.model_code is null
      else v_pricing.model_code is null or v_pricing.usd_per_unit is null
    end,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (request_id, stage, attempt_index) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_ai_cost_event(
  text, uuid, text, text, text, text, text, integer, integer, integer,
  bigint, bigint, integer, integer, jsonb, timestamptz, text, numeric
) from public, anon, authenticated;
grant execute on function public.record_ai_cost_event(
  text, uuid, text, text, text, text, text, integer, integer, integer,
  bigint, bigint, integer, integer, jsonb, timestamptz, text, numeric
) to service_role;

insert into public.ai_model_pricing (
  provider, model_code, input_usd_per_million, output_usd_per_million,
  billing_unit, usd_per_unit, effective_from, source_url, notes
)
values
  (
    'azure',
    'azure-speech-pronunciation-standard',
    0,
    0,
    'audio_seconds',
    null,
    '2026-01-01T00:00:00Z',
    'https://azure.microsoft.com/pricing/details/speech/',
    'Set usd_per_unit to the project Speech-to-Text price per audio second.'
  ),
  (
    'azure',
    'azure-speech-neural-tts',
    0,
    0,
    'characters',
    null,
    '2026-01-01T00:00:00Z',
    'https://azure.microsoft.com/pricing/details/speech/',
    'Set usd_per_unit to the project neural TTS price per billable character.'
  )
on conflict (provider, model_code, effective_from) do update set
  billing_unit = excluded.billing_unit,
  source_url = excluded.source_url,
  notes = excluded.notes;

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
  billing_unit,
  billable_quantity,
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
  count(distinct user_id) as billed_users,
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
  billing_unit,
  count(*) as calls,
  count(*) filter (where status = 'success') as successful_calls,
  count(*) filter (where status <> 'success') as failed_calls,
  sum(schema_retries) as retries,
  sum(total_tokens) as tokens,
  round(sum(billable_quantity), 2) as billable_quantity,
  round(sum(estimated_cost_usd), 6) as cost_usd,
  round(sum(estimated_cost_twd), 2) as cost_twd
from public.ai_cost_summary_twd
group by capability, stage, provider, model_code, billing_unit;

create or replace view public.ai_cost_unit_economics_twd
with (security_invoker = true)
as
select
  usage_date_taipei,
  count(distinct user_id) as billed_users,
  count(*) filter (
    where capability = 'generate_card' and status = 'success'
  ) as successful_card_generations,
  round(sum(estimated_cost_twd), 2) as total_cost_twd,
  round(
    sum(estimated_cost_twd) /
      nullif(count(distinct user_id), 0),
    4
  ) as cost_per_billed_user_twd,
  round(
    sum(estimated_cost_twd) filter (where capability = 'generate_card') /
      nullif(count(*) filter (
        where capability = 'generate_card' and status = 'success'
      ), 0),
    4
  ) as cost_per_successful_card_generation_twd
from public.ai_cost_summary_twd
group by usage_date_taipei;

revoke all on public.ai_cost_unit_economics_twd from anon, authenticated;
grant select on public.ai_cost_unit_economics_twd to service_role;
revoke all on public.ai_cost_summary_twd from anon, authenticated;
revoke all on public.ai_cost_daily_twd from anon, authenticated;
revoke all on public.ai_cost_breakdown_twd from anon, authenticated;
grant select on public.ai_cost_summary_twd to service_role;
grant select on public.ai_cost_daily_twd to service_role;
grant select on public.ai_cost_breakdown_twd to service_role;
