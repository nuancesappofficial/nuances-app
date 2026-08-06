-- Add 'lite' as a valid subscription tier alongside 'free' and 'pro'.
-- This unlocks the Lite (輕量版) plan tier for the dual-track Lite/Pro rollout.

-- 1) Widen the profiles.subscription_tier check constraint to accept 'lite'.
--    The original inline constraint was auto-named profiles_subscription_tier_check.
alter table public.profiles
  drop constraint if exists profiles_subscription_tier_check;

alter table public.profiles
  add constraint profiles_subscription_tier_check
  check (subscription_tier in ('free', 'lite', 'pro'));

-- 2) The prevent_client_subscription_profile_update trigger guards *which fields*
--    a client may mutate (subscription_tier / expires / trial windows are
--    server-managed). It does not hard-code the allowed tier values, so it needs
--    no change for 'lite'. We re-declare it here to keep the migration
--    self-contained and to guard against any drift from the base schema.
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
