#!/usr/bin/env python3
"""把 clip-to-nuance 的片段做成 IG 輪播圖（暗色海報風，4:5 1080x1350）：封面 hook → 每個單字一頁 → CTA。

usage:
  python3 render_slides.py --slides slides.json [--out slides/]          # 輸出 slide_01.png… + <topic>-slides-strip.jpg
  python3 render_slides.py --source <topic>.mp4 --contact contact.jpg   # 每 --every 秒抓一格，挑封面畫面用

slides.json（放在工作資料夾，相對路徑以它為準）：
  {"source": "<topic>.mp4", "cards": "cards.json", "show": "MODERN FAMILY",
   "cover": {"time": 8, "focus": "63% 30%", "kicker": "看影集學英文", "hook": "「大驚小怪」|英文不是|[too surprised]", "sub": "..."},
   "words": {"stranger": {"time": 2.6, "focus": "40% 50%"}},          # 選填：覆寫單字頁的畫面秒數 / 裁切位置
   "cta": {"headline": "...", "sub": "...", "name": "..."}}           # 選填：預設見 CTA_DEFAULT
  文案語法：| 斷行、[文字] 標藍。單字頁畫面預設用 cards.json 的 trigger 秒數。
"""
import argparse, json, pathlib, shutil, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1350
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"
POS_ZH = {"n": "名詞", "noun": "名詞", "v": "動詞", "verb": "動詞", "adj": "形容詞", "adjective": "形容詞",
          "adv": "副詞", "adverb": "副詞", "phrase": "片語", "pron": "代名詞", "prep": "介系詞"}
CTA_DEFAULT = {"headline": "看劇聽到不懂的字|一鍵存成[單字卡]", "sub": "跟「懶得查」說 bye bye！", "name": "Nuances: 英文單字卡"}


def grab(source, t, out):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(source), "-frames:v", "1", "-q:v", "2", str(out)], check=True)


def shoot(work, i, out):
    # 每次用獨立 profile；Chrome headless 偶爾截完圖不退出，逾時就重試。budget 要夠 Google Fonts 載完
    for attempt in range(3):
        try:
            subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                            "--allow-file-access-from-files", f"--user-data-dir={work / f'profile{i}_{attempt}'}",
                            f"--window-size={W},{H}", "--virtual-time-budget=6000", f"--screenshot={out}",
                            (work / "slides.html").as_uri() + f"?i={i}"],
                           check=True, capture_output=True, timeout=40)
            return
        except subprocess.TimeoutExpired:
            if out.exists():
                return
    sys.exit(f"Chrome 截圖失敗：第 {i + 1} 頁")


def contact(source, out, every):
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(source)],
                               capture_output=True, text=True, check=True).stdout)
    times = [round(k * every, 2) for k in range(int(dur / every) + 1)]
    tw, th, cols = 480, 270, 5
    sheet = Image.new("RGB", (cols * tw, -(-len(times) // cols) * th), "black")
    f = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", 30)
    with tempfile.TemporaryDirectory() as tmp:
        for k, t in enumerate(times):
            p = pathlib.Path(tmp) / f"{k}.jpg"
            grab(source, t, p)
            im = Image.open(p).convert("RGB").resize((tw, th))
            d = ImageDraw.Draw(im)
            d.rectangle((0, 0, 92, 40), fill="black")
            d.text((8, 4), f"{t:g}s", fill="yellow", font=f)
            sheet.paste(im, ((k % cols) * tw, (k // cols) * th))
    sheet.save(out, quality=85)
    print("contact", out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slides")
    ap.add_argument("--out", default="")
    ap.add_argument("--source", help="只配 --contact 用")
    ap.add_argument("--contact", help="輸出每 --every 秒一格的總覽圖")
    ap.add_argument("--every", type=float, default=1.5)
    a = ap.parse_args()

    if a.contact:
        return contact(pathlib.Path(a.source), a.contact, a.every)
    if not a.slides:
        ap.error("要給 --slides（或 --source + --contact）")

    sp = pathlib.Path(a.slides).resolve()
    root = sp.parent
    cfg = json.loads(sp.read_text())
    source = root / cfg["source"]
    cards = json.loads((root / cfg.get("cards", "cards.json")).read_text())
    if not 3 <= len(cards) <= 5:
        print(f"注意：{len(cards)} 個單字，建議 3–5 個")
    out = pathlib.Path(a.out) if a.out else root / "slides"
    out.mkdir(parents=True, exist_ok=True)
    topic = source.stem

    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp)
        for f in ASSETS.iterdir():
            shutil.copy(f, work / f.name)
        grab(source, cfg["cover"]["time"], work / "cover.jpg")
        over = cfg.get("words", {})
        words = []
        for k, c in enumerate(cards):
            o = over.get(c["word"], {})
            img = f"word{k}.jpg"
            grab(source, o.get("time", c["trigger"]), work / img)
            words.append({**c, "pos": POS_ZH.get(c.get("pos", "").lower().strip(". "), c.get("pos", "")),
                          "image": img, "focus": o.get("focus", "center")})
        data = {"show": cfg.get("show", topic.replace("_", " ").upper()),
                "cover": {**cfg["cover"], "image": "cover.jpg"},
                "words": words, "cta": {**CTA_DEFAULT, **cfg.get("cta", {})}}
        (work / "data.js").write_text("window.DATA = " + json.dumps(data, ensure_ascii=False) + ";")

        paths = []
        for i in range(len(words) + 2):
            p = out / f"slide_{i + 1:02d}.png"
            shoot(work, i, p)
            paths.append(p)
            print("slide", p)

    ims = [Image.open(p).convert("RGB").resize((W // 3, H // 3)) for p in paths]
    strip = Image.new("RGB", (len(ims) * W // 3 + (len(ims) - 1) * 12, H // 3), "white")
    for k, im in enumerate(ims):
        strip.paste(im, (k * (W // 3 + 12), 0))
    sp_out = root / f"{topic}-slides-strip.jpg"
    strip.save(sp_out, quality=88)
    print("strip", sp_out)


if __name__ == "__main__":
    main()
