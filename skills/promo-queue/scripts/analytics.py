"""控制台的「使用者」「數據」分頁：直接查 Supabase（App 的正式資料庫）。

用 `supabase db query --linked`（跟 white-list skill 同一招），所以要在已經 link 好專案的 Mac 上跑。
一次查詢約 3 秒，所以每個查詢都把整包結果組成一個 JSON 回來，並快取 60 秒。
時間一律換成台灣時間（Asia/Taipei）。
"""
import json, pathlib, re, subprocess, threading, time

ROOT = pathlib.Path(__file__).resolve().parents[3]
TZ = "Asia/Taipei"
RC_PROJECT = "7c80607a"
CACHE, LOCK = {}, threading.Lock()
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def sql(q):
    r = subprocess.run(["supabase", "db", "query", "--linked", "--output", "json", q],
                       cwd=ROOT, capture_output=True, text=True, timeout=90)
    if r.returncode:
        raise RuntimeError("Supabase 查詢失敗：" + (r.stderr.strip().splitlines() or ["?"])[-1])
    return json.loads(r.stdout).get("rows", [])


def one(q):
    rows = sql(f"select ({q}) as j")
    return (rows[0]["j"] if rows else None) or {}


REFRESHING = set()


def _refresh(key, fn):
    try:
        val = fn()
        if isinstance(val, dict):
            val["at"] = time.strftime("%H:%M")
        with LOCK:
            CACHE[key] = (time.time(), val)
        return val
    finally:
        with LOCK:
            REFRESHING.discard(key)


def cached(key, fn, ttl=60, fresh=False):
    """先回上次的結果（就算舊了），舊了就在背景重抓；只有第一次或按重新整理才會等。"""
    with LOCK:
        hit = CACHE.get(key)
        stale = not hit or time.time() - hit[0] >= ttl
        start = hit and stale and not fresh and key not in REFRESHING
        if start:
            REFRESHING.add(key)
    if hit and not fresh:
        if start:
            threading.Thread(target=_refresh, args=(key, fn), daemon=True).start()
        return hit[1]
    with LOCK:
        REFRESHING.add(key)
    return _refresh(key, fn)


def warm():
    """控制台一開就先在背景把兩包資料抓好，第一次點分頁就不用等。"""
    for key, fn in (("users", users), ("analytics", analytics)):
        threading.Thread(target=lambda k=key, f=fn: cached(k, f), daemon=True).start()


# 活躍 = 這天有開 App 留下紀錄、做了卡片、或用了 AI（三個來源取聯集）
ACT = f"""act as (
  select user_id, (occurred_at at time zone '{TZ}') ts from app_diagnostic_logs where user_id is not null
  union all select user_id, (created_at at time zone '{TZ}') from cards
  union all select user_id, (occurred_at at time zone '{TZ}') from ai_usage_cost_events where user_id is not null)"""

# 不能只看 status：到期時 webhook 不一定會把 status 改掉（例：9/23 到期的月訂閱還寫 active），所以一律再檢查到期日
LIVE = "status = 'active' and (expires_at is null or expires_at > now())"
PAID = f"product_id is not null and product_id not like 'rc_promo%' and {LIVE}"
GIFT = f"product_id like 'rc_promo%' and {LIVE}"


def users():
    q = f"""with {ACT},
    last_log as (select distinct on (user_id) user_id, platform, app_version, occurred_at
                 from app_diagnostic_logs where user_id is not null order by user_id, occurred_at desc),
    seen as (select user_id, max(ts) ts from act group by 1),
    c as (select user_id, count(*) n, count(*) filter (where created_at > now() - interval '7 days') n7
          from cards where deleted_at is null group by 1),
    ai as (select user_id, sum(estimated_cost_twd) twd from ai_usage_cost_events group by 1),
    s as (select distinct on (user_id) user_id, product_id, expires_at,
            case when {LIVE} then 'active' else 'expired' end status,
            (raw_event->'subscriptions'->product_id->'price'->>'amount')::numeric price,
            raw_event->'subscriptions'->product_id->>'unsubscribe_detected_at' unsub
          from subscriptions order by user_id, ({LIVE}) desc, updated_at desc)
    select coalesce(json_agg(json_build_object(
      'id', u.id, 'email', u.email, 'login', u.raw_app_meta_data->>'provider',
      'joined', to_char(u.created_at at time zone '{TZ}', 'YYYY-MM-DD HH24:MI'),
      'seen', to_char(seen.ts, 'YYYY-MM-DD HH24:MI'),
      'tier', p.subscription_tier, 'product', s.product_id, 'sub_status', s.status,
      'expires', to_char(coalesce(s.expires_at, p.subscription_expires_at) at time zone '{TZ}', 'YYYY-MM-DD'),
      'paid', coalesce(s.product_id not like 'rc_promo%' and s.status = 'active', false),
      'price', s.price, 'unsub', s.unsub,
      'lang', p.native_language, 'level', p.english_level, 'goal', p.learning_goal,
      'onboarded', coalesce(p.onboarding_completed, false),
      'cards', coalesce(c.n, 0), 'cards7', coalesce(c.n7, 0), 'ai_twd', round(coalesce(ai.twd, 0)::numeric, 1),
      'platform', l.platform, 'version', l.app_version) order by u.created_at desc), '[]'::json)
    from auth.users u left join profiles p on p.id = u.id left join seen on seen.user_id = u.id
      left join c on c.user_id = u.id left join ai on ai.user_id = u.id
      left join s on s.user_id = u.id left join last_log l on l.user_id = u.id"""
    return {"users": one(q), "rc": f"https://app.revenuecat.com/projects/{RC_PROJECT}/customers/"}


