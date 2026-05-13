create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null default 'revenuecat',
  product_id text,
  entitlement_id text not null,
  status text not null default 'expired' check (status in ('active', 'expired', 'revoked', 'grace_period')),
  started_at timestamptz,
  expires_at timestamptz,
  environment text,
  last_synced_at timestamptz,
  raw_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_user_provider_entitlement_idx
  on public.subscriptions (user_id, provider, entitlement_id);

create index if not exists subscriptions_user_status_idx
  on public.subscriptions (user_id, status);

alter table public.subscriptions enable row level security;

create policy "Users can view their own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = user_id);
