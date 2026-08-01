-- Cards are cloud-backed, account-owned records. Keep the owner boundary
-- explicit for every operation and prevent owner reassignment in triggers.
alter table public.cards enable row level security;

drop policy if exists "Users can view their own cards" on public.cards;
drop policy if exists "Users can insert their own cards" on public.cards;
drop policy if exists "Users can update their own cards" on public.cards;
drop policy if exists "Users can delete their own cards" on public.cards;

create policy "Users can view their own cards"
on public.cards
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own cards"
on public.cards
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own cards"
on public.cards
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own cards"
on public.cards
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.enforce_remote_card_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated' then
    if new.user_id is distinct from auth.uid() then
      raise exception 'card owner must match authenticated user';
    end if;
    if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
      raise exception 'card owner is immutable';
    end if;
  end if;

  new.cached_item_id := null;
  return new;
end;
$$;

drop trigger if exists enforce_remote_card_owner_before_write on public.cards;
create trigger enforce_remote_card_owner_before_write
before insert or update on public.cards
for each row execute function public.enforce_remote_card_owner();
