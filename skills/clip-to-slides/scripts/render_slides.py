#!/usr/bin/env python3
"""把 clip-to-nuance 的片段做成輪播圖（小報海報風）：封面 hook → 每個單字一頁 → CTA。各平台要的尺寸一次輸出：
  slides/        4:5  1080x1350（IG、Threads、Dcard…）
  slides-3x4/    3:4  1080x1440（小紅書圖文）
  slides-9x16/   9:16 1080x1920（TikTok 圖文、LINE VOOM、抖音）
  <topic>-slideshow.mp4  9:16 輪播影片（每張停一下、左滑換頁 + 音效；給只收影片的平台：YouTube Shorts、TikTok、FB Reels）

usage:
  python3 render_slides.py --slides slides.json [--sizes 4x5,3x4,9x16] [--no-video]   # + <topic>-slides-strip.jpg
  python3 render_slides.py --source <topic>.mp4 --contact contact.jpg   # 每 --every 秒抓一格，挑封面畫面用

slides.json（放在工作資料夾，相對路徑以它為準）：
  {"source": "<topic>.mp4", "cards": "cards.json", "show": "MODERN FAMILY",
   "cover": {"time": 8, "focus": "63% 30%", "kicker": "看影集學英文", "hook": "「大驚小怪」|英文不是|[too surprised]", "sub": "..."},
   "words": {"stranger": {"time": 2.6, "focus": "40% 50%"}},          # 選填：覆寫單字頁的畫面秒數 / 裁切位置
   "cta": {"headline": "...", "sub": "..."}}                          # 選填：預設見 CTA_DEFAULT
  文案語法：| 斷行、[文字] 標藍。單字頁畫面預設用 cards.json 的 trigger 秒數。
"""
import argparse, json, pathlib, shutil, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1350
SIZES = {"4x5": (1350, "slides"), "3x4": (1440, "slides-3x4"), "9x16": (1920, "slides-9x16")}
SFX = pathlib.Path(__file__).resolve().parents[2] / "clip-to-nuance/scripts/sfx.py"
HOLD = {"cover": 3.0, "word": 2.8, "cta": 3.2}   # 輪播影片每張停幾秒
XFADE = 0.35
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"
POS_ZH = {"n": "名詞", "noun": "名詞", "v": "動詞", "verb": "動詞", "adj": "形容詞", "adjective": "形容詞",
          "adv": "副詞", "adverb": "副詞", "phrase": "片語", "pron": "代名詞", "prep": "介系詞"}
CTA_DEFAULT = {"headline": "跟「懶得查」|[說 bye bye！]", "sub": ""}   # App 的 slogan，跟商店截圖同一套；headline 可用 {n} = 單字數


def grab(source, t, out):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(source), "-frames:v", "1", "-q:v", "2", str(out)], check=True)


def shoot(work, i, out, h=H):
    # 每次用獨立 profile；Chrome headless 偶爾截完圖不退出，逾時就重試。budget 要夠 Google Fonts 載完
    for attempt in range(3):
        try:
            subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                            "--allow-file-access-from-files", f"--user-data-dir={work / f'profile{i}_{attempt}'}",
                            f"--window-size={W},{h}", "--virtual-time-budget=6000", f"--screenshot={out}",
                            (work / "slides.html").as_uri() + f"?i={i}&h={h}"],
                           check=True, capture_output=True, timeout=40)
            return
        except subprocess.TimeoutExpired:
            if out.exists():
                return
    sys.exit(f"Chrome 截圖失敗：第 {i + 1} 頁")


def slideshow(pngs, out):
    """9:16 圖片 → 影片：每張停 HOLD 秒，左滑換頁，換頁時配 swipe 音效（沒有 clip-to-nuance 的 sfx.py 就靜音）。"""
    holds = [HOLD["cover"]] + [HOLD["word"]] * (len(pngs) - 2) + [HOLD["cta"]]
    args = []
    for p, d in zip(pngs, holds):
        args += ["-loop", "1", "-t", f"{d + XFADE:.2f}", "-framerate", "30", "-i", str(p)]
    chain, last, t = [], "[0:v]", 0.0
    for k in range(1, len(pngs)):
        t += holds[k - 1]
        tag = f"[v{k}]"
        chain.append(f"{last}[{k}:v]xfade=transition=slideleft:duration={XFADE}:offset={t:.2f}{tag}")
        last = tag
    total = sum(holds) + XFADE
    chain.append(f"{last}format=yuv420p,fps=30[v]")
    with tempfile.TemporaryDirectory() as tmp:
        wav = pathlib.Path(tmp) / "sfx.wav"
        cuts = [sum(holds[:k]) for k in range(1, len(pngs))]
        if SFX.exists():
            subprocess.run([sys.executable, str(SFX), str(wav), f"{total:.2f}"] + [f"swipe@{c:.2f}" for c in cuts] + ["shine@" + f"{cuts[-1] + .4:.2f}"],
                           check=True, capture_output=True)
            audio = ["-i", str(wav)]
        else:
            audio = ["-f", "lavfi", "-t", f"{total:.2f}", "-i", "anullsrc=r=48000:cl=stereo"]
        subprocess.run(["ffmpeg", "-v", "error", "-y", *args, *audio, "-filter_complex", ";".join(chain),
                        "-map", "[v]", "-map", f"{len(pngs)}:a", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-shortest", str(out)], check=True)
    print("slideshow", out, f"{total:.1f}s")


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
    ap.add_argument("--sizes", default="4x5,3x4,9x16", help="要輸出哪些尺寸，逗號分隔")
    ap.add_argument("--no-video", action="store_true", help="不做 9:16 輪播影片")
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
    topic = source.stem
    sizes = [x for x in a.sizes.split(",") if x]
    if not a.no_video and "9x16" not in sizes:
        sizes.append("9x16")   # 輪播影片用 9:16 的圖做

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

        rendered = {}
        for size in sizes:
            h, sub = SIZES[size]
            out = pathlib.Path(a.out) if a.out and size == "4x5" else root / sub
            out.mkdir(parents=True, exist_ok=True)
            rendered[size] = []
            for i in range(len(words) + 2):
                p = out / f"slide_{i + 1:02d}.png"
                shoot(work, i, p, h)
                rendered[size].append(p)
            print(f"slides {size} → {out}（{len(rendered[size])} 張）")

    if not a.no_video:
        slideshow(rendered["9x16"], root / f"{topic}-slideshow.mp4")
    paths = rendered.get("4x5") or next(iter(rendered.values()))

    ih = Image.open(paths[0]).height
    ims = [Image.open(p).convert("RGB").resize((W // 3, ih // 3)) for p in paths]
    strip = Image.new("RGB", (len(ims) * W // 3 + (len(ims) - 1) * 12, ih // 3), "white")
    for k, im in enumerate(ims):
        strip.paste(im, (k * (W // 3 + 12), 0))
    sp_out = root / f"{topic}-slides-strip.jpg"
    strip.save(sp_out, quality=88)
    print("strip", sp_out)


if __name__ == "__main__":
    main()
