#!/usr/bin/env python3
"""Nuances 推廣貼文排程：promo-vids/queue.json 記錄排隊中 / 已發布的貼文，時間到自動發到 IG、Threads、TikTok、YouTube Shorts。

usage（在專案根目錄）：
  postq.py add <工作資料夾> [--only reel|carousel] [--at "2026-11-02 20:00"]   # 加入排程（影片 + 輪播圖各一篇）
  postq.py list                       # 列出排程與狀態
  postq.py post-due [--dry-run]       # 時間到的發出去（GitHub Actions 每小時跑一次）
  postq.py post <id> [--dry-run]      # 立刻發某一篇（不管排程時間）
  postq.py skip <id> | retry <id> [--platform tiktok]
  postq.py done <id> --platform xiaohongshu [--url …]   # 沒有 API 的平台（小紅書等）手動發完後標記
  postq.py reschedule                 # 未發布的重新照時段排（刪掉或改順序後用）
  postq.py metrics [--now]            # 看成效（發文後第 3、7 天 post-due 會自動抓；--now 立刻抓一次）
  postq.py dashboard                  # 重產看板（每次改 queue 都會自動重產）
  postq.py push-secrets --channel tw [--only instagram,threads]   # 把本機金鑰傳到雲端那個國家（setup_wizard.sh 最後會跑）
  postq.py channel [list | add <id> --name 日本 --tz Asia/Tokyo --lang ja | set <id> --slots 12:30,20:00]
國家（channel）：每個國家一組帳號、時區、發文時段、語言；add 用 --channel 指定（預設第一個，tw）。

雲端模式（有 Supabase 金鑰時，平常都是這個）：queue 和平台金鑰存在 Supabase 私人 bucket「promo-private」，
媒體在 add 時就傳到公開 bucket「promo-media」，GitHub Actions（.github/workflows/promo-queue.yml）跑 post-due，
Mac 關機也會發。看板 promo-vids/dashboard.html 打開時從雲端讀即時資料。
本機模式（POSTQ_DIR 設了，或沒有 Supabase 金鑰）：全部讀寫 POSTQ_DIR / promo-vids，只拿來測試。
本機金鑰檔 ~/.config/nuances-promo/secrets.json（不進 git），由 setup_wizard.sh 產生。
"""
import argparse, datetime as dt, fcntl, html, json, os, pathlib, subprocess, sys, tempfile, traceback
import requests
from zoneinfo import ZoneInfo

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import platforms as P

ROOT = pathlib.Path(__file__).resolve().parents[3] if (pathlib.Path(__file__).resolve().parents[3] / "promo-vids").exists() \
    else pathlib.Path.cwd()
PROMO = pathlib.Path(os.environ.get("POSTQ_DIR", ROOT / "promo-vids"))   # 測試時可指到別的資料夾
QUEUE = PROMO / "queue.json"
DASH = PROMO / "dashboard.html"
LOG = PROMO / ".postq.log"
SECRETS = pathlib.Path.home() / ".config/nuances-promo/secrets.json"
PRIVATE = "promo-private"   # 私人 bucket：queue.json、secrets.json
PUBLIC = "promo-media"      # 公開 bucket：媒體、state/view.json（看板資料）
NAMES = {"instagram": "Instagram", "threads": "Threads", "facebook": "Facebook", "tiktok": "TikTok", "youtube": "YouTube",
         **P.MANUAL}   # MANUAL：沒有發文 API，時間到列在看板「待手動發布」
DEFAULT_SETTINGS = {
    "min_gap_hours": 6,                 # 同一個國家兩篇之間最少間隔（排程延誤錯過時段時，不會一次補發好幾篇）
    "max_attempts": 3,
}
# 國家 / 帳號組（channel）：每組有自己的時區、發文時段、語言、要發的平台，以及各平台帳號的 token
DEFAULT_CHANNEL = {
    "name": "台灣", "tz": "Asia/Taipei", "lang": "zh-Hant",
    "slots": ["20:00"],                 # 每天的發文時段（當地時間）；一個時段一篇
    # 輪播圖到只收影片的平台（FB、TikTok、YouTube）會自動改發 9:16 輪播影片，見 VARIANT
    "platforms": {"reel": ["instagram", "threads", "facebook", "tiktok", "youtube"],
                  "carousel": ["instagram", "threads", "facebook", "tiktok", "youtube"]},
}
# 輪播圖在各平台用哪個版本（clip-to-slides 一次輸出）：
#   4x5 = slides/、3x4 = slides-3x4/（小紅書）、9x16 = slides-9x16/、video = <topic>-slideshow.mp4、x4 = 4:5 前 4 張（X 上限 4 張）
VARIANT = {"instagram": "4x5", "threads": "4x5", "facebook": "video", "tiktok": "video", "youtube": "video",
           "xiaohongshu": "3x4", "douyin": "9x16", "line_voom": "9x16", "x": "x4", "dcard": "4x5", "naver_blog": "4x5",
           "bilibili": "video"}


# ---------- 讀寫 ----------
def local_secrets():
    return json.loads(SECRETS.read_text()) if SECRETS.exists() else {}


def cloud_creds():
    """GitHub Actions 用環境變數，本機讀 secrets.json 的 supabase 段；設了 POSTQ_DIR 就是本機測試模式。"""
    if os.environ.get("POSTQ_DIR"):
        return None
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not (url and key):
        s = local_secrets().get("supabase", {})
        url, key = s.get("url"), s.get("service_key")
    return {"url": url.rstrip("/"), "service_key": key, "bucket": PUBLIC} if url and key else None


CLOUD = cloud_creds()


def cloud_get(path):
    r = requests.get(f"{CLOUD['url']}/storage/v1/object/{PRIVATE}/{path}", timeout=60,
                     headers=P.sb_headers(CLOUD["service_key"]))
    if r.status_code in (400, 404):
        return None
    P._check(r) if r.status_code >= 400 else None
    return r.content


def cloud_put(path, body, ctype="application/json", bucket=PRIVATE):
    r = requests.post(f"{CLOUD['url']}/storage/v1/object/{bucket}/{path}", data=body, timeout=120,
                      headers={**P.sb_headers(CLOUD["service_key"]), "Content-Type": ctype,
                               "x-upsert": "true", "Cache-Control": "no-cache"})
    P._check(r)


