#!/usr/bin/env python3
"""Part 1 渲染：第一屏中文句子 → App 卡片詳情（有圖版）一張一張疊上來，像在發牌（課本 → 在地）。

usage:
  python3 render_ladder.py --ladder ladder.json --out <topic>-ladder.mp4 [--stills 1,2,5,14]
      [--intro 1.6] [--step 2.6] [--tail 2.8] [--sfx sprays.m4a]
  python3 render_ladder.py --sfx sprays.m4a --detect     # 只印出音效檔裡每一聲的起點秒數

--ladder {"zh": "我累爆了", "levels": [{
            "tag": "課本", "en": "I am very tired.", "meaning": "最標準，但聽起來很生硬",
            "sentence": "I am very tired after work.", "sentenceZh": "我下班後非常累。",
            "formal": 8, "intensity": 3, "hook": "...", "image"?: "lv1.png", "imageY"?: 30,
            "note"?: "英式", "match"?: "...", "ipa"?: "...", "at"?: 2.1}, ...]}
  formal / intensity = 卡片上「隨意 ↔ 正式」「微弱 ↔ 強烈」兩條拉桿（1–10）。
  image = 頭像圖（相對 ladder.json 的路徑）；省略時用內建的佔位頭像（越後面越累）。
  at = 這張卡開始飛進來的秒數；省略時 intro + i × step。
--sfx  一串短音效的音檔（例如 Jet Set Radio 噴漆聲合集）：自動切成一聲一聲，第 k 張卡落下時放第 k 聲。

畫面：assets/ladder.html（數值照 App 原始碼）用 Chrome headless 截圖，
卡片截成透明 PNG、PIL 補上 App 的陰影，再疊牌、ffmpeg 壓片（1080x1920、30fps）。
"""
import argparse, json, math, pathlib, shutil, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageChops, ImageFilter

W, H, FPS, SR = 1080, 1920, 30, 48000
SCALE = 2.3                      # CSS px → 影片 px
SCREEN = (500, 889)              # intro / header 頁（Chrome 視窗最窄 500）
SCREEN_SCALE = W / SCREEN[0]     # 2.16 → 1080x1920
CARD = (360, 660)                # 卡片 CSS 尺寸（App 卡寬 360）
CARD_Y = 330                     # 最上面那張卡的頂端
DEPTH_DY = 30                    # 後面每一層往上露出多少 px
DEPTH_SCALE = 0.05               # 後面每一層縮多少
DEPTH_DIM = 0.07                 # 後面每一層變暗多少
MAX_DEPTH = 3
FLY = 0.5                        # 卡片飛進來的秒數
FADE = 0.35                      # 中文頁 → 標題列
BG = (241, 235, 227)             # #F1EBE3
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"


def ease(x):
    x = max(0.0, min(1.0, x))
    return 4 * x ** 3 if x < 0.5 else 1 - (2 - 2 * x) ** 3 / 2

def ease_out(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3

def ease_out_back(x, c=1.3):
    x = max(0.0, min(1.0, x))
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


# ---------- 音效 ----------
def load_audio(path, sr=SR, ch=2):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", str(ch), "-ar", str(sr),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, ch)

def detect_onsets(x, sr, n=40):
    """頻譜通量取峰值：回傳每一聲的起點秒數（排序後）。"""
    hop, win = 512, 2048
    frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop] * np.hanning(win)
    mag = np.abs(np.fft.rfft(frames, axis=1))
    flux = np.maximum(np.diff(np.log1p(mag), axis=0), 0).sum(axis=1)
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    min_gap = int(0.25 * sr / hop)
    peaks = []
    for i in np.argsort(flux)[::-1]:
        if flux[i] < 1.0 or len(peaks) >= n:
            break
        if all(abs(i - p) >= min_gap for p in peaks):
            peaks.append(i)
    return sorted(round(float((p + 1) * hop / sr), 2) for p in peaks)

def sfx_hits(path):
    """把音效檔切成一聲一聲（每聲最長 0.9 秒、尾巴淡出）。"""
    st = load_audio(path)
    onsets = detect_onsets(st.mean(axis=1), SR)
    hits = []
    for k, s in enumerate(onsets):
        a = max(0, int((s - 0.03) * SR))
        b = int((onsets[k + 1] - 0.03) * SR) if k + 1 < len(onsets) else len(st)
        seg = st[a:min(b, a + int(0.9 * SR))].copy()
        fade = min(len(seg), int(0.06 * SR))
        seg[-fade:] *= np.linspace(1, 0, fade)[:, None]
        hits.append(seg)
    return hits, onsets


