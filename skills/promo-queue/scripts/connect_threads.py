#!/usr/bin/env python3
"""只授權 Threads（不用重跑整個 setup_wizard.sh）：打開授權頁 → 貼回跳轉網址 → 換長效 token → 寫進本機 secrets.json 並傳到雲端。

用法（專案根目錄）：python3 skills/promo-queue/scripts/connect_threads.py [--channel tw] [--token]
--token：回呼網址存不進去時，改用 App 後台 Threads「設定」頁最下面「用戶權杖產生器」產生的長效權杖，貼上就好。
App 編號 / 密鑰 / 回呼網址讀 ~/.config/nuances-promo/wizard.<國家>.env（精靈存的）。
"""
import argparse, getpass, json, pathlib, re, subprocess, sys, time, urllib.parse as u
import requests

CFG = pathlib.Path.home() / ".config/nuances-promo"
SCOPES = "threads_basic,threads_content_publish,threads_manage_insights"


def read_env(path):
    out = {}
    for line in path.read_text().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip("'\"")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="tw")
    ap.add_argument("--token", action="store_true", help="直接貼「用戶權杖產生器」的權杖，不走 OAuth")
    a = ap.parse_args()
    if a.token:
        tok = getpass.getpass("貼上 Threads 權杖（畫面不會顯示）：").strip()
        save(a.channel, tok, int(time.time()) + 5184000)
        return
    envf = CFG / f"wizard.{a.channel}.env"
    if not envf.exists():
        sys.exit(f"找不到 {envf}，先跑 setup_wizard.sh")
    env = read_env(envf)
    app_id, secret, cb = env.get("TH_APP_ID"), env.get("TH_APP_SECRET"), env.get("CALLBACK")
    if not (app_id and secret and cb):
        sys.exit("wizard env 裡缺 TH_APP_ID / TH_APP_SECRET / CALLBACK，先跑精靈的 Threads 那一步")
    if not re.fullmatch(r"[0-9a-zA-Z]{32}", secret):   # Meta 密鑰是 32 個 0-9a-f；精靈的 Enter 提示可能吃掉輸入、存成別的字
        print("存著的 Threads 應用程式密鑰格式不對（應該是 32 個英數字）。")
        print("到 Meta App 後台「應用程式設定 → 基本資料」最下面「Threads 應用程式密鑰」按「顯示」，複製過來。")
        secret = getpass.getpass("貼上 Threads 應用程式密鑰（畫面不會顯示）：").strip()
        if not re.fullmatch(r"[0-9a-zA-Z]{32}", secret):
            odd = "有符號或空白" if re.search(r"[^0-9a-zA-Z]", secret) else "只有英數字"
            sys.exit(f"貼進來的是 {len(secret)} 個字、{odd}；Meta 的密鑰是 32 個英數字。"
                     "0 個字 = 沒貼到（先在別處貼上看看有沒有複製到）；按「顯示」後若要求輸入 Facebook 密碼，輸入完要再複製一次欄位裡的密鑰")
        lines = [l for l in envf.read_text().splitlines() if not l.startswith("TH_APP_SECRET=")]
        envf.write_text("\n".join(lines + [f"TH_APP_SECRET={secret}"]) + "\n"); envf.chmod(0o600)
        print("✓ 密鑰已更新")

    print("先確認 Meta App 後台 →「使用案例」→ Threads →「設定」這三格都貼了同一個網址，再按「儲存」：")
    print("  回呼網址 (Redirect Callback URLs)、解除安裝回呼網址 (Uninstall)、刪除回呼網址 (Delete)")
    print(f"\n  {cb}\n")
    print("（三格有一格空著就存不起來，授權時就會說回呼網址不對。）")
    input("都存好了按 Enter，會打開授權頁… ")
    url = "https://threads.net/oauth/authorize?" + u.urlencode(
        {"client_id": app_id, "redirect_uri": cb, "scope": SCOPES, "response_type": "code"})
    subprocess.run(["open", url])
    pasted = input("按允許後，把跳轉後網址列的整段網址貼在這裡：").strip()
    code = u.parse_qs(u.urlparse(pasted).query).get("code", [pasted])[0].split("#")[0]

    r = requests.post("https://graph.threads.net/oauth/access_token", timeout=30, data={
        "client_id": app_id, "client_secret": secret, "grant_type": "authorization_code", "redirect_uri": cb, "code": code})
    if r.status_code >= 400:
        sys.exit(f"換 token 失敗：{r.text}")
    r = requests.get("https://graph.threads.net/access_token", timeout=30, params={
        "grant_type": "th_exchange_token", "client_secret": secret, "access_token": r.json()["access_token"]})
    if r.status_code >= 400:
        sys.exit(f"換長效 token 失敗：{r.text}")
    j = r.json()
    save(a.channel, j["access_token"], int(time.time()) + int(j.get("expires_in", 5184000)))


def save(channel, token, expires):
    me = requests.get("https://graph.threads.net/v1.0/me", timeout=30,
                      params={"fields": "id,username", "access_token": token}).json()
    if "id" not in me:
        sys.exit(f"讀不到 Threads 帳號：{me}")
    sec = {"user_id": me["id"], "username": me.get("username", ""), "token": token, "token_expires": expires}

    p = CFG / "secrets.json"
    d = json.loads(p.read_text()) if p.exists() else {}
    d["threads"] = sec
    p.write_text(json.dumps(d, indent=1)); p.chmod(0o600)
    print(f"✓ 已連上 @{sec['username']}，上傳到雲端…")
    q = pathlib.Path(__file__).with_name("postq.py")
    subprocess.run([sys.executable, str(q), "push-secrets", "--only", "threads", "--channel", channel], check=True)


if __name__ == "__main__":
    main()