def ensure_private_bucket():
    r = requests.post(f"{CLOUD['url']}/storage/v1/bucket", timeout=30, headers=P.sb_headers(CLOUD["service_key"]),
                      json={"id": PRIVATE, "name": PRIVATE, "public": False})
    if r.status_code >= 400 and r.status_code != 409 and "exist" not in r.text.lower():
        P._check(r)


def load():
    if CLOUD:
        raw = cloud_get("queue.json")
        q = json.loads(raw) if raw else {"settings": {}, "items": []}
    else:
        q = json.loads(QUEUE.read_text()) if QUEUE.exists() else {"settings": {}, "items": []}
    st = q.get("settings", {})
    if "channels" not in q:   # 舊格式（只有一組設定）→ 變成 tw 這一組
        q["channels"] = {"tw": {**DEFAULT_CHANNEL, **{k: st.pop(k) for k in ("tz", "slots", "platforms") if k in st}}}
    for k in ("tz", "slots", "platforms"):
        st.pop(k, None)
    q["settings"] = {**DEFAULT_SETTINGS, **st}
    for it in q["items"]:
        it.setdefault("channel", "tw")
    return q


def save(q):
    body = json.dumps(q, ensure_ascii=False, indent=1)
    if CLOUD:
        cloud_put("queue.json", body.encode())
    else:
        PROMO.mkdir(parents=True, exist_ok=True)
        tmp = QUEUE.with_suffix(".tmp")
        tmp.write_text(body)
        tmp.replace(QUEUE)
    dashboard(q)


def load_secrets():
    """{"supabase": …, "channels": {"tw": {"instagram": …, …}}}；舊格式（平台金鑰放最外層）視為 tw。"""
    if not CLOUD:
        s = local_secrets()
    else:
        raw = cloud_get("secrets.json")
        s = {**(json.loads(raw) if raw else {}), "supabase": CLOUD}
    chans = s.setdefault("channels", {})
    for n in NAMES:
        if n in s:
            chans.setdefault("tw", {}).setdefault(n, s.pop(n))
    return s


def account(secrets, cid):
    return secrets.get("channels", {}).get(cid, {})


def save_secrets(s):
    if CLOUD:
        cloud_put("secrets.json", json.dumps({k: v for k, v in s.items() if k != "supabase"}, indent=1).encode())
        return
    SECRETS.parent.mkdir(parents=True, exist_ok=True)
    SECRETS.write_text(json.dumps(s, indent=1))
    SECRETS.chmod(0o600)


def cmd_push_secrets(q, a):
    """把本機 secrets.json 的平台金鑰傳到雲端某個國家（只覆蓋 --only 指定的平台；TikTok 等會輪替的 token 以雲端為準）。"""
    if not CLOUD:
        sys.exit("沒有 Supabase 金鑰，先跑 setup_wizard.sh 的 Supabase 那一步")
    ensure_private_bucket()
    loc = local_secrets()
    names = a.only.split(",") if a.only else [k for k in loc if k in NAMES]
    q = load()
    if a.channel not in q["channels"]:
        sys.exit(f"沒有 {a.channel} 這個國家，先跑：postq.py channel add {a.channel} …")
    cur = load_secrets()
    acct = cur["channels"].setdefault(a.channel, {})
    for n in names:
        if n in loc:
            acct[n] = loc[n]
    save_secrets(cur)
    if not cloud_get("queue.json"):
        save(q)
    print(f"已上傳到 {a.channel}：", ", ".join(n for n in names if n in loc) or "（沒有）")


def log(msg):
    line = f"{dt.datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    print(line, flush=True)
    if not os.environ.get("GITHUB_ACTIONS"):
        PROMO.mkdir(parents=True, exist_ok=True)
        with LOG.open("a") as f:
            f.write(line + "\n")


def chan(q, cid):
    return q["channels"][cid]


def now(q, cid=None):
    """cid 給了就用那個國家的時區；沒給用第一個國家的（只影響顯示，比較時間都帶時區）。"""
    c = chan(q, cid) if cid else next(iter(q["channels"].values()))
    return dt.datetime.now(ZoneInfo(c["tz"]))


def parse(s):
    return dt.datetime.fromisoformat(s)


def state(item):
    """整篇的狀態：posted / failed / partial / queued / skipped。"""
    sts = [p["status"] for p in item["platforms"].values()]
    if item.get("skipped"):
        return "skipped"
    if all(s in ("posted", "skipped", "manual") for s in sts):   # manual = 等使用者手動發，不擋後面的排程
        return "posted" if any(s in ("posted", "manual") for s in sts) else "skipped"
    if any(s == "failed" for s in sts):
        return "failed"
    return "partial" if "posted" in sts else "queued"


def open_items(q):
    return [it for it in q["items"] if state(it) in ("queued", "partial")]


# ---------- 排時段 ----------
def next_slot(q, after, cid):
    c = chan(q, cid)
    tz = ZoneInfo(c["tz"])
    after = after.astimezone(tz)
    for d in range(0, 400):
        day = (after + dt.timedelta(days=d)).date()
        for s in sorted(c["slots"]):
            h, m = map(int, s.split(":"))
            t = dt.datetime(day.year, day.month, day.day, h, m, tzinfo=tz)
            if t > after:
                return t
    raise RuntimeError("找不到時段")


def last_time(q, cid):
    ts = [parse(it["scheduled_for"]) for it in q["items"] if it["channel"] == cid and state(it) != "skipped"]
    return max(ts + [now(q, cid)])


# ---------- add ----------
def find_caption(folder, kind):
    names = ["caption-reel.txt", "caption.txt"] if kind == "reel" else ["caption.txt"]
    for n in names:
        if (folder / n).exists():
            return n
    return None


def tags(folder, kind, a):
    """比較成效用的標籤：格式、hook 句型、劇名。"""
    if kind == "carousel":
        fmt = "輪播圖"
    else:
        fmt = "nuance-ladder" if (folder / "ladder.json").exists() else "Ghost 卡影片"
    show = a.show
    if not show and (folder / "slides.json").exists():
        show = json.loads((folder / "slides.json").read_text()).get("show", "")
    if not show:
        show = "原創" if fmt == "nuance-ladder" else folder.name
    hook = (a.hook_reel if kind == "reel" else a.hook_carousel) or ""
    return {"format": fmt, "hook": hook, "show": show.title() if show.isupper() else show}


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True)
    try:
        return round(float(r.stdout), 2)
    except ValueError:
        return None


