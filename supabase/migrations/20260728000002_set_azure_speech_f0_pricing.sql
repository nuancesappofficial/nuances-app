-- The production Azure Speech resource is East Asia, Free F0.
-- F0 usage has no marginal charge; usage quantities remain recorded so quota
-- pressure is still visible. Add a new effective pricing row before upgrading
-- the Azure resource to a paid tier.

update public.ai_model_pricing
set usd_per_unit = 0,
    notes = 'East Asia Azure Speech Free F0; no marginal charge within the free quota.'
where provider = 'azure'
  and model_code in (
    'azure-speech-pronunciation-standard',
    'azure-speech-neural-tts'
  )
  and effective_to is null;

-- Existing events were also produced under the same F0 resource. Their usage
-- snapshots are therefore accurately priced at zero rather than left missing.
update public.ai_usage_cost_events
set unit_price_usd = 0,
    pricing_missing = false
where provider = 'azure'
  and model_code in (
    'azure-speech-pronunciation-standard',
    'azure-speech-neural-tts'
  )
  and pricing_missing;
