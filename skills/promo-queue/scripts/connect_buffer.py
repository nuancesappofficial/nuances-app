#!/usr/bin/env python3
"""把 Buffer API key 存到雲端，並找出 Facebook / TikTok 頻道。key 只在畫面隱藏輸入，不會印出來。
跑法：python3 connect_buffer.py [國家代號，預設 tw]"""
import getpass
import json
import sys

import requests

import postq as Q

API = "https://api.buffer.com"


def gql(key, query, variables=None):
    r = requests.post(API, timeout=30, headers={"Authorization": f"Bearer {key}"},
                      json={"query": query, "variables": variables or {}})
    if r.status_code in (401, 403):
        raise SystemExit("Buffer 不接受這組 key，確認有完整複製後再跑一次。")
    r.raise_for_status()
    j = r.json()
    if j.get("errors"):
        raise SystemExit("Buffer 回報錯誤：" + j["errors"][0].get("message", "")[:200])
    return j["data"]


def main():
    channel = sys.argv[1] if len(sys.argv) > 1 else "tw"
    key = getpass.getpass("貼上 Buffer API key（畫面不會顯示字），按 Enter：").strip()
    orgs = gql(key, "query { account { organizations { id } } }")["account"]["organizations"]
    if not orgs:
        raise SystemExit("這個 Buffer 帳號沒有組織。")
    org = orgs[0]["id"]
    chs = gql(key, "query { channels(input: {organizationId: %s}) { id name service } }" % json.dumps(org))["channels"]
    print("找到的頻道：")
    for c in chs:
        print(f"  {c['service']}: {c['name']}")
    found = {c["service"]: c["id"] for c in chs}
    secrets = Q.load_secrets()
    secrets["channels"][channel]["buffer"] = {"api_key": key, "organization_id": org, "channels": found,
                                              "key_expires": "2027-11"}
    Q.save_secrets(secrets)
    print("完成，已存到雲端。")
    for need in ("facebook", "tiktok"):
        if need not in found:
            print(f"注意：沒有找到 {need} 頻道，回 Buffer 確認有連上。")


if __name__ == "__main__":
    main()
