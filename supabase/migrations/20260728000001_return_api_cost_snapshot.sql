-- Return the immutable pricing snapshot so Edge Functions can mirror the
-- already-recorded cost to PostHog without recalculating prices.

drop function if exists public.record_ai_cost_event(
  text, uuid, text, text, text, text, text, integer, integer, integer,
  bigint, bigint, integer, integer, jsonb, timestamptz, text, numeric
);

create function public.record_ai_cost_event(
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
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pricing public.ai_model_pricing%rowtype;
  v_fx numeric(12, 6);
  v_event public.ai_usage_cost_events%rowtype;
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
  returning * into v_event;

  if v_event.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_event.id,
    'occurred_at', v_event.occurred_at,
    'capability', v_event.capability,
    'stage', v_event.stage,
    'provider', v_event.provider,
    'model_code', v_event.model_code,
    'status', v_event.status,
    'billing_unit', v_event.billing_unit,
    'billable_quantity', v_event.billable_quantity,
    'input_tokens', v_event.input_tokens,
    'output_tokens', v_event.output_tokens,
    'total_tokens', v_event.total_tokens,
    'estimated_cost_usd', v_event.estimated_cost_usd,
    'estimated_cost_twd', v_event.estimated_cost_twd,
    'pricing_missing', v_event.pricing_missing,
    'latency_ms', v_event.latency_ms
  );
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
