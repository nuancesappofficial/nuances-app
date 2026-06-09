alter table public.profiles
  add column if not exists pronunciation_used_today integer not null default 0,
  add column if not exists last_reset_date date not null default current_date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_pronunciation_used_today_nonnegative'
      and connamespace = 'public'::regnamespace
  ) then
    alter table public.profiles
      add constraint profiles_pronunciation_used_today_nonnegative
      check (pronunciation_used_today >= 0);
  end if;
end;
$$;

create or replace function public.prevent_client_subscription_profile_update()
returns trigger as $$
begin
  if auth.role() = 'authenticated'
    and (
      new.subscription_tier is distinct from old.subscription_tier
      or new.subscription_expires_at is distinct from old.subscription_expires_at
      or new.trial_started_at is distinct from old.trial_started_at
      or new.trial_ends_at is distinct from old.trial_ends_at
      or new.pronunciation_used_today is distinct from old.pronunciation_used_today
      or new.last_reset_date is distinct from old.last_reset_date
    )
  then
    raise exception 'entitlement and quota fields are server-managed';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.consume_pronunciation_quota(
  p_user_id uuid,
  p_daily_limit integer
)
returns table (
  allowed boolean,
  used integer,
  daily_limit integer,
  reset_date date
) as $$
declare
  normalized_limit integer := greatest(0, coalesce(p_daily_limit, 0));
begin
  if normalized_limit <= 0 then
    return query select false, 0, normalized_limit, current_date;
    return;
  end if;

  update public.profiles
  set
    pronunciation_used_today = case
      when last_reset_date is distinct from current_date then 0
      else pronunciation_used_today
    end,
    last_reset_date = current_date
  where id = p_user_id
    and last_reset_date is distinct from current_date;

  update public.profiles
  set
    pronunciation_used_today = pronunciation_used_today + 1,
    updated_at = now()
  where id = p_user_id
    and pronunciation_used_today < normalized_limit
  returning
    true,
    pronunciation_used_today,
    normalized_limit,
    last_reset_date
  into allowed, used, daily_limit, reset_date;

  if found then
    return next;
    return;
  end if;

  return query
    select
      false,
      p.pronunciation_used_today,
      normalized_limit,
      p.last_reset_date
    from public.profiles p
    where p.id = p_user_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.consume_pronunciation_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_pronunciation_quota(uuid, integer) to service_role;
