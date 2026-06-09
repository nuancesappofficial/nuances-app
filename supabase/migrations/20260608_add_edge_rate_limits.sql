-- Supabase Edge Functions cannot rely on Deno KV being available in every runtime.
-- This table + RPC gives billable edge functions a Postgres-backed rate limit store.

create table if not exists public.edge_rate_limits (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  user_id uuid not null,
  bucket text not null,
  bucket_key text not null,
  count integer not null default 0 check (count >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service, user_id, bucket, bucket_key)
);

create index if not exists edge_rate_limits_expires_at_idx
  on public.edge_rate_limits (expires_at);

alter table public.edge_rate_limits enable row level security;

create or replace function public.increment_edge_rate_limit_counter(
  p_service text,
  p_user_id uuid,
  p_bucket text,
  p_bucket_key text,
  p_expires_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  insert into public.edge_rate_limits (
    service,
    user_id,
    bucket,
    bucket_key,
    count,
    expires_at,
    updated_at
  )
  values (
    p_service,
    p_user_id,
    p_bucket,
    p_bucket_key,
    1,
    p_expires_at,
    now()
  )
  on conflict (service, user_id, bucket, bucket_key)
  do update set
    count = case
      when public.edge_rate_limits.expires_at <= now() then 1
      else public.edge_rate_limits.count + 1
    end,
    expires_at = excluded.expires_at,
    updated_at = now()
  returning count into next_count;

  return next_count;
end;
$$;

grant execute on function public.increment_edge_rate_limit_counter(text, uuid, text, text, timestamptz)
  to service_role;
