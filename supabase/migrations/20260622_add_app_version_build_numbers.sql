alter table public.app_version_policy
  add column if not exists latest_build_number integer,
  add column if not exists minimum_supported_build_number integer;

update public.app_version_policy
set
  latest_build_number = coalesce(latest_build_number, 8),
  minimum_supported_build_number = coalesce(minimum_supported_build_number, 8),
  updated_at = now()
where platform = 'ios';

update public.app_version_policy
set
  latest_build_number = coalesce(latest_build_number, 1),
  minimum_supported_build_number = coalesce(minimum_supported_build_number, 1),
  updated_at = now()
where platform = 'android';
