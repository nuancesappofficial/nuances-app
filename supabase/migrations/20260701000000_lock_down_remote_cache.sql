-- Legacy TestFlight builds still try to sync cached_items. Keep their inserts
-- compatible enough that saved cards can sync, but never retain or return the
-- private cache payload.

create or replace function public.redact_remote_cached_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.content_text := null;
  new.content_url := null;
  new.media_uri := null;
  new.source_app := null;
  new.user_keywords := null;
  new.image_annotations := null;
  new.ai_highlighted_terms := null;
  new.image_storage_path := null;
  new.audio_storage_path := null;
  new.expires_at := null;
  new.deleted_at := null;
  return new;
end;
$$;

drop trigger if exists redact_remote_cached_item_before_write on public.cached_items;
create trigger redact_remote_cached_item_before_write
before insert or update on public.cached_items
for each row execute function public.redact_remote_cached_item();

-- Old clients may insert their own redacted compatibility row, but no client
-- may download cache rows onto another installation.
drop policy if exists "Users can view their own cached items" on public.cached_items;
drop policy if exists "Users can update their own cached items" on public.cached_items;

-- Remove the row left behind by any client that raced the earlier purge.
update public.cards
set cached_item_id = null,
    updated_at = now()
where cached_item_id is not null;

delete from public.cached_items;
