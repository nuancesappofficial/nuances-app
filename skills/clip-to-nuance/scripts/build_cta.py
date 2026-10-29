#!/usr/bin/env python3
"""產生固定 CTA 結尾：promo 1 的 CTA 底片（App icon + 掃光，標語 / App 名稱 / 徽章都已擦掉）+ 標語 + 放大的 App 名稱 + 商店徽章。

usage: python3 build_cta.py <cta1 frames 資料夾> <out.mp4> ["跟「懶得查」|說bye bye!"] [--name "Nuances: 英文單字卡"] [--still out.png]
底片 = promo-vids/2026-10-12-feature-promo/project/assets/cta1/（150.jpg…350.jpg），跟 promo 1 一樣從第 193 幀用到 350 幀
（icon 掃光高峰在第 259 幀 = CTA 開始後 2.2 秒；compose_final.sh 的 shine 音效對齊這裡）。
標語用 | 斷行。只在換文字時重跑；平常 compose_final.sh 直接用產出的 CTA-nuances.mp4。
"""
import argparse, pathlib, subprocess
from PIL import Image, ImageDraw
from render_ghost_push import font  # 同一套 PingFang TC

W, H = 1080, 1920
FIRST, LAST = 193, 350
HEAD_SIZE, HEAD_LH, HEAD_TOP = 84, 112, 520      # 標語：icon 上方
NAME_SIZE, NAME_CY = 64, 1335                    # App 名稱：icon 下方（promo 1 是 44px）
NAME_COLOR = (231, 234, 240, 255)
BADGE_TOP, BADGE_GAP = 1450, 28
ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"

ap = argparse.ArgumentParser()
ap.add_argument("frames"); ap.add_argument("out")
ap.add_argument("headline", nargs="?", default="跟「懶得查」|說bye bye!")
ap.add_argument("--name", default="Nuances: 英文單字卡")
ap.add_argument("--still", default="")
a = ap.parse_args()

ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
f = font(HEAD_SIZE, "semibold")
for i, line in enumerate(a.headline.split("|")):
    bb = d.textbbox((0, 0), line, font=f)
    d.text(((W - (bb[2] - bb[0])) / 2 - bb[0], HEAD_TOP + i * HEAD_LH - bb[1]), line, font=f, fill=(255, 255, 255, 255))
fn = font(NAME_SIZE, "semibold")
bb = d.textbbox((0, 0), a.name, font=fn)
d.text(((W - (bb[2] - bb[0])) / 2 - bb[0], NAME_CY - (bb[3] - bb[1]) / 2 - bb[1]), a.name, font=fn, fill=NAME_COLOR)
badges = [Image.open(ASSETS / n).convert("RGBA") for n in ("badge_appstore_zh-TW.png", "badge_play_zh-TW.png")]
x = (W - sum(b.width for b in badges) - BADGE_GAP * (len(badges) - 1)) // 2
for b in badges:
    ov.alpha_composite(b, (x, BADGE_TOP))
    x += b.width + BADGE_GAP
ov_path = pathlib.Path(a.out).with_suffix(".overlay.png")
ov.save(ov_path)

frames = pathlib.Path(a.frames)
if a.still:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(frames / "259.jpg"), "-i", str(ov_path), "-filter_complex",
                    "[0:v][1:v]overlay=0:0", "-frames:v", "1", a.still], check=True)
else:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "30", "-start_number", str(FIRST), "-i", str(frames / "%d.jpg"),
                    "-i", str(ov_path), "-filter_complex", "[0:v]setsar=1[b];[b][1:v]overlay=0:0,format=yuv420p",
                    "-frames:v", str(LAST - FIRST + 1), "-an", "-c:v", "libx264", "-crf", "16", a.out], check=True)
ov_path.unlink()
print("done", a.still or a.out)