def cmd_add(q, a):
    folder = (ROOT / a.folder).resolve() if not pathlib.Path(a.folder).is_absolute() else pathlib.Path(a.folder)
    if not folder.is_dir():
        sys.exit(f"找不到資料夾：{folder}")
    rel = folder.relative_to(ROOT)
    topic = folder.name
    found = {}
    finals = sorted(folder.glob("*-final.mp4"))
    if finals:
        found["reel"] = [finals[0].name]
    slides = sorted((folder / "slides").glob("slide_*.png"))
    variants = {}
    if slides:
        found["carousel"] = [f"slides/{p.name}" for p in slides]
        for size, sub in (("3x4", "slides-3x4"), ("9x16", "slides-9x16")):
            vs = sorted((folder / sub).glob("slide_*.png"))
            if vs:
                variants[size] = [f"{sub}/{p.name}" for p in vs]
        show = sorted(folder.glob("*-slideshow.mp4"))
        if show:
            variants["video"] = [show[0].name]
    kinds = [k for k in ("reel", "carousel") if k in found and (not a.only or a.only == k)]
    if not kinds:
        sys.exit("資料夾裡沒有 *-final.mp4 或 slides/slide_*.png")
    cid = a.channel or next(iter(q["channels"]))
    if cid not in q["channels"]:
        sys.exit(f"沒有 {cid} 這個國家（現有：{', '.join(q['channels'])}）")
    at = None
    if a.at:
        at = dt.datetime.fromisoformat(a.at).replace(tzinfo=ZoneInfo(chan(q, cid)["tz"]))
    for kind in kinds:
        iid = f"{cid}-{rel.parent.name}-{topic}-{kind}"
        if any(it["id"] == iid for it in q["items"]):
            print(f"已在排程裡：{iid}（要重排先 skip 或改 queue.json）")
            continue
        cap = find_caption(folder, kind)
        if not cap:
            sys.exit(f"{kind} 缺文案：請先在 {rel}/ 寫 {'caption-reel.txt' if kind == 'reel' else 'caption.txt'}")
        when = at or next_slot(q, last_time(q, cid), cid)
        at = None if a.at is None else next_slot(q, when, cid)   # 同時加兩篇時，第二篇排到下一個時段
        item = {
            "id": iid, "channel": cid, "topic": topic, "kind": kind, "folder": str(rel), "media": found[kind], "caption_file": cap,
            "scheduled_for": when.isoformat(), "added_at": now(q, cid).isoformat(timespec="seconds"),
            "tags": tags(folder, kind, a),
            "platforms": {p: {"status": "queued", "attempts": 0} for p in chan(q, cid)["platforms"][kind]},
        }
        item["caption"] = (folder / cap).read_text().strip()
        if kind == "carousel" and variants:
            item["variants"] = variants
        vid = found[kind][0] if kind == "reel" else (variants.get("video") or [None])[0]
        if vid:
            item["duration"] = duration(folder / vid)
        if CLOUD:
            print(f"上傳 {iid} 的媒體…")
            for m in all_media(item):
                key = f"{iid}/{m}"
                item.setdefault("public_urls", {})[key] = P.upload_public(load_secrets(), folder / m, key)
            item["thumb"] = upload_thumb(folder, item)
        q["items"].append(item)
        print(f"加入 {iid} → {when:%m/%d %H:%M}（{chan(q, cid)['name']}時間）")
    save(q)


def all_media(it):
    return list(dict.fromkeys(it["media"] + [m for v in it.get("variants", {}).values() for m in v]))


def plan(it, name):
    """這篇在這個平台要發成什麼：(adapter 用的 kind, 檔案相對路徑)；None = 沒有適合的版本。"""
    if it["kind"] == "reel":
        return "reel", it["media"]
    v = VARIANT.get(name, "4x5")
    var = it.get("variants", {})
    if v == "4x5":
        return "carousel", it["media"]
    if v == "x4":
        return "carousel", it["media"][:4]
    if v in var:
        return ("reel" if v == "video" else "carousel"), var[v]
    return None


def fetch(it, rels, tmp):
    """本機有檔案就用，沒有（GitHub Actions）就從公開網址下載。"""
    folder = ROOT / it["folder"]
    out = []
    for m in rels:
        f = folder / m
        if not f.exists():
            url = it.get("public_urls", {}).get(f"{it['id']}/{m}")
            if not url:
                raise RuntimeError(f"檔案不見了：{f}")
            f = tmp / m.replace("/", "_")
            r = requests.get(url, timeout=300)
            r.raise_for_status()
            f.write_bytes(r.content)
        out.append(f)
    return out


def caption_for(name, caption):
    if name == "threads":
        return P.threads_text(caption)
    if name == "x":
        return P.x_text(caption)
    return caption


