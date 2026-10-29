#!/usr/bin/env python3
"""本機控制台：在瀏覽器裡管排程（收件匣、排序、改時間、改文案、立刻發、跳過、重試、手動平台標記、帳號狀態）。

usage（在專案根目錄）：python3 skills/promo-queue/scripts/postq.py serve [--port 8790]
資料一樣讀寫雲端 queue（跟 GitHub Actions 同一份），只是多一個網頁介面。收件匣要讀本機的 promo-vids，所以這個要在 Mac 上開。
"""
import contextlib, datetime as dt, io, json, mimetypes, pathlib, threading, traceback, types, urllib.parse, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from zoneinfo import ZoneInfo

import postq as Q
import platforms as P

PAGE = pathlib.Path(__file__).resolve().parent.parent / "assets" / "control.html"
LOCK = threading.Lock()
JOBS = {}            # 立刻發的背景工作：id → 狀態文字
SKIP_DIRS = {"CTA-screens", "references", "sounds"}
VIDS = Q.ROOT / "promo-vids"   # 成品一律在這裡找（測試模式 POSTQ_DIR 只換 queue 的位置）
KIND_ZH = {"reel": "影片", "carousel": "輪播圖"}


# ---------- 讀取 ----------
def media_url(path):
    return "/media?p=" + urllib.parse.quote(str(pathlib.Path(path).resolve()))


def rel_promo(path):   # 舊名字留著：現在直接回絕對路徑，/media 會檢查在不在允許的資料夾裡
    return pathlib.Path(path).resolve()


def item_view(q, it, rs):
    c = Q.chan(q, it["channel"])
    when = Q.parse(it["scheduled_for"]).astimezone(ZoneInfo(c["tz"]))
    folder = Q.ROOT / it["folder"]
    if it.get("thumb"):
        thumb = it["thumb"]
    elif it["kind"] == "carousel":
        thumb = media_url(rel_promo(folder / it["media"][0]))
    else:
        thumb = media_url(rel_promo(Q.PROMO / Q.thumb(it)))
    plats = []
    for n, p in it["platforms"].items():
        lab, _ = Q.snapshot(p)
        pl = Q.plan(it, n)
        plats.append({"name": n, "label": Q.NAMES[n], "status": p["status"], "url": p.get("url", ""),
                      "error": p.get("error", ""), "note": p.get("note", ""), "manual": n in P.MANUAL,
                      "scores": Q.scores(it, n, p), "snapshot": lab, "ratio": rs.get(it["id"], {}).get(n),
                      "as": "影片" if pl and pl[0] == "reel" and it["kind"] == "carousel" else "",
                      "media": [media_url(rel_promo(folder / m)) if (folder / m).exists()
                                else it.get("public_urls", {}).get(f"{it['id']}/{m}", "") for m in (pl[1] if pl else [])],
                      "caption": Q.caption_for(n, it.get("caption", ""))})
    return {"id": it["id"], "channel": it["channel"], "topic": it["topic"], "kind": it["kind"], "kind_zh": KIND_ZH[it["kind"]],
            "count": len(it["media"]), "folder": it["folder"], "tags": it.get("tags", {}), "state": Q.state(it),
            "when": when.strftime("%m/%d (%a) %H:%M"), "when_iso": when.strftime("%Y-%m-%dT%H:%M"), "when_abs": when.isoformat(),
            "caption": it.get("caption", ""), "thumb": thumb, "platforms": plats,
            "rating": Q.rating(Q.item_ratio(rs.get(it["id"], {}))) if Q.state(it) in ("posted", "partial") else "",
            "job": JOBS.get(it["id"], "")}


def topic_folders():
    """promo-vids/<日期>/<主題>/ 和 promo-vids/<日期>-<主題>/（功能介紹片那種）。"""
    for d in sorted(VIDS.iterdir(), reverse=True):
        if not d.is_dir() or d.name.startswith((".", "_")) or d.name in SKIP_DIRS or not d.name[:4].isdigit():
            continue
        if len(d.name) > 11 and d.name[10] == "-":
            yield d
        else:
            yield from (f for f in sorted(d.iterdir()) if f.is_dir() and not f.name.startswith((".", "_")))


