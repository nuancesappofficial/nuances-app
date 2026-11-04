"""控制台「總覽 → 發布與公告」：把 auto-update / announce-and-update 兩個 skill 的指令變成按鈕。

- 進度條：版號一致 → 打包上傳（EAS）→ 商店上架 → 更新提示（Supabase app_version_policy）
- 按鈕在背景跑真正的指令（eas build / npm run sync / node scripts/send-message.js），輸出存在 JOBS，網頁輪詢看進度
指令跟 skill 裡寫的一模一樣，只是多了 --non-interactive / --no-wait 讓它能在背景跑。
"""
import itertools, json, pathlib, subprocess, threading, time, urllib.request

import analytics as A

ROOT = A.ROOT
BUNDLE_ID = "com.jeffenglishlearning.nuances"
APPLE_AUTH_KEY = "e0b80c3bf78523bfe80974d320935bfa30add02e1bff88ec2166c6bd5a706c42"   # auto-update skill：解 iTunes service key is empty
JOBS, SEQ, LOCK = {}, itertools.count(1), threading.Lock()
LINKS = {"asc": "https://appstoreconnect.apple.com/apps", "play": "https://play.google.com/console",
         "eas": "https://expo.dev/accounts/jeffenglishlearning/projects/nuances-app/builds"}


def local_version():
    e = json.loads((ROOT / "app.json").read_text())["expo"]
    return {"version": e["version"], "ios_build": e.get("ios", {}).get("buildNumber"), "android_code": e.get("android", {}).get("versionCode")}


def _run(cmd, timeout=120, env=None):
    import os
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout, env={**os.environ, **(env or {})})
    return r.returncode, r.stdout, r.stderr


def consistency():
    code, out, err = _run(["node", "--test", "scripts/appVersionConsistency.test.mjs"])
    fail = [l.strip() for l in (out + err).splitlines() if l.strip().startswith("not ok")]
    return {"ok": code == 0, "detail": "；".join(fail)[:300]}


def builds():
    code, out, err = _run(["eas", "build:list", "--limit", "8", "--json", "--non-interactive"], timeout=60)
    if code:
        raise RuntimeError("讀不到 EAS 打包紀錄：" + (err.strip().splitlines() or ["?"])[-1])
    keep = []
    for b in json.loads(out):
        keep.append({"platform": b["platform"].lower(), "status": b["status"], "version": b.get("appVersion"),
                     "build": b.get("appBuildVersion"), "at": b.get("createdAt"),
                     "url": f"https://expo.dev/accounts/{b['project']['ownerAccount']['name']}/projects/{b['project']['slug']}/builds/{b['id']}"})
    return keep


def store():
    try:
        with urllib.request.urlopen(f"https://itunes.apple.com/lookup?bundleId={BUNDLE_ID}&country=tw&t={int(time.time())}", timeout=15) as r:
            res = json.loads(r.read()).get("results") or [{}]
        return {"ios": res[0].get("version"), "android": None}
    except Exception:
        return {"ios": None, "android": None}


def policy():
    return {r["platform"]: r for r in A.sql("select platform, latest_version, minimum_supported_version, latest_build_number, required, "
                                            "to_char(updated_at at time zone 'Asia/Taipei', 'MM-DD HH24:MI') updated from app_version_policy")}


def messages():
    return A.sql("""select title, body, type, priority, target_type, coalesce(target_email, '') target_email,
                    to_char(created_at at time zone 'Asia/Taipei', 'YYYY-MM-DD HH24:MI') at from app_messages order by created_at desc limit 8""")


def state(fresh=False):
    c = lambda k, fn, ttl=60: A.cached("rel:" + k, fn, ttl=ttl, fresh=fresh)
    out = {"local": local_version(), "links": LINKS}
    from concurrent.futures import ThreadPoolExecutor   # 五個來源一起抓（EAS 一次就要 6 秒）

    def get(item):
        k, fn, ttl = item
        try:
            return k, c(k, fn, ttl)
        except Exception as e:
            return k, {"error": str(e)}
    items = (("check", consistency, 300), ("builds", builds, 30), ("store", store, 300), ("policy", policy, 60), ("messages", messages, 30))
    with ThreadPoolExecutor(5) as ex:
        out.update(dict(ex.map(get, items)))
    with LOCK:
        out["jobs"] = [{"id": i, **{k: v for k, v in j.items() if k != "proc"}, "log": j["log"][-40:]} for i, j in sorted(JOBS.items(), reverse=True)[:6]]
    return out


# ---------- 按鈕 ----------
def command(b):
    a = b.get("action")
    if a == "check":
        return "檢查版號一致", ["node", "--test", "scripts/appVersionConsistency.test.mjs"], None, "check"
    if a == "build":
        p = b.get("platform", "all")
        if p not in ("ios", "android", "all"):
            raise ValueError("平台不對")
        return (f"打包並上傳（{ {'ios': 'iOS', 'android': 'Android', 'all': '雙平台'}[p] }）",
                ["eas", "build", "--platform", p, "--profile", "production", "--auto-submit", "--non-interactive", "--no-wait"],
                {"EXPO_APP_STORE_AUTH_SERVICE_KEY": APPLE_AUTH_KEY}, "builds")
    if a == "policy":
        cmd = ["node", "scripts/sync-app-version-policy.js", "--platform", "all"] + (["--dry-run"] if b.get("dry") else [])
        return ("預覽更新提示" if b.get("dry") else "發布更新提示"), cmd, None, "policy"
    if a == "announce":
        title, body = (b.get("title") or "").strip(), (b.get("body") or "").strip()
        if not title or not body:
            raise ValueError("標題和內容都要填")
        cmd = ["node", "scripts/send-message.js", "--type", b.get("type") or "both", "--title", title, "--body", body,
               "--priority", b.get("priority") or "normal"]
        cmd += ["--email", b["email"].strip()] if (b.get("email") or "").strip() else ["--all"]
        if (b.get("url") or "").strip():
            cmd += ["--url", b["url"].strip(), "--button", (b.get("button") or "").strip() or "立即查看"]
        if b.get("dry"):
            cmd.append("--dry-run")
        return ("預覽公告" if b.get("dry") else "發送公告"), cmd, None, "messages"
    raise ValueError("不認得的動作")


def start(b):
    import os
    label, cmd, env, refresh = command(b)
    jid = next(SEQ)
    job = {"label": label, "status": "running", "log": [], "started": time.strftime("%H:%M:%S"), "action": b.get("action"), "dry": bool(b.get("dry"))}
    with LOCK:
        JOBS[jid] = job

    def run():
        try:
            p = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env={**os.environ, **(env or {})})
            for line in p.stdout:
                line = line.rstrip()
                if line:
                    with LOCK:
                        job["log"].append(line[:400])
            job["status"] = "done" if p.wait() == 0 else "error"
        except Exception as e:
            job["log"].append(str(e))
            job["status"] = "error"
        with LOCK:
            A.CACHE.pop("rel:" + refresh, None)   # 做完馬上讓進度條重讀

    threading.Thread(target=run, daemon=True).start()
    return jid
