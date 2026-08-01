create index if not exists idx_cards_user_updated_id
  on public.cards(user_id, updated_at, id);

create index if not exists idx_review_history_user_reviewed_id
  on public.review_history(user_id, reviewed_at, id);