# ---------- 發文 ----------
def post_item(q, it, secrets, dry):
    caption = it.get("caption") or (ROOT / it["folder"] / it["caption_file"]).read_text().strip()
    tmp = pathlib.Path(tempfile.mkdtemp())
    acct = account(secrets, it["channel"])
    for name, ps in it["platforms"].items():
        if ps["status"] not in ("queued",):
            continue
        if name in P.MANUAL:
            if dry:
                print(f"[dry-run] {it['id']} → {NAMES[name]}：會列進「待手動發布」")
                continue
            ps.update(status="manual", due_at=now(q).isoformat(timespec="seconds"))
            log(f"待手動發布 {it['id']} → {NAMES[name]}")
            save(q); continue
        sec = acct.get(name, {})
        pl = plan(it, name)
        kind, rels = pl if pl else (None, [])
        too_long = name == "facebook" and kind == "reel" and (it.get("duration") or 0) > 90
        if dry:
            why = ("沒有適合的版本，會略過" if not pl or kind not in P.SUPPORTS[name] else "影片超過 90 秒，會略過" if too_long
                   else "未設定，會略過" if not sec else f"會發布（{'影片' if kind == 'reel' else '圖片'} {len(rels)} 個：{rels[0]}…）")
            print(f"[dry-run] {it['id']} → {NAMES[name]}：{why}")
            continue
        if not pl or kind not in P.SUPPORTS[name]:
            ps.update(status="skipped", note="沒有這個平台能用的版本（重跑 clip-to-slides 產生各尺寸 / 輪播影片）"); save(q); continue
        if too_long:
            ps.update(status="skipped", note="FB Reels 上限 90 秒"); save(q); continue
        if not sec:
            ps.update(status="skipped", note=f"{chan(q, it['channel'])['name']}帳號未設定（跑 setup_wizard.sh）"); save(q); continue
        try:
            if name in P.NEEDS_URL:
                urls = it.setdefault("public_urls", {})
                keys = [f"{it['id']}/{m}" for m in rels]
                for key, m in zip(keys, rels):
                    if key not in urls:
                        urls[key] = P.upload_public(secrets, fetch(it, [m], tmp)[0], key)
                        save(q)
                media = [urls[k] for k in keys]
            else:
                media = fetch(it, rels, tmp)
            ps["attempts"] += 1
            res = P.ADAPTERS[name](kind, media, caption_for(name, caption), sec)
            ps.update(status="posted", posted_at=now(q).isoformat(timespec="seconds"), **{k: v for k, v in res.items() if v})
            if kind != it["kind"]:
                ps["as"] = kind   # 例如輪播圖改發輪播影片
            ps.pop("error", None)
            log(f"已發布 {it['id']} → {NAMES[name]} {res.get('url', '')}")
        except P.NotConfigured as e:
            ps.update(status="skipped", note=f"未設定：{e}")
        except P.Unsupported as e:
            ps.update(status="skipped", note=str(e))
        except Exception as e:
            ps["error"] = str(e)[:600]
            if ps["attempts"] >= q["settings"]["max_attempts"]:
                ps["status"] = "failed"
            log(f"失敗 {it['id']} → {NAMES[name]}（第 {ps['attempts']} 次）：{e}")
            traceback.print_exc()
        save(q)
        save_secrets(secrets)   # TikTok refresh token 每次會換


# ---------- 成效 ----------
SNAPSHOTS = (("d3", 3), ("d7", 7))   # 發文後第 3、7 天各抓一次（IG 數字最多延遲 48 小時）；第 7 天的為準


def collect_metrics(q, secrets, force=False):
    """到期的成效快照抓下來存進每個平台的 metrics；force = 不管天數，現在抓一次存成 latest。"""
    t = now(q)
    changed = False
    for it in q["items"]:
        acct = account(secrets, it["channel"])
        for name, ps in it["platforms"].items():
            if ps["status"] != "posted" or not ps.get("id") or name not in acct:
                continue
            posted = parse(ps["posted_at"])
            m = ps.setdefault("metrics", {})
            todo = [("latest", 0)] if force else [(k, d) for k, d in SNAPSHOTS if k not in m and t >= posted + dt.timedelta(days=d)]
            tried = ps.get("metrics_tried_at")
            if not force and todo and tried and t - parse(tried) < dt.timedelta(hours=6):
                continue   # 上次失敗不到 6 小時，先不打 API
            for label, _ in todo[-1:]:   # 一次只抓最新該抓的那份（錯過 d3 直接抓 d7 時，d3 就不補）
                ps["metrics_tried_at"] = t.isoformat(timespec="seconds")
                try:
                    m[label] = {"at": t.isoformat(timespec="seconds"), **P.METRICS[name](ps.get("as", it["kind"]), ps["id"], posted, acct[name])}
                    ps.pop("metrics_error", None)
                    log(f"成效 {it['id']} → {NAMES[name]} {label}")
                except Exception as e:
                    ps["metrics_error"] = str(e)[:300]
                    log(f"成效抓取失敗 {it['id']} → {NAMES[name]}：{e}")
                changed = True
    if changed:
        save(q)
        save_secrets(secrets)


def snapshot(ps):
    m = ps.get("metrics", {})
    for k in ("d7", "d3", "latest"):
        if k in m:
            return k, m[k]
    return None, None


def per_k(a, b):
    return round(a / b * 1000, 1) if b else None


def scores(it, name, ps):
    """三個分數：hook（開頭留人，0–1）、keep（收藏 / 分享，每千觸及）、follow（轉追蹤 / 訂閱，每千觸及）。"""
    _, m = snapshot(ps)
    if not m:
        return {}
    g = lambda k: m.get(k) or 0
    out = {}
    if name == "instagram":
        base = g("reach") or g("views")
        out["keep"] = per_k(g("saved") + g("shares"), base)
        if ps.get("as", it["kind"]) == "carousel":
            out["follow"] = per_k(g("follows"), base)
        if "reels_skip_rate" in m:
            sk = m["reels_skip_rate"]
            out["hook"] = round(1 - (sk / 100 if sk > 1 else sk), 3)
        elif m.get("avg_watch_s") and it.get("duration"):
            out["hook"] = round(min(m["avg_watch_s"] / it["duration"], 1), 3)
    elif name == "threads":
        out["keep"] = per_k(g("reposts") + g("quotes") + g("shares"), g("views"))
    elif name == "tiktok":
        out["keep"] = per_k(g("shares"), g("views"))
    elif name == "facebook":
        out["keep"] = per_k(g("shares"), g("views"))
        if m.get("avg_watch_s") and it.get("duration"):
            out["hook"] = round(min(m["avg_watch_s"] / it["duration"], 1), 3)
    elif name == "youtube":
        out["keep"] = per_k(g("shares"), g("views"))
        out["follow"] = per_k(g("subs_gained"), g("views"))
        if m.get("avg_view_pct"):
            out["hook"] = round(m["avg_view_pct"] / 100, 3)
    return {k: v for k, v in out.items() if v is not None}


def median(xs):
    xs = sorted(xs)
    n = len(xs)
    return (xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2) if n else None


def ratios(q):
    """每篇每個平台的 keep 分數 ÷ 同國家同平台同類型其他貼文的中位數（至少 3 篇才比）。回傳 {item id: {平台: 比值}}。"""
    pool = {}
    for it in q["items"]:
        for name, ps in it["platforms"].items():
            k = scores(it, name, ps).get("keep")
            if k is not None:
                pool.setdefault((it["channel"], name, it["kind"]), []).append((it["id"], k))
    out = {}
    for (_, name, _), vals in pool.items():
        for iid, k in vals:
            others = [v for j, v in vals if j != iid]
            med = median(others)
            if len(others) >= 3 and med:
                out.setdefault(iid, {})[name] = k / med
    return out


