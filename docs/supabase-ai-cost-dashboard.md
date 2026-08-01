# Supabase AI Cost Dashboard

This dashboard records metered usage for OpenAI and Gemini card generation,
Azure pronunciation assessment, and Azure neural TTS. It stores no prompts,
sentences, target words, audio, or generated card content.

## What Is Recorded

- Taipei usage date and UTC timestamp
- Capability and generation stage (`full`, `core`, or `enrichment`)
- Provider and model
- Input, output, and total tokens
- Azure pronunciation audio seconds
- Azure TTS billable characters (including SSML billable markup)
- TTFT and total latency
- Success/cancelled state
- Historical USD token prices and the USD/TWD rate at write time

The tables use RLS and expose no policies to `anon` or `authenticated`. Only the Edge Function service role and Supabase Dashboard administrators can access them.

## Daily Cost

```sql
select
  usage_date_taipei,
  successful_calls,
  failed_calls,
  total_tokens,
  cost_usd,
  cost_twd
from public.ai_cost_daily_twd
order by usage_date_taipei desc;
```

## What Costs the Most

```sql
select
  capability,
  stage,
  provider,
  model_code,
  calls,
  successful_calls,
  failed_calls,
  retries,
  tokens,
  cost_usd,
  cost_twd
from public.ai_cost_breakdown_twd
order by cost_twd desc;
```

## Last 30 Days by Model

```sql
select
  provider,
  model_code,
  count(*) as calls,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  round(sum(estimated_cost_twd), 2) as cost_twd,
  round(avg(latency_ms)) as avg_latency_ms,
  round(avg(ttfb_ms)) as avg_ttfb_ms
from public.ai_cost_summary_twd
where occurred_at >= now() - interval '30 days'
group by provider, model_code
order by cost_twd desc;
```

## Missing Prices

Run this after adding or changing a model. Any result means its pricing row must be added before the estimate is complete.

```sql
select provider, model_code, count(*) as events, sum(total_tokens) as tokens
from public.ai_cost_summary_twd
where pricing_missing
group by provider, model_code
order by tokens desc;
```

Azure prices vary by resource region, billing offer, free/commitment tier, and
date. New Azure rows intentionally start with `usd_per_unit = null`, so the
dashboard reports `pricing_missing` instead of silently using a possibly wrong
price.

The current production Azure Speech resource is East Asia Free F0. Migration
`20260728000002_set_azure_speech_f0_pricing.sql` prices its metered usage at
zero while preserving audio-second and character quantities. Before changing
the Azure resource to a paid tier, close the F0 pricing range and insert the
new contracted rate.

Configure the project's actual rates from its Azure invoice or pricing
calculator:

```sql
update public.ai_model_pricing
set usd_per_unit = :speech_to_text_usd_per_hour / 3600
where provider = 'azure'
  and model_code = 'azure-speech-pronunciation-standard'
  and billing_unit = 'audio_seconds'
  and effective_to is null;

update public.ai_model_pricing
set usd_per_unit = :neural_tts_usd_per_million_characters / 1000000
where provider = 'azure'
  and model_code = 'azure-speech-neural-tts'
  and billing_unit = 'characters'
  and effective_to is null;
```

Microsoft documents pronunciation assessment baseline usage as Speech-to-Text
usage. Neural TTS is metered by billable characters. Do not copy a rate from a
different Azure region or contract.

## Unit economics

```sql
select
  usage_date_taipei,
  billed_users,
  successful_card_generations,
  total_cost_twd,
  cost_per_billed_user_twd,
  cost_per_successful_card_generation_twd
from public.ai_cost_unit_economics_twd
order by usage_date_taipei desc;
```

`billed_users` means users who caused at least one metered API call that day. It
is intentionally not labeled DAU; true DAU remains in PostHog.

## PostHog cost dashboard

After `POSTHOG_PROJECT_KEY` and `POSTHOG_HOST` are configured as Supabase Edge
Function secrets, every newly inserted ledger row is mirrored as
`api_cost_recorded`. The event contains only metering and pricing fields; it
does not include prompts, card content, target words, sentences, or audio.

Useful PostHog Trends:

- Total cost: `api_cost_recorded`, property math `Sum` of
  `estimated_cost_twd`
- API calls: `api_cost_recorded`, total count
- Cost by provider: break down by `provider`
- Cost by capability: break down by `capability`
- Missing prices: filter `pricing_missing = true`

## Cache effectiveness

Azure TTS cost events are written only on cache misses that call Azure. Cache
hits incur no Azure synthesis charge and therefore do not create a cost row.

## Update USD/TWD

The default rate is a configurable estimate, not a live FX feed. Updating it affects future events only, preserving historical estimates.

```sql
update public.ai_cost_settings
set usd_to_twd = 32.50,
    updated_at = now()
where id = true;
```

## Update Model Pricing

Do not overwrite historical rows when a provider changes pricing. Close the old effective range and insert a new row so past events remain reproducible.

```sql
update public.ai_model_pricing
set effective_to = now()
where provider = 'openai'
  and model_code = 'gpt-4o-mini'
  and effective_to is null;

insert into public.ai_model_pricing (
  provider,
  model_code,
  input_usd_per_million,
  output_usd_per_million,
  effective_from,
  source_url
)
values (
  'openai',
  'gpt-4o-mini',
  0.15,
  0.60,
  now(),
  'https://developers.openai.com/api/docs/models/gpt-4o-mini'
);
```

## Deployment

```bash
supabase db push
supabase functions deploy ai-proxy
supabase functions deploy tts-proxy
```

The ledger starts from deployment time. It cannot reconstruct historical calls that were never persisted.