# ---------- 截圖 ----------
def shoot(work, query, size, out, transparent=False, scale=SCALE):
    # 每次用獨立 profile；Chrome headless 偶爾截完圖不退出，逾時就重試
    for attempt in range(3):
        try:
            subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                            "--allow-file-access-from-files", f"--user-data-dir={work / f'profile{attempt}'}",
                            f"--force-device-scale-factor={scale}", f"--window-size={size[0]},{size[1]}",
                            "--virtual-time-budget=1500", f"--screenshot={out}"] +
                           (["--default-background-color=00000000"] if transparent else []) +
                           [(work / "ladder.html").as_uri() + "?" + query],
                           check=True, capture_output=True, timeout=30)
            break
        except subprocess.TimeoutExpired:
            if out.exists():
                break
    else:
        sys.exit(f"Chrome 截圖失敗：{query}")
    return Image.open(out).convert("RGBA" if transparent else "RGB")

def with_shadow(card):
    """App detailPaper 的陰影：offset (0, 24)、radius 30、opacity 0.12；再加一層貼身的淡陰影讓牌有厚度。"""
    m = int(70 * SCALE)
    out = Image.new("RGBA", (card.width + 2 * m, card.height + 2 * m), (0, 0, 0, 0))
    a = card.getchannel("A")
    for dy, blur, op in ((24, 30, 0.12), (2, 4, 0.08)):
        sh = Image.new("L", out.size, 0)
        sh.paste(a.point(lambda v, op=op: int(v * op)), (m, m + int(dy * SCALE)))
        sh = sh.filter(ImageFilter.GaussianBlur(blur * SCALE / 2))
        layer = Image.new("RGBA", out.size, (0, 0, 0, 0))
        layer.putalpha(sh)
        out.alpha_composite(layer)
    out.alpha_composite(card, (m, m))
    return out, m

def render_screens(data, base):
    work = pathlib.Path(tempfile.mkdtemp())
    shutil.copy(ASSETS / "ladder.html", work)
    shutil.copy(ASSETS / "Ionicons.ttf", work)
    levels = []
    for lv in data["levels"]:
        lv = dict(lv)
        if lv.get("image"):
            lv["image"] = (base / lv["image"]).resolve().as_uri()
        levels.append(lv)
    (work / "data.js").write_text("window.LADDER=" + json.dumps({**data, "levels": levels}, ensure_ascii=False))
    n = len(levels)
    crop = lambda im: im.crop((0, 0, W, H))
    intro = crop(shoot(work, "mode=intro", SCREEN, work / "intro.png", scale=SCREEN_SCALE))
    headers = [crop(shoot(work, f"mode=header&i={i}", SCREEN, work / f"h{i}.png", scale=SCREEN_SCALE)).crop((0, 0, W, CARD_Y - 40))
               for i in range(n)]
    cards = []
    for i in range(n):
        c = shoot(work, f"mode=card&i={i}", CARD, work / f"c{i}.png", transparent=True)
        cards.append(with_shadow(c.crop((0, 0, round(CARD[0] * SCALE), round(CARD[1] * SCALE)))))
    shutil.rmtree(work)
    return intro, headers, cards