def poster(video):
    """影片的封面縮圖（第 1 秒），快取在 .dashboard/。"""
    import hashlib
    out = Q.PROMO / ".dashboard" / "inbox" / (hashlib.md5(f"{video}{video.stat().st_mtime}".encode()).hexdigest()[:12] + ".jpg")
    if not out.exists():
        Q.make_thumb(video, out)
    return media_url(out)


def scan_inbox(q, cid):
    """做好、但還沒排進這個國家的影片 / 輪播圖。"""
    queued = {it["id"] for it in q["items"]}
    ignored = set(q.get("ignored", []))
    out = []
    for folder in topic_folders():
        rel = str(folder.relative_to(Q.ROOT))
        if rel in ignored:
            continue
        day, topic = Q.day_topic(folder)
        final = Q.find_final(folder)
        slides = sorted((folder / "slides").glob("slide_*.png"))
        kinds = []
        if final and f"{cid}-{day}-{topic}-reel" not in queued:
            cap = folder / "caption-reel.txt"
            kinds.append({"kind": "reel", "kind_zh": "影片", "video": True, "preview": media_url(final), "poster": poster(final),
                          "caption": cap.read_text() if cap.exists() else "", "caption_file": "caption-reel.txt"})
        if slides and f"{cid}-{day}-{topic}-carousel" not in queued:
            cap = folder / "caption.txt"
            kinds.append({"kind": "carousel", "kind_zh": f"輪播 {len(slides)} 張", "video": False,
                          "poster": media_url(slides[0]), "slides": [media_url(x) for x in slides],
                          "extras": [n for n, ok in (("3:4", (folder / "slides-3x4").exists()), ("9:16", (folder / "slides-9x16").exists()),
                                                     ("輪播影片", bool(list(folder.glob("*-slideshow.mp4"))))) if ok],
                          "caption": cap.read_text() if cap.exists() else "", "caption_file": "caption.txt"})
        if kinds:
            show = ""
            if (folder / "slides.json").exists():
                show = json.loads((folder / "slides.json").read_text()).get("show", "")
            fmt = "nuance-ladder" if (folder / "ladder.json").exists() else "Ghost 卡" if (folder / "cards.json").exists() else "功能介紹片"
            out.append({"folder": rel, "day": day, "topic": topic, "show": show, "format": fmt, "kinds": kinds,
                        "has_cards": (folder / "cards.json").exists()})
    return out


def free_slots(q, cid, days=42):
    """接下來幾週還沒被佔走的發文時段（當地時間 YYYY-MM-DDTHH:MM），給日曆的空格和「排進這天」用。"""
    tz = ZoneInfo(Q.chan(q, cid)["tz"])
    taken = {Q.parse(it["scheduled_for"]).astimezone(tz).strftime("%Y-%m-%dT%H:%M")
             for it in q["items"] if it["channel"] == cid and Q.state(it) != "skipped"}
    out, t = [], Q.now(q, cid)
    end = t + dt.timedelta(days=days)
    while (t := Q.next_slot(q, t, cid)) < end:
        if (k := t.strftime("%Y-%m-%dT%H:%M")) not in taken:
            out.append(k)
    return out


def state_json(cid):
    q = Q.load()
    cid = cid if cid in q["channels"] else next(iter(q["channels"]))
    rs = Q.ratios(q)
    items = [item_view(q, it, rs) for it in sorted(q["items"], key=lambda x: x["scheduled_for"]) if it["channel"] == cid]
    acct = Q.account(Q.load_secrets(), cid)
    c = Q.chan(q, cid)
    used = list(dict.fromkeys(c["platforms"]["reel"] + c["platforms"]["carousel"]))
    accounts = [{"name": n, "label": Q.NAMES[n], "manual": n in P.MANUAL, "configured": n in acct or n in P.MANUAL,
                 "username": acct.get(n, {}).get("username") or acct.get(n, {}).get("name") or "",
                 "reel": n in c["platforms"]["reel"], "carousel": n in c["platforms"]["carousel"]} for n in Q.NAMES
                if n in used or n in acct]
    return {"channels": {k: v["name"] for k, v in q["channels"].items()}, "channel": cid, "chan": c,
            "cloud": bool(Q.CLOUD), "items": items, "inbox": scan_inbox(q, cid), "accounts": accounts,
            "free": free_slots(q, cid),
            "compare": [{"title": t, "rows": [{"name": g, "ratio": round(r, 2), "n": n} for r, g, n in rows]}
                        for t, rows in Q.compare_groups([it for it in q["items"] if it["channel"] == cid], rs)],
            "all_platforms": [{"name": n, "label": l, "manual": n in P.MANUAL} for n, l in Q.NAMES.items()],
            "now": Q.now(q, cid).strftime("%m/%d %H:%M")}


