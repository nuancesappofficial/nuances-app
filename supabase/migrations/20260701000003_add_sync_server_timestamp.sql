-- WatermelonDB requires a server-authoritative pull timestamp. A device clock
-- can be wrong or ahead of PostgreSQL and must never become the sync cursor.
create or replace function public.sync_server_timestamp_ms()
returns bigint
language sql
volatile
set search_path = ''
as $$
  select floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

revoke all on function public.sync_server_timestamp_ms() from public;
revoke all on function public.sync_server_timestamp_ms() from anon;
grant execute on function public.sync_server_timestamp_ms() to authenticated;

comment on function public.sync_server_timestamp_ms() is
  'Returns the PostgreSQL clock in epoch milliseconds for WatermelonDB cursors.';
