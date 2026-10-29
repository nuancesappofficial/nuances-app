"""各平台發文 adapter + 媒體上傳（Supabase Storage 公開網址）。

每個 adapter：post(kind, media, caption, sec) -> {"id", "url"}；kind = "reel" | "carousel"。
media：reel = [影片路徑]、carousel = [圖片路徑…]。sec = secrets.json 裡該平台的那一段（會被就地更新 token）。
IG / Threads 只吃公開網址，所以先把檔案傳到 Supabase；TikTok / YouTube 直接上傳檔案。
"""
import io, json, mimetypes, pathlib, time
import requests
from PIL import Image

TIMEOUT = 60


class NotConfigured(Exception):
    pass


class Unsupported(Exception):
    pass


def _check(r):
    if r.status_code >= 400:
        raise RuntimeError(f"{r.request.method} {r.url.split('?')[0]} → {r.status_code}: {r.text[:500]}")
    return r.json() if r.content else {}


def need(sec, *keys):
    missing = [k for k in keys if not sec.get(k)]
    if missing:
        raise NotConfigured("缺少 " + ", ".join(missing))


# ---------- 媒體上傳 ----------
def sb_headers(key):
    """Supabase 金鑰：新版 secret key（sb_secret_…）只放 apikey；舊版 service_role（JWT，eyJ…）兩個都放。"""
    h = {"apikey": key}
    if key.startswith("eyJ"):
        h["Authorization"] = f"Bearer {key}"
    return h

def upload_public(secrets, path, key):
    """上傳到 Supabase Storage 公開 bucket，回傳公開網址。PNG 轉成 JPEG（IG 輪播只收 JPEG）。"""
    s = secrets.get("supabase", {})
    need(s, "url", "service_key", "bucket")
    path = pathlib.Path(path)
    if path.suffix.lower() == ".png":
        buf = io.BytesIO()
        Image.open(path).convert("RGB").save(buf, "JPEG", quality=92)
        body, ctype, key = buf.getvalue(), "image/jpeg", str(pathlib.Path(key).with_suffix(".jpg"))
    else:
        body, ctype = path.read_bytes(), mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    base = s["url"].rstrip("/")
    r = requests.post(f"{base}/storage/v1/object/{s['bucket']}/{key}", data=body, timeout=300,
                      headers={**sb_headers(s["service_key"]), "Content-Type": ctype, "x-upsert": "true"})
    _check(r)
    return f"{base}/storage/v1/object/public/{s['bucket']}/{key}"


# ---------- Meta 共用（IG / Threads 都是 container → 等處理 → publish） ----------
def _wait(get_status, ok, label):
    for _ in range(60):          # 最多約 5 分鐘
        st = get_status()
        if st in ok:
            return
        if st in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"{label} 處理失敗：{st}")
        time.sleep(5)
    raise RuntimeError(f"{label} 處理逾時")


def ig_api(sec):
    """IG 有兩條路：Instagram 登入（graph.instagram.com，IG token 60 天）；
    Facebook 登入（graph.facebook.com，IG 要連到粉專，用粉專 token、不會過期）→ sec["via"] == "facebook"。"""
    return FB if sec.get("via") == "facebook" else "https://graph.instagram.com/v21.0"


def instagram(kind, urls, caption, sec):
    need(sec, "user_id", "token")
    api, uid = ig_api(sec), sec["user_id"]
    tok = {"access_token": sec["token"]}
    status = lambda cid: _check(requests.get(f"{api}/{cid}", params={**tok, "fields": "status_code"}, timeout=TIMEOUT)).get("status_code")
    if kind == "reel":
        cid = _check(requests.post(f"{api}/{uid}/media", data={**tok, "media_type": "REELS", "video_url": urls[0],
                                                                 "caption": caption, "share_to_feed": "true"}, timeout=TIMEOUT))["id"]
    else:
        kids = [_check(requests.post(f"{api}/{uid}/media", data={**tok, "image_url": u, "is_carousel_item": "true"},
                                     timeout=TIMEOUT))["id"] for u in urls]
        for k in kids:
            _wait(lambda: status(k), ("FINISHED",), "IG 圖片")
        cid = _check(requests.post(f"{api}/{uid}/media", data={**tok, "media_type": "CAROUSEL", "children": ",".join(kids),
                                                                 "caption": caption}, timeout=TIMEOUT))["id"]
    _wait(lambda: status(cid), ("FINISHED",), "IG 容器")
    mid = _check(requests.post(f"{api}/{uid}/media_publish", data={**tok, "creation_id": cid}, timeout=TIMEOUT))["id"]
    link = _check(requests.get(f"{api}/{mid}", params={**tok, "fields": "permalink"}, timeout=TIMEOUT)).get("permalink", "")
    return {"id": mid, "url": link}