def user(uid):
    if not UUID.match(uid or ""):
        raise ValueError("使用者編號格式不對")
    q = f"""json_build_object(
      'cards', (select coalesce(json_agg(x), '[]') from (select target_word w, source_app src, part_of_speech pos,
                 to_char(created_at at time zone '{TZ}', 'YYYY-MM-DD HH24:MI') at
               from cards where user_id = '{uid}' and deleted_at is null order by created_at desc limit 30) x),
      'subs', (select coalesce(json_agg(x), '[]') from (select product_id, status, environment,
                 to_char(started_at at time zone '{TZ}', 'YYYY-MM-DD') started, to_char(expires_at at time zone '{TZ}', 'YYYY-MM-DD') expires
               from subscriptions where user_id = '{uid}' order by updated_at desc) x),
      'events', (select coalesce(json_agg(x), '[]') from (select category, event, level, platform, app_version v,
                 to_char(occurred_at at time zone '{TZ}', 'MM-DD HH24:MI') at
               from app_diagnostic_logs where user_id = '{uid}' and category <> 'system' order by occurred_at desc limit 40) x),
      'days', (select coalesce(json_agg(x order by d), '[]') from (select to_char(created_at at time zone '{TZ}', 'YYYY-MM-DD') d, count(*) n
               from cards where user_id = '{uid}' and deleted_at is null group by 1) x),
      'ai', (select json_build_object('calls', count(*), 'twd', round(coalesce(sum(estimated_cost_twd), 0)::numeric, 1))
             from ai_usage_cost_events where user_id = '{uid}'))"""
    return one(q)


