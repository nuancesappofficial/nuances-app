-- Free starter allowance keyed by email instead of user_id.
--
-- Root cause of the abuse: allowance was counted per user_id, and the
-- generation rows were cascade-deleted when the auth user was deleted.
-- Re-registering the same email produced a fresh user_id with zero usage,
-- granting a fresh 20-card allowance forever.
--
-- Fix (方案 A): count allowance by normalized email so it survives account
-- deletion. The generation rows are no longer cascade-deleted with the auth
-- user, and the counting key is the email, so a re-registered user with the
-- same email inherits the original consumption.
--
-- Email-less users (e.g. phone-only) fall back to user_id counting to keep
-- their existing behaviour intact.

-- 1) Drop the cascade FK on user_id so deleting an auth user no longer wipes
--    the generation history that the allowance count depends on.
alter table public.free_starter_card_generations
  drop constraint if exists free_starter_card_generations_user_id_fkey;

-- 2) Add the email counting key. Nullable because legacy rows predate it.
alter table public.free_starter_card_generations
  add column if not exists email text;

-- 3) Backfill email from auth.users for existing rows.
update public.free_starter_card_generations g
set email = u.email
from auth.users u
where g.user_id = u.id
  and g.email is null;

-- 4) Index the counting key.
create index if not exists free_starter_card_generations_email_status_idx
  on public.free_starter_card_generations (email, status);

-- 5) Rewrite the three RPCs to count by email, falling back to user_id when
--    the email is missing.

create or replace function public.claim_free_starter_card_generation(
  p_user_id uuid,
  p_generation_id uuid,
  p_limit integer default 20,
  p_email text default null
)
returns table(result text, used integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.free_starter_card_generations%rowtype;
  v_used integer;
  v_key text;
begin
  if p_limit < 1 then
    raise exception 'starter allowance limit must be positive';
  end if;

  v_key := lower(nullif(trim(p_email), ''));
  if v_key is null then
    v_key := 'user:' || p_user_id::text;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select * into v_existing
  from public.free_starter_card_generations
  where generation_id = p_generation_id;

  if found then
    if v_existing.user_id <> p_user_id then
      return query select 'unavailable'::text, p_limit, 0;
      return;
    end if;
    if v_existing.status = 'failed' then
      update public.free_starter_card_generations
      set status = 'processing', claimed_at = now(), updated_at = now(), completed_at = null
      where generation_id = p_generation_id;
    end if;
    select count(*)::integer into v_used
    from public.free_starter_card_generations
    where coalesce(lower(nullif(trim(email), '')), 'user:' || user_id::text) = v_key
      and status in ('processing', 'success');
    return query select 'reused'::text, v_used, greatest(0, p_limit - v_used);
    return;
  end if;

  -- Abandoned reservations stop blocking the account after 15 minutes.
  update public.free_starter_card_generations
  set status = 'failed', updated_at = now(), completed_at = now()
  where coalesce(lower(nullif(trim(email), '')), 'user:' || user_id::text) = v_key
    and status = 'processing'
    and claimed_at < now() - interval '15 minutes';

  select count(*)::integer into v_used
  from public.free_starter_card_generations
  where coalesce(lower(nullif(trim(email), '')), 'user:' || user_id::text) = v_key
    and status in ('processing', 'success');

  if v_used >= p_limit then
    return query select 'exhausted'::text, v_used, 0;
    return;
  end if;

  insert into public.free_starter_card_generations (generation_id, user_id, email)
  values (p_generation_id, p_user_id, case when v_key like 'user:%' then null else v_key end);
  v_used := v_used + 1;
  return query select 'claimed'::text, v_used, greatest(0, p_limit - v_used);
end;
$$;

create or replace function public.finish_free_starter_card_generation(
  p_user_id uuid,
  p_generation_id uuid,
  p_succeeded boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.free_starter_card_generations
  set status = case when p_succeeded then 'success' else 'failed' end,
      updated_at = now(),
      completed_at = now()
  where user_id = p_user_id
    and generation_id = p_generation_id
    and status = 'processing';
$$;

create or replace function public.get_free_starter_card_allowance(
  p_user_id uuid,
  p_limit integer default 20,
  p_email text default null
)
returns table(used integer, remaining integer, exhausted boolean)
language sql
security definer
set search_path = public
as $$
  select
    count(*) filter (where status = 'success')::integer as used,
    greatest(0, p_limit - count(*) filter (
      where status = 'success'
        or (status = 'processing' and claimed_at >= now() - interval '15 minutes')
    ))::integer as remaining,
    count(*) filter (
      where status = 'success'
        or (status = 'processing' and claimed_at >= now() - interval '15 minutes')
    ) >= p_limit as exhausted
  from public.free_starter_card_generations
  where coalesce(lower(nullif(trim(email), '')), 'user:' || user_id::text)
    = coalesce(lower(nullif(trim(p_email), '')), 'user:' || p_user_id::text);
$$;

revoke all on function public.claim_free_starter_card_generation(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.finish_free_starter_card_generation(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.get_free_starter_card_allowance(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.claim_free_starter_card_generation(uuid, uuid, integer, text) to service_role;
grant execute on function public.finish_free_starter_card_generation(uuid, uuid, boolean) to service_role;
grant execute on function public.get_free_starter_card_allowance(uuid, integer, text) to service_role;