# ---------- 操作 ----------
def ns(**kw):
    return types.SimpleNamespace(**kw)


def run_cmd(fn, q, a):
    """跑 postq 的指令函式，攔下 print 和 sys.exit，變成回傳訊息。"""
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            fn(q, a)
    except SystemExit as e:
        raise ValueError(str(e) or buf.getvalue().strip())
    return buf.getvalue().strip()


def act(action, b):
    with LOCK:
        q = Q.load()
        if action == "add":
            folder = Q.ROOT / b["folder"]
            for kind, text in b.get("captions", {}).items():
                if text.strip():
                    (folder / ("caption-reel.txt" if kind == "reel" else "caption.txt")).write_text(text.strip() + "\n")
            msgs = []
            for kind in b["kinds"]:
                msgs.append(run_cmd(Q.cmd_add, q, ns(folder=b["folder"], only=kind, at=b.get("at") or None, show=b.get("show") or None,
                                                     hook_reel=b.get("hook_reel") or None,
                                                     hook_carousel=b.get("hook_carousel") or "打破你以為的", channel=b["channel"])))
                q = Q.load()
            return "\n".join(m for m in msgs if m)
        if action == "ignore":
            q.setdefault("ignored", []).append(b["folder"])
            Q.save(q)
            return "已從收件匣移除"
        if action == "unignore":
            q["ignored"] = []
            Q.save(q)
            return "收件匣已還原"
        it = Q.get(q, b["id"]) if "id" in b else None
        if action == "caption":
            it["caption"] = b["text"].strip()
            Q.save(q)
            return "文案已更新"
        if action == "time":
            tz = ZoneInfo(Q.chan(q, it["channel"])["tz"])
            it["scheduled_for"] = dt.datetime.fromisoformat(b["at"]).replace(tzinfo=tz).isoformat()
            Q.save(q)
            return "時間已更新"
        if action == "move":
            mine = sorted((x for x in q["items"] if x["channel"] == it["channel"] and Q.state(x) == "queued"),
                          key=lambda x: x["scheduled_for"])
            k = mine.index(it)
            j = k + b["dir"]
            if 0 <= j < len(mine):
                o = mine[j]
                it["scheduled_for"], o["scheduled_for"] = o["scheduled_for"], it["scheduled_for"]
                Q.save(q)
            return ""
        if action == "skip":
            return run_cmd(Q.cmd_skip, q, ns(id=it["id"]))
        if action == "retry":
            return run_cmd(Q.cmd_retry, q, ns(id=it["id"], platform=b.get("platform")))
        if action == "done":
            return run_cmd(Q.cmd_done, q, ns(id=it["id"], platform=b["platform"], url=b.get("url") or None))
        if action == "delete":
            q["items"] = [x for x in q["items"] if x is not it]
            Q.save(q)
            return "已從排程刪除（回到收件匣）"
        if action == "post-now":
            iid = it["id"]
            JOBS[iid] = "發文中…"
            threading.Thread(target=post_now, args=(iid,), daemon=True).start()
            return "開始發文，完成後會自動更新"
        if action == "slots":
            c = Q.chan(q, b["channel"])
            c["slots"] = sorted(s.strip() for s in b["slots"].split(",") if s.strip())
            Q.save(q)
            return "時段已更新（未發布的不會自動重排，要的話按「重新排時段」）"
        if action == "platforms":
            c = Q.chan(q, b["channel"])
            c["platforms"][b["kind"]] = [n for n in b["list"] if n in Q.NAMES]
            Q.save(q)
            return "已更新（只影響之後排進來的）"
        if action == "reschedule":
            return run_cmd(Q.cmd_reschedule, q, ns())
        if action == "check":
            return check_accounts(b["channel"])
    raise ValueError(f"不認得的操作：{action}")


