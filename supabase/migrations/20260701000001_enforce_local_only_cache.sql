-- Cache/local-stack data is device-only. Remove every client policy regardless
-- of its historical name, then revoke the PostgREST roles at the table level.
-- The service role remains available for account-deletion/maintenance jobs.
alter table public.cached_items enable row level security;

do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cached_items'
  loop
    execute format(
      'drop policy if exists %I on public.cached_items',
      policy_name
    );
  end loop;
end;
$$;

revoke all privileges on table public.cached_items from anon;
revoke all privileges on table public.cached_items from authenticated;

drop trigger if exists redact_remote_cached_item_before_write on public.cached_items;
drop function if exists public.redact_remote_cached_item();

-- A remote card must never retain a pointer to a cache row, including writes
-- from legacy clients that predate the local-only boundary.
create or replace function public.clear_remote_card_cache_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cached_item_id := null;
  return new;
end;
$$;

drop trigger if exists clear_remote_card_cache_reference_before_write on public.cards;
create trigger clear_remote_card_cache_reference_before_write
before insert or update of cached_item_id on public.cards
for each row execute function public.clear_remote_card_cache_reference();

-- Remove rows left by clients that raced the earlier purge.
update public.cards
set cached_item_id = null,
    updated_at = now()
where cached_item_id is not null;

delete from public.cached_items;
