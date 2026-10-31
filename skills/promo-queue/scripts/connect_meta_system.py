#!/usr/bin/env python3
"""IG + Facebook 粉專改用「系統用戶」的權杖（不綁任何人的 FB 帳號、不會過期）。

個人帳號被 Meta 限制用 API 時（錯誤：Cannot call API for app … on behalf of user …）用這個。
系統用戶在 Meta 商業設定 → 用戶 → 系統用戶建立，產生權杖時勾發文權限（見 SKILL.md）。

用法（專案根目錄）：python3 skills/promo-queue/scripts/connect_meta_system.py [--channel tw]
貼上系統用戶權杖 → 換成粉專權杖 → 確認是系統用戶、IG 有連到粉專 → 寫進本機 secrets.json 並傳到雲端。
Threads 不支援系統用戶，不受影響。
"""
import argparse, getpass, json, pathlib, subprocess, sys
import requests

CFG = pathlib.Path.home() / ".config/nuances-promo"
FB = "https://graph.facebook.com/v23.0"
NEED = {"pages_manage_posts", "pages_read_engagement", "instagram_basic", "instagram_content_publish"}


def get(path, tok, **params):
    r = requests.get(f"{FB}/{path}", params={**params, "access_token": tok}, timeout=30)
    j = r.json()
    if r.status_code >= 400:
        sys.exit(f"Meta 回錯：{j.get('error', {}).get('message', j)}")
    return j


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="tw")
    a = ap.parse_args()
    p = CFG / "secrets.json"
    d = json.loads(p.read_text()) if p.exists() else {}
    page_id = d.get("facebook", {}).get("page_id")
    if not page_id:
        sys.exit("本機 secrets.json 沒有 facebook.page_id，先跑 setup_wizard.sh 的 Meta 那一步")

    tok = getpass.getpass("貼上系統用戶權杖（畫面不會顯示）：").strip()
    info = get("debug_token", tok, input_token=tok)["data"]
    if info.get("type") != "SYSTEM_USER":
        sys.exit(f"這把是 {info.get('type')} 權杖，不是系統用戶的。到商業設定 → 系統用戶 → 產生權杖。")
    miss = NEED - set(info.get("scopes", []))
    if miss:
        sys.exit(f"權杖少了權限：{', '.join(sorted(miss))}。重新產生權杖時把這些勾起來。")

    page = get(page_id, tok, fields="name,access_token,instagram_business_account{id,username}")
    if "access_token" not in page:
        sys.exit("系統用戶拿不到粉專權杖：商業設定 → 系統用戶 → 指派資產，把粉專給它「完整控制」。")
    ig = page.get("instagram_business_account")
    if not ig:
        sys.exit("粉專沒有連 IG 帳號（或系統用戶沒被指派 IG）：商業設定 → 系統用戶 → 指派資產，把 IG 帳號也給它。")
    if ig["id"] != d.get("instagram", {}).get("user_id"):
        print(f"注意：IG 帳號換成 @{ig.get('username')}（{ig['id']}）")

    d["facebook"] = {**d.get("facebook", {}), "page_id": page_id, "name": page["name"], "token": page["access_token"]}
    d["instagram"] = {**d.get("instagram", {}), "user_id": ig["id"], "username": ig.get("username", ""),
                      "token": page["access_token"], "via": "facebook"}
    d["instagram"].pop("token_expires", None)   # 粉專權杖不會過期，不用換新
    p.write_text(json.dumps(d, indent=1)); p.chmod(0o600)
    print(f"✓ 粉專「{page['name']}」+ IG @{ig.get('username')} 改用系統用戶，上傳到雲端…")
    q = pathlib.Path(__file__).with_name("postq.py")
    subprocess.run([sys.executable, str(q), "push-secrets", "--only", "facebook,instagram", "--channel", a.channel], check=True)


if __name__ == "__main__":
    main()
