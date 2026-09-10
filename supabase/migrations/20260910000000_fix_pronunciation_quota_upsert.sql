-- Fix consume_pronunciation_quota: Ensure profile exists and handle upsert/fallback
-- to prevent 503 pronunciation_quota_unavailable errors for users without existing profile rows.

drop function if exists public.consume_pronunciation_quota(uuid, integer);

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
  v_user_email text;
begin
  if normalized_limit <= 0 then
    return query select false, 0, normalized_limit, v_month;
    return;
  end if;

  -- 1. Ensure profiles row exists. If missing, initialize from auth.users.
  if not exists (select 1 from public.profiles where id = p_user_id) then
    select email into v_user_email from auth.users where id = p_user_id;
    insert into public.profiles (id, email, pronunciation_used_month, last_reset_month, updated_at)
    values (p_user_id, coalesce(v_user_email, 'unknown@user.internal'), 0, v_month, now())
    on conflict (id) do nothing;
  end if;

  -- 2. Monthly rollover reset
  update public.profiles
  set
    pronunciation_used_month = case
      when last_reset_month is distinct from v_month then 0
      else pronunciation_used_month
    end,
    last_reset_month = v_month
  where id = p_user_id
    and (last_reset_month is distinct from v_month or pronunciation_used_month is null);

  -- 3. Atomically consume quota
  update public.profiles
  set
    pronunciation_used_month = coalesce(pronunciation_used_month, 0) + 1,
    updated_at = now()
  where id = p_user_id
    and coalesce(pronunciation_used_month, 0) < normalized_limit
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

  -- 4. Fallback if quota reached or limit exceeded
  return query
    select
      false,
      coalesce(p.pronunciation_used_month, normalized_limit),
      normalized_limit,
      coalesce(p.last_reset_month, v_month)
    from public.profiles p
    where p.id = p_user_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.consume_pronunciation_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_pronunciation_quota(uuid, integer) to service_role;
