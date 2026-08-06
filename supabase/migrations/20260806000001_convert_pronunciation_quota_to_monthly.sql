-- Convert pronunciation quota from daily to monthly, and give Free users a
-- separate lifetime pronunciation allowance (independent of the 20-card
-- starter allowance).
--
-- Part 1: pronunciation quota becomes a pure monthly cap.
--   * profiles.pronunciation_used_today / last_reset_date (daily) are replaced
--     by pronunciation_used_month / last_reset_month (YYYY-MM).
--   * consume_pronunciation_quota now takes a monthly limit and resets the
--     counter whenever the calendar month changes.
--
-- Part 2: Free pronunciation gets its own lifetime counter.
--   * free_starter_card_generations gains an action_type column ('card' |
--     'pronunciation') so cards and pronunciation are counted independently.
--   * New RPCs claim_free_starter_pronunciation / get_free_starter_pronunciation_allowance
--     track the lifetime 20 pronunciation cap; the existing card RPCs are
--     untouched and keep counting only 'card' rows.

-- ---------------------------------------------------------------------------
-- Part 1: monthly pronunciation quota
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists pronunciation_used_month integer not null default 0,
  add column if not exists last_reset_month text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_pronunciation_used_month_nonnegative'
      and connamespace = 'public'::regnamespace
  ) then
    alter table public.profiles
      add constraint profiles_pronunciation_used_month_nonnegative
      check (pronunciation_used_month >= 0);
  end if;
end;
$$;

-- Backfill last_reset_month for existing rows so the first monthly check
-- behaves correctly.
update public.profiles
set last_reset_month = to_char(current_date, 'YYYY-MM')
where last_reset_month is null;

-- Re-declare the client-mutation guard to also protect the new monthly quota
-- fields (the daily fields are no longer used by the RPC).
create or replace function public.prevent_client_subscription_profile_update()
returns trigger as $$
begin
  if auth.role() = 'authenticated'
    and (
      new.subscription_tier is distinct from old.subscription_tier
      or new.subscription_expires_at is distinct from old.subscription_expires_at
      or new.trial_started_at is distinct from old.trial_started_at
      or new.trial_ends_at is distinct from old.trial_ends_at
      or new.pronunciation_used_month is distinct from old.pronunciation_used_month
      or new.last_reset_month is distinct from old.last_reset_month
    )
  then
    raise exception 'entitlement and quota fields are server-managed';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists prevent_client_subscription_profile_update on public.profiles;
create trigger prevent_client_subscription_profile_update
  before update on public.profiles
  for each row
  execute function public.prevent_client_subscription_profile_update();

-- Monthly pronunciation quota RPC. Resets the counter whenever the calendar
-- month changes, then atomically increments if under the monthly limit.
create or replace function public.consume_pronunciation_quota(
  p_user_id uuid,
  p_monthly_limit integer
)
returns table (
  allowed boolean,
  used integer,
  monthly_limit integer,
  reset_month text
) as $$
declare
  normalized_limit integer := greatest(0, coalesce(p_monthly_limit, 0));
  v_month text := to_char(current_date, 'YYYY-MM');
begin
  if normalized_limit <= 0 then
    return query select false, 0, normalized_limit, v_month;
    return;
  end if;

  update public.profiles
  set
    pronunciation_used_month = case
      when last_reset_month is distinct from v_month then 0
      else pronunciation_used_month
    end,
    last_reset_month = v_month
  where id = p_user_id
    and last_reset_month is distinct from v_month;

  update public.profiles
  set
    pronunciation_used_month = pronunciation_used_month + 1,
    updated_at = now()
  where id = p_user_id
    and pronunciation_used_month < normalized_limit
  returning
    true,
    pronunciation_used_month,
    normalized_limit,
    last_reset_month
  into allowed, used, monthly_limit, reset_month;

  if found then
    return next;
    return;
  end if;

  return query
    select
      false,
      p.pronunciation_used_month,
      normalized_limit,
      p.last_reset_month
    from public.profiles p
    where p.id = p_user_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.consume_pronunciation_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_pronunciation_quota(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Part 2: Free pronunciation lifetime allowance (independent of cards)
-- ---------------------------------------------------------------------------
alter table public.free_starter_card_generations
  add column if not exists action_type text not null default 'card'
    check (action_type in ('card', 'pronunciation'));

create index if not exists free_starter_card_generations_action_type_idx
  on public.free_starter_card_generations (action_type, status);

-- Claim one lifetime free pronunciation. Uses a random uuid as the row key so
-- the existing email/user-keyed anti-abuse counting applies unchanged.
create or replace function public.claim_free_starter_pronunciation(
  p_user_id uuid,
  p_limit integer default 20,
  p_email text default null
)
returns table(result text, used integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_used integer;
  v_generation_id uuid := gen_random_uuid();
begin
  if p_limit < 1 then
    raise exception 'starter allowance limit must be positive';
  end if;

  v_key := lower(nullif(trim(p_email), ''));
  if v_key is null then
    v_key := 'user:' || p_user_id::text;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key || ':pronunciation', 0));

  -- Abandoned reservations stop blocking the account after 15 minutes.
  update public.free_starter_card_generations
  set status = 'failed', updated_at = now(), completed_at = now()
  where coalesce(lower(nullif(trim(email), '')), 'user:' || user_id::text) = v_key
    and action_type = 'pronunciation'
    and status = 'processing'
    and claimed_at < now() - interval '15 minutes';

  select count(*)::integer into v_used
  from public.free_starter_card_generations
  where coalesce(lower(nullif(trim(email), '')), 'user:' || user_id::text) = v_key
    and action_type = 'pronunciation'
    and status in ('processing', 'success');

  if v_used >= p_limit then
    return query select 'exhausted'::text, v_used, 0;
    return;
  end if;

  insert into public.free_starter_card_generations
    (generation_id, user_id, email, action_type)
  values
    (v_generation_id, p_user_id, case when v_key like 'user:%' then null else v_key end, 'pronunciation');
  v_used := v_used + 1;
  return query select 'claimed'::text, v_used, greatest(0, p_limit - v_used);
end;
$$;

create or replace function public.get_free_starter_pronunciation_allowance(
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
  where action_type = 'pronunciation'
    and coalesce(lower(nullif(trim(email), '')), 'user:' || user_id::text)
      = coalesce(lower(nullif(trim(p_email), '')), 'user:' || p_user_id::text);
$$;

revoke all on function public.claim_free_starter_pronunciation(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.get_free_starter_pronunciation_allowance(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.claim_free_starter_pronunciation(uuid, integer, text) to service_role;
grant execute on function public.get_free_starter_pronunciation_allowance(uuid, integer, text) to service_role;
