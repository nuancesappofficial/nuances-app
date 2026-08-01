-- Cache items are now local-only.
-- Purge legacy remote cached_items rows and detach any card references to them.

update public.cards
set cached_item_id = null,
    updated_at = now()
where cached_item_id is not null;

delete from public.cached_items;
