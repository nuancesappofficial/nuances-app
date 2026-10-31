-- 準時發文：Supabase 每分鐘看一次「下一篇什麼時候發」，時間到就叫 GitHub 跑 promo-queue（workflow_dispatch）。
-- 下一篇的時間由 postq.py 每次存 queue 時寫進 promo_trigger，所以改時段 / 延後 / 新增都會自動跟著變。
-- GitHub 每小時的排程留著當備援（重試失敗、抓成效）。
-- 在 Supabase 後台 → SQL Editor 貼上整段執行一次；可以重複執行。
-- GitHub 金鑰另外存：select vault.create_secret('<金鑰>', 'promo_github_token');（換金鑰用 vault.update_secret）

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.promo_trigger (
  id int primary key default 1 check (id = 1),
  due_at timestamptz,       -- 下一篇排定的時間（postq.py 寫）
  fired_at timestamptz,     -- 上次叫 GitHub 的時間
  last_status text          -- 上次呼叫 GitHub 的 request id，用來查 net._http_response
);
alter table public.promo_trigger enable row level security;   -- 沒有 policy：只有 service key 讀寫得到

create or replace function public.promo_fire() returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.promo_trigger;
  tok text;
  req bigint;
begin
  select * into r from public.promo_trigger where id = 1;
  -- 還沒到時間，或這個時間已經叫過了（GitHub 跑完會把 due_at 換成下一篇）
  if r.due_at is null or r.due_at > now() or (r.fired_at is not null and r.fired_at >= r.due_at) then
    return;
  end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'promo_github_token';
  if tok is null then
    update public.promo_trigger set last_status = 'no token' where id = 1;
    return;
  end if;
  select net.http_post(
    url := 'https://api.github.com/repos/nuancesappofficial/nuances-app/actions/workflows/promo-queue.yml/dispatches',
    headers := jsonb_build_object('Authorization', 'Bearer ' || tok, 'Accept', 'application/vnd.github+json',
                                  'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'nuances-promo-trigger'),
    body := jsonb_build_object('ref', 'main')) into req;
  update public.promo_trigger set fired_at = now(), last_status = 'request ' || req where id = 1;
end $$;

revoke execute on function public.promo_fire() from public, anon, authenticated;

select cron.unschedule('promo-fire') where exists (select 1 from cron.job where jobname = 'promo-fire');
select cron.schedule('promo-fire', '* * * * *', 'select public.promo_fire()');
