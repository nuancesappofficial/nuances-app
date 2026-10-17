-- Add pricing snapshot for GPT-5.6 Terra & Luna
insert into public.ai_model_pricing (
  provider, model_code, input_usd_per_million, output_usd_per_million,
  effective_from, source_url, notes
)
values
  ('openai', 'gpt-5.6-terra', 0.25, 1.00, '2026-10-17T00:00:00Z',
   'https://developers.openai.com/api/docs/models/gpt-5.6-terra', 'Standard text token pricing snapshot'),
  ('openai', 'gpt-5.6-luna', 0.05, 0.20, '2026-10-17T00:00:00Z',
   'https://developers.openai.com/api/docs/models/gpt-5.6-luna', 'Standard text token pricing snapshot')
on conflict (provider, model_code, effective_from) do update set
  input_usd_per_million = excluded.input_usd_per_million,
  output_usd_per_million = excluded.output_usd_per_million,
  source_url = excluded.source_url,
  notes = excluded.notes;