def rating(r):
    if r is None:
        return "累積中"
    return "🔥" if r >= 1.5 else "冷" if r <= 0.67 else "普通"


def item_ratio(rs):
    return sum(rs.values()) / len(rs) if rs else None


def cmd_metrics(q, a):
    secrets = load_secrets()
    collect_metrics(q, secrets, force=a.now)
    rs = ratios(q)
    for it in sorted(q["items"], key=lambda x: x["scheduled_for"]):
        lines = []
        for name, ps in it["platforms"].items():
            sc = scores(it, name, ps)
            if sc:
                lab, _ = snapshot(ps)
                lines.append(f"  {NAMES[name]:9} {lab:6} " + "  ".join(f"{k}={v}" for k, v in sc.items()))
            elif ps.get("metrics_error"):
                lines.append(f"  {NAMES[name]:9} 失敗：{ps['metrics_error'][:80]}")
        if lines:
            print(f"{it['id']}  {rating(item_ratio(rs.get(it['id'], {})))}  {it.get('tags', {})}")
            print("\n".join(lines))


def with_lock(fn):
    PROMO.mkdir(exist_ok=True)
    with open(PROMO / ".postq.lock", "w") as lk:
        try:
            fcntl.flock(lk, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("另一個 postq 正在跑，跳過")
            return
        fn()


def cmd_post_due(q, a):
    if not a.dry_run:
        try:
            collect_metrics(q, load_secrets())
        except Exception as e:
            log(f"成效抓取出錯：{e}")
    secrets = None
    for cid in q["channels"]:   # 每個國家各自發，一次最多一篇
        t = now(q, cid)
        due = [it for it in open_items(q) if it["channel"] == cid and parse(it["scheduled_for"]) <= t]
        if not due:
            continue
        it = sorted(due, key=lambda x: x["scheduled_for"])[0]
        posted = [parse(p["posted_at"]) for x in q["items"] if x["channel"] == cid and x is not it
                  for p in x["platforms"].values() if p.get("posted_at")]
        gap = q["settings"]["min_gap_hours"]
        if state(it) == "queued" and posted and t - max(posted) < dt.timedelta(hours=gap):
            print(f"距離上一篇不到 {gap} 小時，晚點再發 {it['id']}")
            continue
        if secrets is None:
            secrets = load_secrets()
            if not a.dry_run:
                try:
                    for acct in secrets["channels"].values():
                        P.refresh_meta_tokens(acct)
                    save_secrets(secrets)
                except Exception as e:
                    log(f"換 Meta token 失敗：{e}")
        post_item(q, it, secrets, a.dry_run)
        if state(it) in ("posted", "failed", "skipped"):
            # 錯過的時段往後順延，避免下一篇緊接著發
            cur = t
            for x in sorted(open_items(q), key=lambda x: x["scheduled_for"]):
                if x["channel"] == cid and parse(x["scheduled_for"]) <= t:
                    cur = next_slot(q, cur, cid)
                    x["scheduled_for"] = cur.isoformat()
            save(q)
    if secrets is None:
        print("沒有到期的貼文")
        dashboard(q)


def get(q, iid):
    for it in q["items"]:
        if it["id"] == iid or it["id"].endswith(iid):
            return it
    sys.exit(f"找不到 {iid}")


def cmd_post(q, a):
    it = get(q, a.id)
    secrets = load_secrets()
    if not a.dry_run:
        P.refresh_meta_tokens(account(secrets, it["channel"]))
    post_item(q, it, secrets, a.dry_run)


def cmd_done(q, a):
    """手動發完的平台標記成已發布（小紅書、LINE VOOM…）。"""
    it = get(q, a.id)
    ps = it["platforms"].get(a.platform)
    if not ps:
        sys.exit(f"{it['id']} 沒有排 {a.platform}（有：{', '.join(it['platforms'])}）")
    ps.update(status="posted", posted_at=now(q, it["channel"]).isoformat(timespec="seconds"), **({"url": a.url} if a.url else {}))
    ps.pop("note", None)
    save(q); print(f"已標記 {it['id']} → {NAMES[a.platform]} 已發布")


def cmd_skip(q, a):
    get(q, a.id)["skipped"] = True
    save(q); print("已跳過", a.id)


def cmd_retry(q, a):
    it = get(q, a.id)
    it.pop("skipped", None)
    for name, ps in it["platforms"].items():
        if (not a.platform or name == a.platform) and ps["status"] != "posted":
            ps.update(status="queued", attempts=0)
            ps.pop("error", None); ps.pop("note", None)
    if parse(it["scheduled_for"]) > now(q, it["channel"]):
        it["scheduled_for"] = now(q, it["channel"]).isoformat(timespec="seconds")
    save(q); print("重新排入", it["id"])


def cmd_reschedule(q, a):
    for cid in q["channels"]:
        mine = sorted((it for it in q["items"] if it["channel"] == cid), key=lambda x: x["scheduled_for"])
        cur = now(q, cid)
        posted = [it for it in mine if state(it) in ("posted", "partial")]
        if posted:
            cur = max(cur, max(parse(it["scheduled_for"]) for it in posted))
        for it in mine:
            if state(it) == "queued":
                cur = next_slot(q, cur, cid)
                it["scheduled_for"] = cur.isoformat()
    save(q); cmd_list(q, a)


def cmd_channel(q, a):
    """國家 / 帳號組：list 列出、add 新增、set 修改（時段、時區、語言、平台）。"""
    if a.action == "list" or not a.id:
        for cid, c in q["channels"].items():
            n = sum(1 for it in q["items"] if it["channel"] == cid and state(it) in ("queued", "partial"))
            print(f"{cid:4} {c['name']}  {c['tz']}  {c['lang']}  時段 {'、'.join(c['slots'])}  排隊 {n} 篇  "
                  f"影片→{','.join(c['platforms']['reel'])}  輪播→{','.join(c['platforms']['carousel'])}")
        return
    if a.action == "add":
        if a.id in q["channels"]:
            sys.exit(f"{a.id} 已經存在，用 set 修改")
        if not (a.name and a.tz and a.lang):
            sys.exit("新增要給 --name、--tz（例如 Asia/Tokyo）、--lang（例如 ja）")
        q["channels"][a.id] = json.loads(json.dumps(DEFAULT_CHANNEL))
    elif a.id not in q["channels"]:
        sys.exit(f"沒有 {a.id}")
    c = q["channels"][a.id]
    if a.tz:
        ZoneInfo(a.tz)   # 時區打錯就直接報錯
    for k in ("name", "tz", "lang"):
        if getattr(a, k):
            c[k] = getattr(a, k)
    if a.slots:
        c["slots"] = [x.strip() for x in a.slots.split(",") if x.strip()]
    if a.reel is not None:
        c["platforms"]["reel"] = [x for x in a.reel.split(",") if x]
    if a.carousel is not None:
        c["platforms"]["carousel"] = [x for x in a.carousel.split(",") if x]
    bad = [p for k in ("reel", "carousel") for p in c["platforms"][k] if p not in NAMES]
    if bad:
        sys.exit(f"不認得的平台：{bad}")
    save(q)
    a.action = "list"; a.id = None
    cmd_channel(q, a)


def cmd_list(q, a):
    icon = {"posted": "✅", "queued": "·", "skipped": "–", "failed": "❌", "manual": "✋"}
    rs = ratios(q)
    for it in sorted(q["items"], key=lambda x: x["scheduled_for"]):
        ps = " ".join(f"{NAMES[n][:2]}{icon[p['status']]}" for n, p in it["platforms"].items())
        rt = rating(item_ratio(rs.get(it["id"], {}))) if state(it) in ("posted", "partial") else ""
        when = parse(it["scheduled_for"]).astimezone(ZoneInfo(chan(q, it["channel"])["tz"]))
        print(f"{when:%m/%d %H:%M} {it['channel']:3} {state(it):8} {it['id']:54} {ps}  {rt}")
    if not q["items"]:
        print("排程是空的")


# ---------- 看板 ----------
def make_thumb(video, out):
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "1", "-i", str(video), "-frames:v", "1",
                    "-vf", "scale=360:-1", "-q:v", "4", str(out)], capture_output=True)