def threads(kind, urls, caption, sec):
    need(sec, "user_id", "token")
    api, uid = "https://graph.threads.net/v1.0", sec["user_id"]
    tok = {"access_token": sec["token"]}
    text = threads_text(caption)
    status = lambda cid: _check(requests.get(f"{api}/{cid}", params={**tok, "fields": "status"}, timeout=TIMEOUT)).get("status")
    if kind == "reel":
        cid = _check(requests.post(f"{api}/{uid}/threads", data={**tok, "media_type": "VIDEO", "video_url": urls[0], "text": text},
                                   timeout=TIMEOUT))["id"]
    else:
        kids = [_check(requests.post(f"{api}/{uid}/threads", data={**tok, "media_type": "IMAGE", "image_url": u,
                                                                    "is_carousel_item": "true"}, timeout=TIMEOUT))["id"] for u in urls]
        for k in kids:
            _wait(lambda: status(k), ("FINISHED",), "Threads 圖片")
        cid = _check(requests.post(f"{api}/{uid}/threads", data={**tok, "media_type": "CAROUSEL", "children": ",".join(kids),
                                                                  "text": text}, timeout=TIMEOUT))["id"]
    _wait(lambda: status(cid), ("FINISHED",), "Threads 容器")
    mid = _check(requests.post(f"{api}/{uid}/threads_publish", data={**tok, "creation_id": cid}, timeout=TIMEOUT))["id"]
    link = _check(requests.get(f"{api}/{mid}", params={**tok, "fields": "permalink"}, timeout=TIMEOUT)).get("permalink", "")
    return {"id": mid, "url": link}


def threads_text(caption, limit=500):
    """Threads 上限 500 字：保留開頭，hashtag 只留第一個（Threads 一篇只認一個 topic tag）。"""
    lines = [l for l in caption.splitlines() if not l.strip().startswith("#")]
    tags = [w for w in caption.split() if w.startswith("#")][:1]
    text = "\n".join(lines).strip() + ("\n\n" + tags[0] if tags else "")
    return text if len(text) <= limit else text[:limit - 1] + "…"


def youtube_token(sec):
    need(sec, "client_id", "client_secret", "refresh_token")
    return _check(requests.post("https://oauth2.googleapis.com/token", timeout=TIMEOUT, data={
        "client_id": sec["client_id"], "client_secret": sec["client_secret"],
        "refresh_token": sec["refresh_token"], "grant_type": "refresh_token"}))["access_token"]


def tiktok_headers(sec):
    need(sec, "client_key", "client_secret", "refresh_token")
    t = _check(requests.post("https://open.tiktokapis.com/v2/oauth/token/", timeout=TIMEOUT, data={
        "client_key": sec["client_key"], "client_secret": sec["client_secret"],
        "grant_type": "refresh_token", "refresh_token": sec["refresh_token"]}))
    sec["refresh_token"] = t.get("refresh_token", sec["refresh_token"])   # TikTok 每次會換新的 refresh token
    return {"Authorization": f"Bearer {t['access_token']}", "Content-Type": "application/json; charset=UTF-8"}


def x_text(caption, limit=280):
    """X 上限 280（中日韓字算 2）：留第一行 hook、CTA 那行、前 2 個 hashtag。"""
    lines = [l.strip() for l in caption.splitlines() if l.strip()]
    tags = [w for w in caption.split() if w.startswith("#")][:2]
    body = [l for l in lines if not l.startswith("#")]
    keep = [body[0]] + [l for l in body[1:] if "Nuances" in l][:1] if body else []
    text = "\n\n".join(keep + ([" ".join(tags)] if tags else []))
    w = lambda t: sum(2 if ord(c) > 0x2E7F else 1 for c in t)
    while w(text) > limit and len(text) > 1:
        text = text[:-2] + "…"
    return text


