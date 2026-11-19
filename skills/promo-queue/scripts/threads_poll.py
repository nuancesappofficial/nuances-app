#!/usr/bin/env python3
"""發 Threads 票選貼文，並在第一則留言引用某篇已發的貼文。
用法：python3 threads_poll.py --quote <排程 id> --text "題目" -o 選項A -o 選項B … [--channel tw] [--dry-run]
"""
import argparse, sys, requests
import postq as PQ
import platforms as P

ap = argparse.ArgumentParser()
ap.add_argument("--quote", required=True, help="要引用的排程 id（例如 promo-008-reel）")
ap.add_argument("--text", required=True)
ap.add_argument("-o", "--option", action="append", required=True)
ap.add_argument("--reply", default="", help="留言文字（引用貼文附上）")
ap.add_argument("--reply-spoiler", type=int, default=0, help="留言開頭幾個字設成劇透（只能是 ASCII，字元單位不確定時最安全）")
ap.add_argument("--channel", default="tw")
ap.add_argument("--dry-run", action="store_true")
a = ap.parse_args()

if not 2 <= len(a.option) <= 4 or any(not 1 <= len(o) <= 25 for o in a.option):
    sys.exit("選項要 2–4 個，每個 1–25 字")
q = PQ.load()
src = [i for i in q["items"] if i["channel"] == a.channel and i["id"].endswith(a.quote)]
if len(src) != 1:
    sys.exit(f"找不到唯一一篇 {a.quote}")
th = src[0]["platforms"].get("threads", {})
if th.get("status") != "posted" or not th.get("id"):
    sys.exit("那篇的 Threads 還沒發出去")
poll = {f"option_{c}": o for c, o in zip("abcd", a.option)}
print(f"票選貼文：{a.text}\n選項：{a.option}\n留言引用：{src[0]['id']} → {th.get('url')}\n留言文字：{a.reply or '（無）'}\n劇透範圍：{a.reply[:a.reply_spoiler]!r}")
if a.dry_run:
    sys.exit(0)

sec = PQ.account(PQ.load_secrets(), a.channel)["threads"]
api, uid, tok = "https://graph.threads.net/v1.0", sec["user_id"], {"access_token": sec["token"]}
import json, time
def publish(data):
    cid = P._check(requests.post(f"{api}/{uid}/threads", data={**tok, **data}, timeout=P.TIMEOUT))["id"]
    P._wait(lambda: P._check(requests.get(f"{api}/{cid}", params={**tok, "fields": "status"}, timeout=P.TIMEOUT)).get("status"), ("FINISHED",), "Threads 容器")
    mid = P._check(requests.post(f"{api}/{uid}/threads_publish", data={**tok, "creation_id": cid}, timeout=P.TIMEOUT))["id"]
    return mid, P._check(requests.get(f"{api}/{mid}", params={**tok, "fields": "permalink"}, timeout=P.TIMEOUT)).get("permalink", "")
mid, url = publish({"media_type": "TEXT", "text": a.text, "poll_attachment": json.dumps(poll)})
print("票選已發：", url)
extra = {"text_entities": json.dumps([{"entity_type": "SPOILER", "offset": 0, "length": a.reply_spoiler}])} if a.reply_spoiler else {}
rid, rurl = publish({"media_type": "TEXT", "text": a.reply, "reply_to_id": mid, "quote_post_id": th["id"], **extra})
print("留言已發：", rurl)