def upload_thumb(folder, it):
    if it["kind"] == "carousel":
        return next(iter(it["public_urls"].values()))
    with tempfile.TemporaryDirectory() as d:
        out = pathlib.Path(d) / "thumb.jpg"
        make_thumb(folder / it["media"][0], out)
        return P.upload_public(load_secrets(), out, f"{it['id']}/thumb.jpg")


def thumb(it):
    if it.get("thumb"):
        return it["thumb"]
    folder = ROOT / it["folder"]
    if it["kind"] == "carousel":
        return os.path.relpath(folder / it["media"][0], PROMO)
    out = PROMO / ".dashboard" / f"{it['id']}.jpg"
    if not out.exists():
        make_thumb(folder / it["media"][0], out)
    return os.path.relpath(out, PROMO)


def dashboard(q):
    e = html.escape
    t = now(q)
    chip_cls = {"posted": "ok", "queued": "wait", "skipped": "off", "failed": "bad", "manual": "todo"}
    chip_txt = {"posted": "已發", "queued": "排隊", "skipped": "略過", "failed": "失敗", "manual": "待手動"}

    def chips(it):
        out = []
        for n, p in it["platforms"].items():
            tip = e(p.get("error") or p.get("note") or "")
            label = f"{NAMES[n]} · {chip_txt[p['status']]}"
            out.append(f'<a class="chip {chip_cls[p["status"]]}" href="{e(p["url"])}" target="_blank" title="{tip}">{label}</a>'
                       if p.get("url") else f'<span class="chip {chip_cls[p["status"]]}" title="{tip}">{label}</span>')
        return "".join(out)

    rs = ratios(q)
    LBL = {"hook": "開頭留人", "keep": "收藏分享", "follow": "轉追蹤"}

    def fmt_score(k, v):
        return f"{v * 100:.0f}%" if k == "hook" else f"{v:g}‰"

    def perf(it):
        rows = []
        for n, p in it["platforms"].items():
            sc = scores(it, n, p)
            if not sc:
                if p.get("metrics_error"):
                    rows.append(f'<div class="note">{NAMES[n]} 成效：{e(p["metrics_error"])}</div>')
                continue
            lab, _ = snapshot(p)
            r = rs.get(it["id"], {}).get(n)
            rows.append(f'<div class="perf"><b>{NAMES[n]}</b> ' + " · ".join(f"{LBL[k]} {fmt_score(k, v)}" for k, v in sc.items())
                        + f' <span class="dim">（{ {"d7": "第 7 天", "d3": "第 3 天", "latest": "即時"}[lab]}{"" if r is None else f"，中位數的 {r:.1f} 倍"}）</span></div>')
        if not rows:
            return ""
        rt = rating(item_ratio(rs.get(it["id"], {})))
        return f'<div class="rate r-{ {"🔥": "hot", "冷": "cold", "普通": "mid"}.get(rt, "wait")}">{rt}</div>' + "".join(rows)

    def card(it, big=False):
        when = parse(it["scheduled_for"]).astimezone(ZoneInfo(chan(q, it["channel"])["tz"]))
        kind = "影片" if it["kind"] == "reel" else f"輪播 {len(it['media'])} 張"
        errs = "".join(f'<div class="err">{NAMES[n]}：{e(p["error"])}</div>' for n, p in it["platforms"].items() if p.get("error"))
        notes = "".join(f'<div class="note">{NAMES[n]}：{e(p["note"])}</div>' for n, p in it["platforms"].items() if p.get("note"))
        return (f'<div class="card{" big" if big else ""}"><img src="{e(thumb(it))}" loading="lazy">'
                f'<div class="meta"><div class="when" data-t="{when.isoformat()}">{when:%m/%d (%a) %H:%M}</div>'
                f'<div class="title">{e(it["topic"])}</div><div class="kind">{kind}</div>'
                f'<div class="chips">{chips(it)}</div>{perf(it)}{errs}{notes}</div></div>')

    def compare(items):
        blocks = []
        for key, title in (("format", "格式"), ("hook", "Hook 句型"), ("show", "劇名")):
            groups = {}
            for it in items:
                r = item_ratio(rs.get(it["id"], {}))
                if r is not None:
                    groups.setdefault(it.get("tags", {}).get(key) or "未標記", []).append(r)
            if not groups:
                continue
            rows = sorted(((sum(v) / len(v), g, len(v)) for g, v in groups.items()), reverse=True)
            blocks.append(f'<div class="cmp"><h3>{title}</h3>' + "".join(
                f'<div class="row"><span>{e(g)}</span><span class="bar"><i style="width:{min(r / 2, 1) * 100:.0f}%"></i></span>'
                f'<span class="num">{r:.2f}×</span><span class="dim">{n} 篇</span></div>' for r, g, n in rows) + "</div>")
        return "".join(blocks) or '<div class="empty">要累積幾篇有第 3 / 7 天數字的貼文（同平台同類型至少 4 篇）才比得出來。</div>'

    def manual_box(it):
        rows = []
        for n, p in it["platforms"].items():
            if p["status"] != "manual":
                continue
            pl = plan(it, n)
            rels = pl[1] if pl else it["media"]
            urls = it.get("public_urls", {})
            links = " ".join(f'<a href="{e(urls.get(it["id"] + "/" + m) or str(ROOT / it["folder"] / m))}" target="_blank">{e(m)}</a>'
                             for m in rels)
            cap = caption_for(n, it.get("caption", ""))
            title = (f'<div class="kind">標題（20 字內）：{e(cap.splitlines()[0][:20])}</div>' if n == "xiaohongshu" and cap else "")
            rows.append(f'<div class="perf"><b>{NAMES[n]}</b></div>{title}<div class="kind">素材：{links}</div>'
                        f'<textarea readonly onclick="this.select()">{e(cap)}</textarea>'
                        f'<div class="note">發完後：postq.py done {e(it["id"])} --platform {e(n)} --url &lt;貼文網址&gt;</div>')
        return (f'<div class="card manual"><img src="{e(thumb(it))}" loading="lazy"><div class="meta">'
                f'<div class="title">{e(it["topic"])}</div>{"".join(rows)}</div></div>')

    def section(cid):
        c = chan(q, cid)
        items = sorted((it for it in q["items"] if it["channel"] == cid), key=lambda x: x["scheduled_for"])
        upcoming = [it for it in items if state(it) in ("queued", "partial")]
        done = [it for it in reversed(items) if state(it) not in ("queued", "partial")]
        nxt = upcoming[0] if upcoming else None
        todo = [it for it in items if any(p["status"] == "manual" for p in it["platforms"].values())]
        counts = {k: sum(1 for it in items if state(it) == k) for k in ("queued", "partial", "posted", "failed")}
        head = (f'<h1 class="ch" id="ch-{e(cid)}">{e(c["name"])} <span class="dim">{e(cid)} · {e(c["lang"])}</span></h1>'
                if multi else "")
        return f"""{head}<div class="sub">每天 {"、".join(c["slots"])}（{e(c["tz"])}）發文</div>
<div class="stats"><div class="stat"><b>{counts["queued"] + counts["partial"]}</b>排隊中</div><div class="stat"><b>{counts["posted"]}</b>已發布</div><div class="stat"><b>{counts["failed"]}</b>失敗</div></div>
{f'<h2>待手動發布（{len(todo)}）</h2>' + "".join(manual_box(it) for it in todo) if todo else ""}
<h2>下一篇</h2>{card(nxt, True) if nxt else f'<div class="empty">排程是空的。做完新片段後跑 postq.py add &lt;資料夾&gt; --channel {e(cid)}</div>'}
<h2>之後</h2>{"".join(card(it) for it in upcoming[1:]) or '<div class="empty">沒有了</div>'}
<h2>哪種比較好（收藏分享率，跟中位數比；1× = 一般）</h2>{compare(items)}
<h2>已發布 / 結束</h2>{"".join(card(it) for it in done) or '<div class="empty">還沒有</div>'}"""

    multi = len(q["channels"]) > 1
    mode = ("" if CLOUD else '<div class="warn">本機測試模式：資料只在這台 Mac，GitHub Actions 不會發這裡的貼文</div>')
    nav = ('<div class="nav">' + "".join(f'<a href="#ch-{e(cid)}">{e(c["name"])}</a>' for cid, c in q["channels"].items()) + "</div>"
           if multi else "")
    body = f"""<h1>Nuances 發文排程</h1><div class="sub">更新於 {t:%m/%d %H:%M}</div>
{mode}{nav}{"".join(section(cid) for cid in q["channels"])}"""
    if CLOUD:
        cloud_put("state/view.json", json.dumps({"html": body}, ensure_ascii=False).encode(), bucket=PUBLIC)
        view = f"{CLOUD['url']}/storage/v1/object/public/{PUBLIC}/state/view.json"
        if PROMO.parent.exists() and not os.environ.get("GITHUB_ACTIONS"):
            PROMO.mkdir(exist_ok=True)
            DASH.write_text(page_html('<div class="empty">讀取中…</div>', view))
    else:
        PROMO.mkdir(parents=True, exist_ok=True)
        DASH.write_text(page_html(body))