def post_now(iid):
    try:
        with LOCK:
            q = Q.load()
            it = Q.get(q, iid)
            secrets = Q.load_secrets()
            P.refresh_meta_tokens(Q.account(secrets, it["channel"]))
        Q.post_item(q, it, secrets, False)   # 發文很慢，不鎖住整個控制台
        JOBS[iid] = "完成：" + Q.state(it)
    except Exception as e:
        JOBS[iid] = f"失敗：{e}"
        traceback.print_exc()


def check_accounts(cid):
    """唯讀檢查每個平台的權杖還能不能用。"""
    import requests
    s = Q.load_secrets()
    a = Q.account(s, cid)
    out = []

    def chk(label, fn):
        try:
            out.append(f"✅ {label}：{fn()}")
        except Exception as e:
            out.append(f"❌ {label}：{str(e)[:160]}")
    if "instagram" in a:
        ig = a["instagram"]
        chk("Instagram", lambda: "@" + P._check(requests.get(f"{P.ig_api(ig)}/{ig['user_id']}", params={"fields": "username",
                                                                                                        "access_token": ig["token"]}, timeout=30))["username"])
    if "facebook" in a:
        fb = a["facebook"]
        chk("Facebook", lambda: P._check(requests.get(f"{P.FB}/{fb['page_id']}", params={"fields": "name", "access_token": fb["token"]},
                                                      timeout=30))["name"])
    if "threads" in a:
        th = a["threads"]
        chk("Threads", lambda: "@" + P._check(requests.get("https://graph.threads.net/v1.0/me", params={"fields": "username",
                                                                                                     "access_token": th["token"]}, timeout=30))["username"])
    if "tiktok" in a:
        chk("TikTok", lambda: "@" + P._check(requests.post("https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
                                                           headers=P.tiktok_headers(a["tiktok"]), timeout=30))["data"]["creator_username"])
    if "youtube" in a:
        chk("YouTube", lambda: (P.youtube_token(a["youtube"]), "權杖正常")[1])
    Q.save_secrets(s)   # TikTok refresh token 會換
    return "\n".join(out) or "這個國家還沒有設定任何帳號"


# ---------- HTTP ----------
class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass   # 瀏覽器拖影片進度條時會中斷舊連線，正常現象

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)
        try:
            if u.path == "/":
                return self.send(200, PAGE.read_bytes(), "text/html; charset=utf-8")
            if u.path == "/api/state":
                return self.send(200, state_json(qs.get("channel", [""])[0]))
            if u.path == "/media":
                return self.media(qs.get("p", [""])[0])
            self.send(404, {"error": "not found"})
        except Exception as e:
            traceback.print_exc()
            self.send(500, {"error": str(e)})

    def media(self, p):
        f = pathlib.Path(p).resolve()
        if not any(r.resolve() in f.parents for r in (VIDS, Q.PROMO)) or not f.is_file():
            return self.send(404, {"error": "not found"})
        size = f.stat().st_size
        ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes="):   # 影片要支援 Range 才能拖進度條
            a, _, b = rng[6:].partition("-")
            a = int(a or 0)
            b = min(int(b) if b else size - 1, size - 1, a + 2 * 1024 * 1024 - 1)   # 一次最多 2MB，影片邊播邊載
            with f.open("rb") as fh:
                fh.seek(a)
                data = fh.read(b - a + 1)
            return self.send(206, data, ctype, {"Content-Range": f"bytes {a}-{b}/{size}", "Accept-Ranges": "bytes"})
        self.send(200, f.read_bytes(), ctype, {"Accept-Ranges": "bytes"})

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            msg = act(u.path.removeprefix("/api/"), body)
            self.send(200, {"ok": True, "message": msg})
        except Exception as e:
            traceback.print_exc()
            self.send(400, {"ok": False, "message": str(e)})


def serve(port=8790, open_browser=True):
    for port in range(port, port + 20):   # 被別的程式佔用就往後找
        try:
            srv = ThreadingHTTPServer(("127.0.0.1", port), H)
            break
        except OSError:
            continue
    else:
        raise SystemExit("找不到可用的 port")
    url = f"http://127.0.0.1:{port}/"
    print(f"控制台：{url}（{'雲端' if Q.CLOUD else '本機測試'}資料）。按 Ctrl-C 關閉。", flush=True)
    if open_browser:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
