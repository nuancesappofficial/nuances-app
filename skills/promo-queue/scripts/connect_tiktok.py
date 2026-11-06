#!/usr/bin/env python3
"""重新授權 TikTok，多拿 video.upload（把影片送進 TikTok App 收件匣）。沿用雲端已存的 Client key / secret。
跑法：python3 connect_tiktok.py [國家代號，預設 tw]"""
import getpass
import subprocess
import sys
import urllib.parse as u

import requests

import postq as Q

SCOPES = "user.info.basic,video.publish,video.list,video.upload"


def main():
    channel = sys.argv[1] if len(sys.argv) > 1 else "tw"
    secrets = Q.load_secrets()
    sec = secrets["channels"][channel]["tiktok"]
    sb = secrets["supabase"]
    callback = f"{sb['url'].rstrip('/')}/storage/v1/object/public/{sb['bucket']}/oauth/callback.txt"
    url = "https://www.tiktok.com/v2/auth/authorize/?" + u.urlencode({
        "client_key": sec["client_key"], "scope": SCOPES, "response_type": "code",
        "state": "nuances", "redirect_uri": callback})
    subprocess.run(["open", url], check=False)
    print("瀏覽器會打開 TikTok 授權頁。用 Nuances 的 TikTok 帳號按授權。")
    print("跳轉之後，把網址列整段複製回來（畫面不會顯示字）。")
    pasted = getpass.getpass("貼上跳轉後的整段網址：").strip()
    code = u.parse_qs(u.urlparse(pasted).query).get("code", [pasted])[0]
    r = requests.post("https://open.tiktokapis.com/v2/oauth/token/", timeout=30, data={
        "client_key": sec["client_key"], "client_secret": sec["client_secret"], "code": code,
        "grant_type": "authorization_code", "redirect_uri": callback})
    j = r.json()
    if r.status_code >= 400 or "refresh_token" not in j:
        raise SystemExit(f"換 token 失敗：{j.get('error')} {j.get('error_description')}")
    if "video.upload" not in j.get("scope", ""):
        raise SystemExit(f"這次授權沒有 video.upload，只拿到：{j.get('scope')}。先確認開發者後台有加這個權限。")
    sec["refresh_token"] = j["refresh_token"]
    Q.save_secrets(secrets)
    print("完成，已存到雲端。權限：" + j["scope"])


if __name__ == "__main__":
    main()