class Deck:
    def __init__(self, data, times, base):
        self.times = times
        self.intro, self.headers, self.cards = render_screens(data, base)
        self.bg = Image.new("RGBA", (W, H), BG + (255,))
        self._cache = {}

    def _card(self, i, scale, angle, dim):
        key = (i, round(scale, 3), round(angle, 2), round(dim, 3))
        if key not in self._cache:
            img, m = self.cards[i]
            if dim > 0:
                rgb = ImageChops.multiply(img.convert("RGB"), Image.new("RGB", img.size, (int(255 * (1 - dim)),) * 3))
                img = Image.merge("RGBA", (*rgb.split(), img.getchannel("A")))
            if scale != 1:
                img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
            if angle:
                img = img.rotate(angle, resample=Image.BICUBIC, expand=True)
            if len(self._cache) > 400:
                self._cache.clear()
            self._cache[key] = (img, m * scale)
        return self._cache[key]

    def frame(self, t):
        t0 = self.times[0]
        frame = self.bg.copy()
        e = ease((t - t0) / FADE)
        if e < 1:   # 中文頁淡出
            intro = self.intro.convert("RGBA")
            intro.putalpha(int(255 * (1 - e)))
            frame.alpha_composite(intro, (0, -int(120 * e)))
        if t >= t0:
            hi = max(k for k, s in enumerate(self.times) if t >= s)
            head = self.headers[hi].convert("RGBA")
            head.putalpha(int(255 * e))
            frame.alpha_composite(head, (0, 0))
        cw = CARD[0] * SCALE
        # 每張卡的深度：之後每多一張落下，往後退一層（跟著新卡飛進來的進度連續變化）
        shown = [i for i, s in enumerate(self.times) if t >= s]
        for i in shown:
            p = (t - self.times[i]) / FLY
            depth = sum(ease_out((t - self.times[j]) / FLY) for j in shown if j > i)
            if depth > MAX_DEPTH + 0.99:
                continue
            scale = 1 - DEPTH_SCALE * depth
            dim = DEPTH_DIM * depth
            y = CARD_Y - DEPTH_DY * depth
            angle = 0.0
            if p < 1:   # 從下方飛進來、帶一點旋轉，落定時微微回彈
                y += (H - CARD_Y + 120) * (1 - ease_out_back(p))
                angle = 7 * (1 - ease_out(p)) * (1 if i % 2 else -1)
            img, m = self._card(i, scale, angle, dim)
            x = (W - cw * scale) / 2
            # 旋轉後圖變大：以卡片中心對齊
            cx, cy = x + cw * scale / 2, y + CARD[1] * SCALE * scale / 2
            if depth > MAX_DEPTH:
                img = img.copy()
                img.putalpha(img.getchannel("A").point(lambda v, f=MAX_DEPTH + 1 - depth: int(v * f)))
            frame.alpha_composite(img, (int(cx - img.width / 2), int(cy - img.height / 2)))
        return frame.convert("RGB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ladder")
    ap.add_argument("--sfx", help="一串短音效（自動切開，每張卡落下放一聲）")
    ap.add_argument("--sfx-offset", type=float, default=0.12, help="音效相對卡片起飛的延遲秒數")
    ap.add_argument("--sfx-gain", type=float, default=0.9)
    ap.add_argument("--intro", type=float, default=1.6, help="中文頁單獨停留秒數")
    ap.add_argument("--step", type=float, default=2.6, help="每張卡停留秒數")
    ap.add_argument("--tail", type=float, default=2.8, help="最後一張落下後停留秒數")
    ap.add_argument("--detect", action="store_true")
    ap.add_argument("--stills")
    ap.add_argument("--out")
    a = ap.parse_args()

    if a.detect:
        if not a.sfx:
            sys.exit("--detect 需要 --sfx")
        hits, onsets = sfx_hits(a.sfx)
        print(f"{len(hits)} 聲，起點：{onsets}")
        return
    if not (a.ladder and a.out):
        sys.exit("需要 --ladder 與 --out")

    ladder_path = pathlib.Path(a.ladder)
    data = json.loads(ladder_path.read_text())
    levels = data["levels"]
    if all("at" in lv for lv in levels):
        times = [float(lv["at"]) for lv in levels]
    else:
        times = [round(a.intro + i * a.step, 2) for i in range(len(levels))]
    dur = times[-1] + a.tail
    for i, (lv, s) in enumerate(zip(levels, times)):
        print(f"Lv.{i + 1} {lv['tag']:<4} @ {s:5.2f}s  {lv['en']}")
    print(f"總長 {dur:.2f}s")

    deck = Deck(data, times, ladder_path.parent)

    if a.stills:
        out = pathlib.Path(a.out)
        out.mkdir(parents=True, exist_ok=True)
        for s in a.stills.split(","):
            deck.frame(float(s)).save(out / f"still_{float(s):05.2f}.png")
        print(f"預覽 → {out}")
        return

    # 音軌：靜音底 + 每張卡一聲音效
    track = np.zeros((int(dur * SR) + SR, 2), np.float32)
    if a.sfx:
        hits, _ = sfx_hits(a.sfx)
        for k, s in enumerate(times):
            h = hits[k % len(hits)]
            p = int((s + a.sfx_offset) * SR)
            track[p:p + len(h)] += h[:len(track) - p] * a.sfx_gain
        peak = np.abs(track).max()
        if peak > 0.89:
            track *= 0.89 / peak
    work = pathlib.Path(tempfile.mkdtemp())
    wav = work / "track.f32"
    track.tofile(wav)

    ff = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", str(wav),
         "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-shortest", a.out],
        stdin=subprocess.PIPE)
    for i in range(int(dur * FPS)):
        ff.stdin.write(deck.frame(i / FPS).tobytes())
    ff.stdin.close()
    ok = ff.wait() == 0
    shutil.rmtree(work)
    if not ok:
        sys.exit("ffmpeg 失敗")
    print(f"→ {a.out}")


if __name__ == "__main__":
    main()
