-- Harden production security boundaries for user media and subscription state.

update storage.buckets
set public = false
where id = 'cached-images';

update storage.buckets
set public = true
where id = 'audio_cache';

alter table public.profiles
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

drop policy if exists "Public can read Nuances public buckets" on storage.objects;
drop policy if exists "Authenticated users can upload cached images" on storage.objects;
drop policy if exists "Authenticated users can update cached images" on storage.objects;
drop policy if exists "Authenticated users can delete cached images" on storage.objects;
drop policy if exists "Public can read Nuances audio cache" on storage.objects;
drop policy if exists "Users can read their own cached images" on storage.objects;
drop policy if exists "Users can upload their own cached images" on storage.objects;
drop policy if exists "Users can update their own cached images" on storage.objects;
drop policy if exists "Users can delete their own cached images" on storage.objects;

create policy "Public can read Nuances audio cache"
  on storage.objects for select
  using (bucket_id = 'audio_cache');

create policy "Users can read their own cached images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'cached-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload their own cached images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cached-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own cached images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'cached-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'cached-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own cached images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'cached-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.prevent_client_subscription_profile_update()
returns trigger as $$
begin
  if auth.role() = 'authenticated'
    and (
      new.subscription_tier is distinct from old.subscription_tier
      or new.subscription_expires_at is distinct from old.subscription_expires_at
      or new.trial_started_at is distinct from old.trial_started_at
      or new.trial_ends_at is distinct from old.trial_ends_at
    )
  then
    raise exception 'entitlement fields are server-managed';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists prevent_client_subscription_profile_update on public.profiles;
create trigger prevent_client_subscription_profile_update
  before update on public.profiles
  for each row
  execute function public.prevent_client_subscription_profile_update();
