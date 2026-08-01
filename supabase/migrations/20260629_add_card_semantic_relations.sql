alter table public.cards
  add column if not exists semantic_relations jsonb;

comment on column public.cards.semantic_relations is
  'Sense-specific synonyms and antonyms: {"synonyms":[{"term":"","translation":""}],"antonyms":[...]}';