def analytics():
    day = f"(now() at time zone '{TZ}')::date"
    q = f"""with {ACT},
    u as (select id, created_at at time zone '{TZ}' ts from auth.users),
    days as (select generate_series({day} - 29, {day}, interval '1 day')::date d),
    au as (select ts::date d, count(distinct user_id) n from act where ts > now() - interval '31 days' group by 1),
    su as (select ts::date d, count(*) n from u group by 1),
    cd as (select (created_at at time zone '{TZ}')::date d, count(*) n from cards group by 1),
    ad as (select (occurred_at at time zone '{TZ}')::date d, sum(estimated_cost_twd) twd from ai_usage_cost_events group by 1),
    first_card as (select user_id, count(*) n from cards group by 1),
    wk as (select date_trunc('week', u.ts)::date w, u.id, u.ts from u where u.ts > {day} - 63),
    ret as (select w, count(*) n,
      count(*) filter (where exists (select 1 from act where act.user_id = wk.id and act.ts >= wk.ts + interval '1 day' and act.ts < wk.ts + interval '2 days')) d1,
      count(*) filter (where exists (select 1 from act where act.user_id = wk.id and act.ts >= wk.ts + interval '7 days' and act.ts < wk.ts + interval '14 days')) d7
      from wk group by 1)
    select json_build_object(
      'kpi', json_build_object(
        'users', (select count(*) from u),
        'new7', (select count(*) from u where ts > {day} - 6),
        'new30', (select count(*) from u where ts > {day} - 29),
        'dau', (select count(distinct user_id) from act where ts::date = {day}),
        'wau', (select count(distinct user_id) from act where ts > {day} - 6),
        'wau_prev', (select count(distinct user_id) from act where ts > {day} - 13 and ts <= {day} - 6),
        'new_prev7', (select count(*) from u where ts > {day} - 13 and ts <= {day} - 6),
        'mau', (select count(distinct user_id) from act where ts > {day} - 29),
        'paid', (select count(distinct user_id) from subscriptions where {PAID}),
        'revenue', (select coalesce(sum((raw_event->'subscriptions'->product_id->'price'->>'amount')::numeric), 0) from subscriptions where {PAID}),
        'gift', (select count(distinct user_id) from subscriptions where {GIFT}),
        'cards30', (select count(*) from cards where created_at > now() - interval '30 days'),
        'ai30', (select round(coalesce(sum(estimated_cost_twd), 0)::numeric) from ai_usage_cost_events where occurred_at > now() - interval '30 days')),
      'daily', (select json_agg(json_build_object('d', to_char(days.d, 'MM-DD'), 'iso', to_char(days.d, 'YYYY-MM-DD'), 'signups', coalesce(su.n, 0), 'active', coalesce(au.n, 0),
                 'cards', coalesce(cd.n, 0), 'ai', round(coalesce(ad.twd, 0)::numeric, 1)) order by days.d)
                from days left join su on su.d = days.d left join au on au.d = days.d left join cd on cd.d = days.d left join ad on ad.d = days.d),
      'funnel', json_build_array(
        json_build_object('k', '註冊', 'n', (select count(*) from u)),
        json_build_object('k', '完成新手引導', 'n', (select count(*) from profiles where onboarding_completed)),
        json_build_object('k', '做了第 1 張卡', 'n', (select count(*) from first_card)),
        json_build_object('k', '做了 5 張以上', 'n', (select count(*) from first_card where n >= 5)),
        json_build_object('k', '付費', 'n', (select count(distinct user_id) from subscriptions where {PAID}))),
      'retention', (select coalesce(json_agg(json_build_object('w', to_char(w, 'MM-DD'), 'n', n, 'd1', d1, 'd7', d7,
                     'd7_ready', w + 14 <= {day}) order by w desc), '[]') from ret),
      'split', json_build_object(
        'login', (select json_object_agg(coalesce(k, '?'), n) from (select raw_app_meta_data->>'provider' k, count(*) n from auth.users group by 1) x),
        'platform', (select json_object_agg(coalesce(k, '?'), n) from (select platform k, count(distinct user_id) n from app_diagnostic_logs
                      where user_id is not null and occurred_at > now() - interval '30 days' group by 1) x),
        'lang', (select json_object_agg(coalesce(k, '?'), n) from (select native_language k, count(*) n from profiles group by 1) x),
        'level', (select json_object_agg(coalesce(k, '?'), n) from (select english_level k, count(*) n from profiles group by 1) x),
        'goal', (select json_object_agg(coalesce(k, '?'), n) from (select learning_goal k, count(*) n from profiles group by 1) x),
        'source', (select json_object_agg(coalesce(k, '?'), n) from (select source_app k, count(*) n from cards group by 1) x),
        'version', (select json_object_agg(coalesce(k, '?'), n) from (select k, count(*) n from (
                      select distinct on (user_id) user_id, app_version k from app_diagnostic_logs
                      where user_id is not null and occurred_at > now() - interval '30 days' order by user_id, occurred_at desc) y group by 1) z)))"""
    return one(q)


DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def day(d, m):
    """第二層：點某一天的長條，看那天是誰、做了什麼。"""
    if not DATE.match(d or "") or m not in ("active", "cards", "ai"):
        raise ValueError("日期或指標不對")
    on = lambda col: f"({col} at time zone '{TZ}')::date = '{d}'"
    if m == "active":
        q = f"""with {ACT} select coalesce(json_agg(x order by x.n desc), '[]') from (
          select a.user_id id, count(*) n,
            (select count(*) from cards c where c.user_id = a.user_id and {on('c.created_at')}) cards,
            (select count(*) from ai_usage_cost_events e where e.user_id = a.user_id and {on('e.occurred_at')}) ai
          from act a where a.ts::date = '{d}' group by 1) x"""
    elif m == "cards":
        q = f"""select coalesce(json_agg(x), '[]') from (select user_id id, target_word w, part_of_speech pos, source_app src,
          to_char(created_at at time zone '{TZ}', 'HH24:MI') at from cards where {on('created_at')} order by created_at desc) x"""
    else:
        q = f"""json_build_object(
          'by', (select coalesce(json_agg(x order by x.twd desc), '[]') from (select capability k, count(*) n,
                  round(coalesce(sum(estimated_cost_twd), 0)::numeric, 2) twd from ai_usage_cost_events where {on('occurred_at')} group by 1) x),
          'users', (select coalesce(json_agg(x order by x.twd desc), '[]') from (select user_id id, count(*) n,
                  round(coalesce(sum(estimated_cost_twd), 0)::numeric, 2) twd from ai_usage_cost_events where {on('occurred_at')} and user_id is not null group by 1) x))"""
    return {"rows": one(q)}
