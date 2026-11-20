#!/usr/bin/env python3
"""換 Supabase secret key：確認新 key 能用，再更新本機金鑰和 GitHub secret。key 不會印出來，舊 key 不會被這支刪除。
跑法：python3 rotate_supabase_key.py"""
import getpass
import json
import subprocess

import requests

import platforms as P
import postq as Q

REPO = "nuancesappofficial/nuances-app"


def main():
    new = getpass.getpass("貼上新的 Supabase secret key（畫面不會顯示字），按 Enter：").strip()
    loc = json.loads(Q.SECRETS.read_text())
    sb = loc["supabase"]
    if new == sb.get("service_key"):
        raise SystemExit("這和目前的 key 一樣，請貼新建立的那組。")
    r = requests.get(f"{sb['url'].rstrip('/')}/storage/v1/bucket", timeout=30,
                     headers=P.sb_headers(new))
    if r.status_code != 200:
        raise SystemExit(f"新 key 沒通過測試（{r.status_code}），什麼都沒改。")
    subprocess.run(["gh", "secret", "set", "SUPABASE_SERVICE_KEY", "-R", REPO], input=new.encode(), check=True,
                   stdout=subprocess.DEVNULL)
    sb["service_key"] = new
    Q.SECRETS.write_text(json.dumps(loc, indent=1))
    Q.SECRETS.chmod(0o600)
    print("完成：新 key 可用，本機和 GitHub 都更新了。舊 key 先不要刪，等 Claude 確認排程正常。")


if __name__ == "__main__":
    main()