# ---------- YouTube Shorts ----------
def youtube(kind, files, caption, sec):
    if kind != "reel":
        raise Unsupported("YouTube 只發影片")
    at = youtube_token(sec)
    first = caption.strip().splitlines()[0] if caption.strip() else "Nuances"
    title = (first[:90] + " #Shorts")[:100]
    meta = {"snippet": {"title": title, "description": caption, "categoryId": "27", "defaultLanguage": "zh-TW"},
            "status": {"privacyStatus": sec.get("privacy", "public"), "selfDeclaredMadeForKids": False}}
    path = pathlib.Path(files[0])
    r = requests.post("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
                      json=meta, timeout=TIMEOUT, headers={"Authorization": f"Bearer {at}", "X-Upload-Content-Type": "video/mp4",
                                                           "X-Upload-Content-Length": str(path.stat().st_size)})
    _check(r)
    vid = _check(requests.put(r.headers["Location"], data=path.read_bytes(), timeout=600,
                              headers={"Authorization": f"Bearer {at}", "Content-Type": "video/mp4"}))["id"]
    return {"id": vid, "url": f"https://youtube.com/shorts/{vid}"}


# ---------- TikTok ----------
def tiktok(kind, files, caption, sec):
    if kind != "reel":
        raise Unsupported("TikTok 圖文要驗證網域才能用（PULL_FROM_URL），先只發影片")
    h = tiktok_headers(sec)
    api = "https://open.tiktokapis.com/v2/post/publish"
    info = _check(requests.post(f"{api}/creator_info/query/", headers=h, timeout=TIMEOUT))["data"]
    privacy = sec.get("privacy", "PUBLIC_TO_EVERYONE")
    if privacy not in info.get("privacy_level_options", []):
        privacy = "SELF_ONLY"   # App 還沒通過 TikTok 審核時只能發私人
    path = pathlib.Path(files[0])
    size = path.stat().st_size
    d = _check(requests.post(f"{api}/video/init/", headers=h, timeout=TIMEOUT, json={
        "post_info": {"title": caption[:2200], "privacy_level": privacy, "disable_comment": False,
                      "disable_duet": False, "disable_stitch": False},
        "source_info": {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": size, "total_chunk_count": 1}}))["data"]
    up = requests.put(d["upload_url"], data=path.read_bytes(), timeout=600,
                      headers={"Content-Type": "video/mp4", "Content-Range": f"bytes 0-{size - 1}/{size}"})
    if up.status_code >= 400:
        raise RuntimeError(f"TikTok 上傳失敗 {up.status_code}: {up.text[:300]}")
    for _ in range(60):
        st = _check(requests.post(f"{api}/status/fetch/", headers=h, timeout=TIMEOUT, json={"publish_id": d["publish_id"]}))["data"]
        if st.get("status") == "PUBLISH_COMPLETE":
            ids = st.get("publicaly_available_post_id") or st.get("publicly_available_post_id") or []
            return {"id": str(ids[0]) if ids else d["publish_id"], "url": "", "note": "" if privacy != "SELF_ONLY" else "僅自己可見（App 未審核）"}
        if st.get("status") == "FAILED":
            raise RuntimeError(f"TikTok 發布失敗：{st.get('fail_reason')}")
        time.sleep(5)
    raise RuntimeError("TikTok 處理逾時")


# ---------- Facebook 粉專 ----------
FB = "https://graph.facebook.com/v23.0"


def facebook(kind, urls, caption, sec):
    """影片 → 粉專 Reels（用公開網址讓 FB 自己抓檔）；輪播圖 → 多圖貼文。sec = {page_id, token(粉專 token)}。"""
    need(sec, "page_id", "token")
    pid, tok = sec["page_id"], sec["token"]
    if kind == "reel":
        vid = _check(requests.post(f"{FB}/{pid}/video_reels", data={"upload_phase": "start", "access_token": tok}, timeout=TIMEOUT))["video_id"]
        _check(requests.post(f"https://rupload.facebook.com/video-upload/v23.0/{vid}", timeout=TIMEOUT,
                             headers={"Authorization": f"OAuth {tok}", "file_url": urls[0]}))
        def uploaded():
            st = _check(requests.get(f"{FB}/{vid}", params={"fields": "status", "access_token": tok}, timeout=TIMEOUT)).get("status", {})
            if st.get("video_status") in ("upload_failed", "error", "expired"):
                return "ERROR"
            done = st.get("uploading_phase", {}).get("status") == "complete" or st.get("video_status") in ("upload_complete", "processing", "ready")
            return "OK" if done else "WAIT"
        _wait(uploaded, ("OK",), "FB 影片上傳")
        _check(requests.post(f"{FB}/{pid}/video_reels", timeout=TIMEOUT, data={
            "video_id": vid, "upload_phase": "finish", "video_state": "PUBLISHED", "description": caption, "access_token": tok}))
        return {"id": vid, "url": f"https://www.facebook.com/reel/{vid}"}
    photos = [_check(requests.post(f"{FB}/{pid}/photos", data={"url": u, "published": "false", "access_token": tok},
                                   timeout=TIMEOUT))["id"] for u in urls]
    post = _check(requests.post(f"{FB}/{pid}/feed", timeout=TIMEOUT, data={
        "message": caption, "attached_media": json.dumps([{"media_fbid": x} for x in photos]), "access_token": tok}))["id"]
    return {"id": post, "url": f"https://www.facebook.com/{post}"}


# 哪些平台要先把檔案傳到公開網址
NEEDS_URL = {"instagram", "threads", "facebook"}
ADAPTERS = {"instagram": instagram, "threads": threads, "tiktok": tiktok, "youtube": youtube, "facebook": facebook}
SUPPORTS = {"instagram": {"reel", "carousel"}, "threads": {"reel", "carousel"}, "tiktok": {"reel"}, "youtube": {"reel"},
            "facebook": {"reel", "carousel"}}
# 沒有開放發文 API 的平台：時間到時看板會列出來，使用者手動發完再用 postq.py done 標記
MANUAL = {"xiaohongshu": "小紅書", "douyin": "抖音", "bilibili": "Bilibili", "line_voom": "LINE VOOM", "dcard": "Dcard",
          "naver_blog": "Naver Blog", "x": "X"}


def refresh_meta_tokens(secrets):
    """IG / Threads 長效 token 60 天過期；剩不到 20 天就換新。"""
    now = time.time()
    for name, url, grant in (("instagram", "https://graph.instagram.com/refresh_access_token", "ig_refresh_token"),
                             ("threads", "https://graph.threads.net/refresh_access_token", "th_refresh_token")):
        sec = secrets.get(name, {})
        if not sec.get("token") or "token_expires" not in sec or sec["token_expires"] - now > 20 * 86400:
            continue
        j = _check(requests.get(url, params={"grant_type": grant, "access_token": sec["token"]}, timeout=TIMEOUT))
        sec["token"], sec["token_expires"] = j["access_token"], now + int(j.get("expires_in", 5184000))


# ---------- 成效數字 ----------
# 每個 fetcher：metrics(kind, post_id, posted_at(datetime), sec) -> {指標: 數字}；拿不到的指標就不放。
IG_METRICS = {"reel": ["reach", "views", "likes", "comments", "saved", "shares", "ig_reels_avg_watch_time", "reels_skip_rate"],
              "carousel": ["reach", "views", "likes", "comments", "saved", "shares", "follows", "profile_visits"]}


def _meta_insights(api, mid, names, tok, edge="insights"):
    """一次要全部；有指標不支援（API 會整批報錯）就改成一個一個要，略過失敗的。"""
    def fetch(ns):
        r = requests.get(f"{api}/{mid}/{edge}", params={"metric": ",".join(ns), "access_token": tok}, timeout=TIMEOUT)
        if r.status_code >= 400:
            return None
        out = {}
        for d in r.json().get("data", []):
            v = d.get("values", [{}])[0].get("value") if d.get("values") else d.get("total_value", {}).get("value")
            if isinstance(v, (int, float)):
                out[d["name"]] = v
        return out
    got = fetch(names)
    if got is None:
        got = {}
        for n in names:
            got.update(fetch([n]) or {})
    if not got:
        raise RuntimeError("拿不到任何成效數字（權限不足或貼文太新）")
    return got


def instagram_metrics(kind, mid, posted_at, sec):
    need(sec, "token")
    m = _meta_insights(ig_api(sec), mid, IG_METRICS[kind], sec["token"])
    if "ig_reels_avg_watch_time" in m:
        m["avg_watch_s"] = m.pop("ig_reels_avg_watch_time") / 1000   # API 給毫秒
    return m


def threads_metrics(kind, mid, posted_at, sec):
    need(sec, "token")
    return _meta_insights("https://graph.threads.net/v1.0", mid, ["views", "likes", "replies", "reposts", "quotes", "shares"], sec["token"])


def tiktok_metrics(kind, vid, posted_at, sec):
    h = tiktok_headers(sec)
    j = _check(requests.post("https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count",
                             headers=h, json={"filters": {"video_ids": [vid]}}, timeout=TIMEOUT))
    vids = j.get("data", {}).get("videos", [])
    if not vids:
        raise RuntimeError("TikTok 查不到這支影片（僅自己可見的影片可能沒有 ID）")
    v = vids[0]
    return {"views": v.get("view_count", 0), "likes": v.get("like_count", 0),
            "comments": v.get("comment_count", 0), "shares": v.get("share_count", 0)}


def youtube_metrics(kind, vid, posted_at, sec):
    at = youtube_token(sec)
    today = time.strftime("%Y-%m-%d")
    j = _check(requests.get("https://youtubeanalytics.googleapis.com/v2/reports", timeout=TIMEOUT,
                            headers={"Authorization": f"Bearer {at}"},
                            params={"ids": "channel==MINE", "startDate": posted_at.strftime("%Y-%m-%d"), "endDate": today,
                                    "metrics": "views,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained",
                                    "filters": f"video=={vid}"}))
    rows = j.get("rows") or []
    if not rows:
        raise RuntimeError("YouTube 還沒有數字（通常要 1–2 天）")
    cols = [c["name"] for c in j["columnHeaders"]]
    m = dict(zip(cols, rows[0]))
    return {"views": m.get("views", 0), "avg_watch_s": m.get("averageViewDuration", 0),
            "avg_view_pct": m.get("averageViewPercentage", 0), "likes": m.get("likes", 0), "comments": m.get("comments", 0),
            "shares": m.get("shares", 0), "subs_gained": m.get("subscribersGained", 0)}


def facebook_metrics(kind, oid, posted_at, sec):
    """Reels：video_insights（播放、平均觀看秒數）+ 按讚 / 留言數；多圖貼文：分享 / 按讚 / 留言 + 點擊。
    FB 的 Reels 互動不在貼文 insights 裡，所以分享數拿不到時 keep 只算得到 0。"""
    need(sec, "token")
    tok = sec["token"]
    out = {}
    if kind == "reel":
        try:
            out.update(_meta_insights(FB, oid, ["blue_reels_play_count", "post_video_avg_time_watched"], tok, edge="video_insights"))
        except RuntimeError:
            pass
        f = requests.get(f"{FB}/{oid}", params={"fields": "likes.summary(true).limit(0),comments.summary(true).limit(0)",
                                                "access_token": tok}, timeout=TIMEOUT)
    else:
        try:
            out.update(_meta_insights(FB, oid, ["post_clicks", "post_impressions_organic"], tok))
        except RuntimeError:
            pass
        f = requests.get(f"{FB}/{oid}", params={"fields": "shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)",
                                                "access_token": tok}, timeout=TIMEOUT)
    if f.status_code < 400:
        j = f.json()
        out["likes"] = (j.get("likes") or j.get("reactions") or {}).get("summary", {}).get("total_count", 0)
        out["comments"] = (j.get("comments") or {}).get("summary", {}).get("total_count", 0)
        if "shares" in j:
            out["shares"] = j["shares"].get("count", 0)
    m = {"views": out.get("blue_reels_play_count") or out.get("post_impressions_unique") or out.get("post_impressions_organic", 0),
         "likes": out.get("likes", 0), "comments": out.get("comments", 0), "shares": out.get("shares", 0)}
    if "post_video_avg_time_watched" in out:
        m["avg_watch_s"] = out["post_video_avg_time_watched"] / 1000
    if "post_clicks" in out:
        m["clicks"] = out["post_clicks"]
    return m


METRICS = {"instagram": instagram_metrics, "threads": threads_metrics, "tiktok": tiktok_metrics, "youtube": youtube_metrics,
           "facebook": facebook_metrics}