def page_html(body, live_url=None):
    """live_url：打開時從雲端抓 view.json 填進來（每分鐘重抓）；沒有就是靜態頁。"""
    load_js = "" if not live_url else f"""
async function load(){{try{{const r=await fetch({json.dumps(live_url)}+'?t='+Date.now());const j=await r.json();
document.querySelector('main').innerHTML=j.html;tick()}}catch(e){{document.querySelector('main').innerHTML='<div class="warn">讀不到雲端資料：'+e+'</div>'}}}}
load();setInterval(load,60000);"""
    return f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nuances 發文排程</title>{'' if live_url else '<meta http-equiv="refresh" content="60">'}
<style>
:root{{--bg:#0E0F12;--panel:#17191E;--ink:#F5F6F8;--mute:#9BA1AB;--blue:#4EAFF4;--line:rgba(255,255,255,.08)}}
*{{box-sizing:border-box;margin:0}}body{{background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,"PingFang TC",sans-serif;padding:28px 16px 60px}}
main{{max-width:980px;margin:auto}}h1{{font-size:24px}}h2{{font-size:15px;color:var(--mute);font-weight:600;margin:34px 0 12px;letter-spacing:.5px}}
.sub{{color:var(--mute);margin-top:4px}}.stats{{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}}
.stat{{background:var(--panel);border-radius:12px;padding:10px 16px}}.stat b{{font-size:22px;display:block}}
.card{{display:flex;gap:16px;background:var(--panel);border-radius:14px;padding:12px;margin-bottom:10px;border:1px solid var(--line)}}
.card img{{width:96px;height:120px;object-fit:cover;border-radius:8px;flex:none;background:#000}}
.card.big{{border-color:var(--blue)}}.card.big img{{width:150px;height:188px}}
.when{{color:var(--blue);font-weight:700}}.title{{font-size:18px;font-weight:700}}.kind{{color:var(--mute);font-size:13px}}
.count{{color:var(--ink);font-weight:600;margin-left:6px}}
.chips{{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}}.chip{{font-size:12px;padding:3px 10px;border-radius:99px;text-decoration:none;color:var(--ink)}}
.ok{{background:rgba(52,199,89,.18);color:#5DDB7F}}.wait{{background:rgba(255,255,255,.08);color:var(--mute)}}
.off{{background:transparent;border:1px solid var(--line);color:#6B7079}}.bad{{background:rgba(255,69,58,.18);color:#FF6B61}}
a.chip:hover{{text-decoration:underline}}.err{{color:#FF6B61;font-size:12px;margin-top:6px;word-break:break-all}}.note{{color:#6B7079;font-size:12px;margin-top:4px}}
.empty{{color:var(--mute);padding:20px;background:var(--panel);border-radius:14px}}
.warn{{background:rgba(255,159,10,.15);color:#FFB340;padding:10px 14px;border-radius:10px;margin-top:16px}}
.perf{{font-size:13px;margin-top:6px}}.dim{{color:#6B7079}}
.rate{{display:inline-block;font-size:12px;font-weight:700;padding:2px 10px;border-radius:6px;margin-top:8px}}
.r-hot{{background:rgba(255,149,0,.2);color:#FFB340}}.r-mid{{background:rgba(255,255,255,.08)}}.r-cold{{background:rgba(78,175,244,.15);color:var(--blue)}}.r-wait{{color:var(--mute)}}
.cmp{{background:var(--panel);border-radius:14px;padding:14px 16px;margin-bottom:10px}}.cmp h3{{font-size:14px;margin-bottom:8px}}
.row{{display:grid;grid-template-columns:minmax(90px,180px) 1fr 56px 48px;gap:10px;align-items:center;font-size:13px;padding:3px 0}}
.bar{{height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden}}.bar i{{display:block;height:100%;background:var(--blue)}}
.num{{text-align:right;font-weight:700}}
.todo{{background:rgba(255,159,10,.18);color:#FFB340}}.card.manual{{border-color:#FFB340}}.card.manual a{{color:var(--blue)}}
textarea{{width:100%;min-height:110px;margin-top:8px;background:#0E0F12;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px;font:13px/1.5 -apple-system,"PingFang TC",sans-serif}}
h1.ch{{margin-top:48px;padding-top:20px;border-top:1px solid var(--line)}}
.nav{{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}}.nav a{{color:var(--ink);background:var(--panel);padding:6px 14px;border-radius:99px;text-decoration:none;font-size:14px}}
@media(max-width:520px){{.card img{{width:72px;height:90px}}.card.big img{{width:96px;height:120px}}}}
</style></head><body><main>{body}</main><script>
function tick(){{document.querySelectorAll('.big .when').forEach(el=>{{const d=new Date(el.dataset.t)-Date.now();
if(d>0){{const h=Math.floor(d/36e5),m=Math.floor(d%36e5/6e4);el.insertAdjacentHTML('beforeend',`<span class="count">· ${{h?h+' 小時 ':''}}${{m}} 分後</span>`)}}}})}}
tick();{load_js}
</script></body></html>"""


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    x = sp.add_parser("add"); x.add_argument("folder"); x.add_argument("--only", choices=["reel", "carousel"]); x.add_argument("--at")
    x.add_argument("--show", help="劇名（預設讀 slides.json 的 show）"); x.add_argument("--hook-reel", help="影片的 hook 句型")
    x.add_argument("--hook-carousel", default="打破你以為的", help="輪播圖的 hook 句型")
    x.add_argument("--channel", help="排到哪個國家（預設第一個，通常是 tw）")
    x = sp.add_parser("channel"); x.add_argument("action", choices=["list", "add", "set"], nargs="?", default="list")
    x.add_argument("id", nargs="?"); x.add_argument("--name"); x.add_argument("--tz"); x.add_argument("--lang")
    x.add_argument("--slots", help="逗號分隔，例如 12:30,20:00"); x.add_argument("--reel", help="影片發哪些平台，逗號分隔")
    x.add_argument("--carousel", help="輪播圖發哪些平台，逗號分隔")
    x = sp.add_parser("metrics"); x.add_argument("--now", action="store_true", help="不管天數，現在抓一次")
    sp.add_parser("list"); sp.add_parser("dashboard"); sp.add_parser("reschedule")
    x = sp.add_parser("post-due"); x.add_argument("--dry-run", action="store_true")
    x = sp.add_parser("post"); x.add_argument("id"); x.add_argument("--dry-run", action="store_true")
    x = sp.add_parser("skip"); x.add_argument("id")
    x = sp.add_parser("done"); x.add_argument("id"); x.add_argument("--platform", required=True, choices=list(NAMES)); x.add_argument("--url")
    x = sp.add_parser("retry"); x.add_argument("id"); x.add_argument("--platform", choices=list(NAMES))
    x = sp.add_parser("push-secrets"); x.add_argument("--only"); x.add_argument("--channel", default="tw")
    a = ap.parse_args()
    fns = {"add": cmd_add, "list": cmd_list, "dashboard": lambda q, a: (dashboard(q), print(DASH)), "reschedule": cmd_reschedule,
           "post-due": cmd_post_due, "post": cmd_post, "skip": cmd_skip, "retry": cmd_retry,
           "push-secrets": cmd_push_secrets, "metrics": cmd_metrics, "channel": cmd_channel, "done": cmd_done}
    if a.cmd in ("post-due", "post", "add", "skip", "retry", "reschedule", "metrics", "channel", "done"):
        with_lock(lambda: fns[a.cmd](load(), a))
    else:
        fns[a.cmd](load(), a)


if __name__ == "__main__":
    main()
