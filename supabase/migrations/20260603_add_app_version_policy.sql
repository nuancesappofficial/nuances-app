create table if not exists public.app_version_policy (
  platform text primary key check (platform in ('ios', 'android')),
  latest_version text not null,
  minimum_supported_version text not null,
  update_url text,
  required boolean not null default false,
  message_title text,
  message_body text,
  updated_at timestamptz not null default now()
);

alter table public.app_version_policy enable row level security;

drop policy if exists "Anyone can view app version policy" on public.app_version_policy;
create policy "Anyone can view app version policy"
  on public.app_version_policy for select
  using (true);

insert into public.app_version_policy (
  platform,
  latest_version,
  minimum_supported_version,
  update_url,
  required,
  message_title,
  message_body
)
values
  (
    'ios',
    '1.0.0',
    '1.0.0',
    null,
    false,
    'Update available',
    'A newer version of Nuances is available. Update from the App Store for the latest fixes and improvements.'
  ),
  (
    'android',
    '1.0.0',
    '1.0.0',
    null,
    false,
    'Update available',
    'A newer version of Nuances is available. Update from the store for the latest fixes and improvements.'
  )
on conflict (platform) do nothing;
