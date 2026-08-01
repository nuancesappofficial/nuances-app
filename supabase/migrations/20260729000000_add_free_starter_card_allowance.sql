-- Lifetime, server-authoritative starter allowance. One generation_id represents
-- one card pipeline even when core/enrichment are separate requests or retried.
create table if not exists public.free_starter_card_generations (
  generation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing', 'success', 'failed')),
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists free_starter_card_generations_user_status_idx
  on public.free_starter_card_generations (user_id, status);

alter table public.free_starter_card_generations enable row level security;
revoke all on public.free_starter_card_generations from anon, authenticated;
grant all on public.free_starter_card_generations to service_role;

create or replace function public.claim_free_starter_card_generation(
  p_user_id uuid,
  p_generation_id uuid,
  p_limit integer default 20
)
returns table(result text, used integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.free_starter_card_generations%rowtype;
  v_used integer;
begin
  if p_limit < 1 then
    raise exception 'starter allowance limit must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

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
    where user_id = p_user_id and status in ('processing', 'success');
    return query select 'reused'::text, v_used, greatest(0, p_limit - v_used);
    return;
  end if;

  -- Abandoned reservations stop blocking the account after 15 minutes.
  update public.free_starter_card_generations
  set status = 'failed', updated_at = now(), completed_at = now()
  where user_id = p_user_id
    and status = 'processing'
    and claimed_at < now() - interval '15 minutes';

  select count(*)::integer into v_used
  from public.free_starter_card_generations
  where user_id = p_user_id and status in ('processing', 'success');

  if v_used >= p_limit then
    return query select 'exhausted'::text, v_used, 0;
    return;
  end if;

  insert into public.free_starter_card_generations (generation_id, user_id)
  values (p_generation_id, p_user_id);
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
  p_limit integer default 20
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
  where user_id = p_user_id;
$$;

revoke all on function public.claim_free_starter_card_generation(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_free_starter_card_generation(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.get_free_starter_card_allowance(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_free_starter_card_generation(uuid, uuid, integer) to service_role;
grant execute on function public.finish_free_starter_card_generation(uuid, uuid, boolean) to service_role;
grant execute on function public.get_free_starter_card_allowance(uuid, integer) to service_role;
