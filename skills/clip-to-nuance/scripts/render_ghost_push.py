#!/usr/bin/env python3
"""Part 1 渲染：原片不暫停，講到目標單字時 Ghost 單字卡從底部升起、把影片與字幕往上推，停留後落回原位。

usage:
  python3 render_ghost_push.py --source <topic>.mp4 --subs subtitles.ass --cards cards.json \
      [--hold 3] [--theme light|dark] [--type-speed 2] [--audio other.mp4] --out <topic>-ghost.mp4 [--stills 4,6,8]

--subs   .ass（取 Style=Eng / Chi 的 Dialogue）或 .json：[{"start":1.0,"end":3.6,"en":"...","zh":"..."}]
--cards  [{"word","ipa","pos","definition","sentence","translation","trigger", "hold"?, "match"?}, ...]（match：台詞裡實際的寫法，例如 bringing ...，預設同 word）
         trigger = 講到該字的秒數；hold = 打完字後再停留幾秒（省略時用 --hold）。

多張卡：
- 上一張還在畫面上時下一張就來了 → 上一張縮到左半邊，新的一張出現在右半邊；上一張時間到淡出後，右邊那張放大回全寬。
- 上一張剛走、下一張在 GAP_KEEP_PUSHED 秒內就來 → 影片不落回，直接換卡。
- 最後一張停到片尾還不夠時，就一路停到片尾（接 Splash）。

卡片 UI 與打字效果照抄 App 的 CreateCardGhostPreviewSceneUI.tsx 的 ProgressiveText：每 50ms 一跳，一次跳 1/2/3/6 個字
（剩餘 ≤10 / ≤30 / ≤80 / 更多）。各段之間不停頓：單字 → 釋義 → 例句 → 翻譯一口氣打完。--type-speed 2 = App 的兩倍速。
推移曲線同時寫進 ffmpeg overlay 的 y 表達式與 PIL 疊層，兩邊必須用同一個 ease()。
"""
import argparse, glob, json, math, pathlib, re, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
PUSH = 0.45            # 上推 / 落回 秒數
SWAP = 0.3             # 換卡淡入淡出秒數
GAP_KEEP_PUSHED = 1.2  # 兩張卡間隔小於這個秒數就不落回，直接換卡
RESHAPE = 0.35         # 全寬 ↔ 半邊 變形秒數
FADE_OUT = 0.25        # 卡片時間到淡出秒數
SPLIT_GAP = 24         # 左右兩張卡的間距
S = 2.6                # App dp → 影片 px

# --- App 打字節奏（src/features/createCard/ghostAnimationTiming.ts）---
GHOST_SPEED = 0.75 * 0.75
TEXT_UPDATE = round(28 / GHOST_SPEED) / 1000       # ProgressiveText 每跳間隔
TYPE_INTERVAL = round(54 / GHOST_SPEED) / 1000     # getPreviewTypingDuration 每 tick
TYPE_TAIL = round(120 / GHOST_SPEED) / 1000
REVEAL_DELAY = 0.16                                 # revealSequence: await wait(160)

# --- 主題色（src/theme/colors.ts + getGhostCardTone）---
THEMES = {
    "light": dict(bg=(255, 255, 255), text=(15, 23, 42), sub=(148, 163, 184), chip_bg=(240, 241, 243),
                  chip_border=(233, 234, 237), divider=(226, 232, 240), outline=(78, 175, 244, 56),
                  shadow=(15, 23, 42, 40), hl_fg=(17, 17, 17), hl_bg=(226, 241, 252), hl_line=(47, 155, 234)),
    "dark": dict(bg=(30, 41, 59), text=(248, 250, 252), sub=(148, 163, 184), chip_bg=(51, 65, 85),
                 chip_border=(64, 79, 100), divider=(51, 65, 85), outline=(78, 175, 244, 148),
                 shadow=(78, 175, 244, 90), hl_fg=(248, 250, 252), hl_bg=(21, 49, 74), hl_line=(109, 188, 246)),
}
SUB_ACCENT = (78, 175, 244)   # 字幕中目標字（MODAL_CTA_COLOR）
SUB_ZH = (120, 214, 255)

POS_ZH = {"n": "名詞", "noun": "名詞", "v": "動詞", "verb": "動詞", "adj": "形容詞", "adjective": "形容詞",
          "adv": "副詞", "adverb": "副詞", "phrase": "片語", "pron": "代名詞", "prep": "介系詞"}


# ---------- fonts ----------
def _pingfang():
    hits = glob.glob("/System/Library/AssetsV2/*/*/AssetData/PingFang.ttc")
    if hits:
        return hits[0], {"regular": 2, "medium": 6, "semibold": 10}
    return "/System/Library/Fonts/STHeiti Medium.ttc", {"regular": 0, "medium": 0, "semibold": 0}

_PF, _PF_IDX = _pingfang()
_font_cache = {}

def font(size, weight="semibold"):
    """PingFang TC（中文）。"""
    key = ("pf", int(size), weight)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(_PF, int(size), index=_PF_IDX[weight])
    return _font_cache[key]

def font_en(size, weight="Bold"):
    """SF Pro（英文 / 音標）。weight: Medium / Semibold / Bold / Heavy。舊呼叫的 bool 參數視為 Bold / Semibold。"""
    if isinstance(weight, bool):
        weight = "Bold" if weight else "Semibold"
    key = ("sf", int(size), weight)
    if key not in _font_cache:
        f = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", int(size))
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
        _font_cache[key] = f
    return _font_cache[key]


# ---------- push timing ----------
def ease(x):
    x = max(0.0, min(1.0, x))
    return 4 * x ** 3 if x < 0.5 else 1 - (2 - 2 * x) ** 3 / 2

def push_progress(t, segments):
    return max((ease(min((t - s) / PUSH, (e - t) / PUSH)) for s, e, _ in segments), default=0.0)

def ffmpeg_push_expr(y0, d, segments):
    terms = []
    for s, e, _ in segments:
        x = f"clip(min((t-{s:.3f})/{PUSH},({e:.3f}-t)/{PUSH}),0,1)"
        terms.append(f"if(lt({x},0.5),4*pow({x},3),1-pow(2-2*{x},3)/2)")
    return f"{y0}-{d}*({'+'.join(terms) or '0'})"   # 各段不重疊，相加即可

def build_segments(cards, dur):
    """card["_start"/"_end"] 已算好。回傳 [(start, end, [card...])]；end = 落回完成的時間。"""
    segs = []
    for c in cards:
        if segs and c["_start"] <= max(x["_end"] for x in segs[-1]) + GAP_KEEP_PUSHED:
            segs[-1].append(c)
        else:
            segs.append([c])
    out = []
    for cs in segs:
        last = max(cs, key=lambda c: c["_end"])
        for c in cs:
            c["_last"] = c is last               # 最後離場的那張跟著影片一起落回，不另外淡出
        end = last["_end"] + PUSH
        if end > dur - 0.1:
            end = dur + 10                       # 停到片尾，不落回
        out.append((cs[0]["_start"], end, cs))
    return out


# ---------- App 打字效果 ----------
def typed_secs(total):
    """ProgressiveText 把 total 個字打完需要的秒數。"""
    n, ticks = 0, 0
    while n < total:
        rem = total - n
        n += 6 if rem > 80 else 3 if rem > 30 else 2 if rem > 10 else 1
        ticks += 1
    return ticks * TEXT_UPDATE

def visible_count(total, elapsed):
    """ProgressiveText：setInterval 每 TEXT_UPDATE 一跳。"""
    if elapsed < 0:
        return -1                                  # 尚未 active
    n = 0
    for _ in range(int(elapsed / TEXT_UPDATE)):
        if n >= total:
            break
        rem = total - n
        n = min(total, n + (6 if rem > 80 else 3 if rem > 30 else 2 if rem > 10 else 1))
    return n


# ---------- inputs ----------
def ass_time(s):
    h, m, rest = s.split(":")
    return int(h) * 3600 + int(m) * 60 + float(rest)

def load_subs(path):
    p = pathlib.Path(path)
    if p.suffix == ".json":
        return json.loads(p.read_text())
    cues = {}
    for line in p.read_text().splitlines():
        m = re.match(r"Dialogue:\s*\d+,([^,]+),([^,]+),(\w+),[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,(.*)", line)
        if not m:
            continue
        start, end, style, text = ass_time(m[1]), ass_time(m[2]), m[3], re.sub(r"\{[^}]*\}", "", m[4])
        cue = cues.setdefault((start, end), {"start": start, "end": end, "en": "", "zh": ""})
        cue["en" if style.lower().startswith("eng") else "zh"] = text
    return sorted(cues.values(), key=lambda c: c["start"])

def probe(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                   "stream=width,height:format=duration", "-of", "json", path])
    j = json.loads(out)
    s = j["streams"][0]
    return s["width"], s["height"], float(j["format"]["duration"])


# ---------- rich text（換行一次排好，打字時只截字數，不會重排）----------
TOKEN_RE = re.compile(r"[A-Za-z0-9'’\-]+[.,!?;:\"”…]*\s*|\s+|.")

def term_span(text, term):
    if not term:
        return None
    m = re.search(re.escape(term), text, flags=re.I)
    return (m.start(), m.end()) if m else None

def layout_text(text, f, f_hl, max_w, span=None):
    """回傳 lines：[(start_index, end_index)]，以 char index 表示。"""
    def w(i, j):
        total, k = 0.0, i
        while k < j:
            hl = span and span[0] <= k < span[1]
            r = k
            while r < j and bool(span and span[0] <= r < span[1]) == bool(hl):
                r += 1
            total += (f_hl if hl else f).getlength(text[k:r])
            k = r
        return total
    lines, ls, pos = [], 0, 0
    for tok in TOKEN_RE.findall(text):
        end = pos + len(tok)
        if w(ls, end) > max_w and pos > ls:
            lines.append((ls, pos))
            ls = pos + (len(tok) - len(tok.lstrip()))
        pos = end
    if pos > ls:
        lines.append((ls, pos))
    return lines

def draw_text_block(d, x, y, text, lines, f, f_hl, line_h, color, theme, visible, span=None):
    """畫已排版的文字，只畫前 visible 個字；span 內用 App 的目標字樣式（螢光底 + 底線 + 粗體）。"""
    asc = f.getmetrics()[0]
    for li, (a, b) in enumerate(lines):
        cx, ty = x, y + li * line_h + (line_h - (asc + f.getmetrics()[1])) / 2
        k = a
        stop = min(b, max(0, visible))
        while k < stop:
            hl = bool(span and span[0] <= k < span[1])
            r = k
            while r < stop and bool(span and span[0] <= r < span[1]) == hl:
                r += 1
            seg = text[k:r].rstrip("\n") if r == b else text[k:r]
            ff = f_hl if hl else f
            sw = ff.getlength(seg)
            if hl:
                d.rectangle((cx, ty + 4, cx + sw, ty + asc + f.getmetrics()[1] - 2), fill=theme["hl_bg"])
                d.text((cx, ty), seg, font=ff, fill=theme["hl_fg"])
                d.rectangle((cx, ty + asc + 6, cx + sw, ty + asc + 9), fill=theme["hl_line"])
            else:
                d.text((cx, ty), seg, font=ff, fill=color)
            cx += sw
            k = r


# ---------- subtitles ----------
def sub_block(cue, words):
    fe, fz = font_en(50), font(42, "semibold")
    en_lines = wrap_simple(fe, cue["en"], W - 140) if cue["en"] else []
    zh_lines = wrap_simple(fz, cue["zh"], W - 140) if cue["zh"] else []
    pad_x, pad_y, gap = 24, 12, 14
    rows = [(l, fe, (255, 255, 255), True) for l in en_lines] + [(l, fz, SUB_ZH, False) for l in zh_lines]
    heights = [f.getbbox("Hg國")[3] + pad_y * 2 for _, f, _, _ in rows]
    img = Image.new("RGBA", (W, max(1, sum(heights) + gap * (len(rows) - 1))), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pattern = re.compile("(" + "|".join(re.escape(w) for w in words) + ")", re.I) if words else None
    y = 0
    for (line, f, color, is_en), h in zip(rows, heights):
        lw = f.getlength(line)
        x = (W - lw) / 2
        d.rounded_rectangle((x - pad_x, y, x + lw + pad_x, y + h), radius=14, fill=(0, 0, 0, 170))
        parts = pattern.split(line) if (pattern and is_en) else [line]
        cx = x
        for part in parts:
            if not part:
                continue
            hit = bool(pattern and is_en and pattern.fullmatch(part))
            d.text((cx, y + pad_y - 4), part, font=f, fill=SUB_ACCENT if hit else color)
            cx += f.getlength(part)
        y += h + gap
    return img

def wrap_simple(f, text, max_w):
    lines, cur = [], ""
    for tok in TOKEN_RE.findall(text):
        if f.getlength(cur + tok) <= max_w or not cur:
            cur += tok
        else:
            lines.append(cur.rstrip())
            cur = tok.lstrip()
    if cur.strip():
        lines.append(cur.rstrip())
    return lines


# ---------- ghost card（App: CreateCardGhostPreviewSceneUI 正面）----------
CARD_MARGIN = 56
CARD_W = W - CARD_MARGIN * 2
PAD_X, PAD_TOP, PAD_BOTTOM = 18 * S, 18 * S, 16 * S
INNER_W = CARD_W - PAD_X * 2

F_WORD = lambda: font_en(34 * S, "Heavy")
F_IPA = lambda: font_en(15 * S, "Medium")
F_POS = lambda: font(12 * S, "semibold")
F_DEF = lambda: font(22 * S, "semibold")
F_SENT = lambda: font_en(20 * S, "Semibold")
F_SENT_HL = lambda: font_en(20 * S, "Heavy")
F_TR = lambda: font(20 * S, "semibold")
LH_WORD, LH_DEF, LH_SENT = 38 * S, 30 * S, 28 * S
SPEAKER = 32 * S

def prepare_card(card):
    pos = card.get("pos", "")
    card["_pos"] = POS_ZH.get(pos.lower().strip(". "), pos)
    pos_w = F_POS().getlength(card["_pos"]) + 20 * S + 2 * S if card["_pos"] else 0
    card["_pos_w"] = pos_w
    card["_word_lines"] = layout_text(card["word"], F_WORD(), F_WORD(), INNER_W)
    card["_def_lines"] = layout_text(card["definition"], F_DEF(), F_DEF(), INNER_W - pos_w - 10 * S)
    card["_span"] = term_span(card["sentence"], card.get("match", card["word"]))
    card["_sent_lines"] = layout_text(card["sentence"], F_SENT(), F_SENT_HL(), INNER_W, card["_span"])
    card["_tr_lines"] = layout_text(card["translation"], F_TR(), F_TR(), INNER_W)
    # 各段接連開始、不停頓
    t = REVEAL_DELAY
    for key, field in (("_t_word", "word"), ("_t_def", "definition"), ("_t_sent", "sentence"), ("_t_tr", "translation")):
        card[key] = t
        t += typed_secs(len(card[field]))
    card["_t_done"] = t
    # 高度
    h = PAD_TOP
    h += len(card["_word_lines"]) * LH_WORD + 4 * S
    h += SPEAKER + 12 * S
    h += 2 * S + max(len(card["_def_lines"]) * LH_DEF, 28 * S)
    h += 16 * S + 1 * S + 14 * S
    h += 4 * S + len(card["_sent_lines"]) * LH_SENT + 2 * S + len(card["_tr_lines"]) * LH_SENT
    card["_h"] = int(h + PAD_BOTTOM)

def render_card(card, lt, theme, ch):
    """lt = 卡片出現後經過秒數。回傳 (RGBA, margin)。"""
    m = 70
    img = Image.new("RGBA", (CARD_W + m * 2, ch + m * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((m, m + 14 * S, m + CARD_W, m + ch + 14 * S * 0.4), radius=28 * S,
                                         fill=theme["shadow"])
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(22 * S / 2)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((m, m, m + CARD_W, m + ch), radius=28 * S, fill=theme["bg"] + (255,),
                        outline=theme["outline"], width=max(2, int(S)))
    x, y = m + PAD_X, m + PAD_TOP

    # 1. 單字（ProgressiveText）
    draw_text_block(d, x, y, card["word"], card["_word_lines"], F_WORD(), F_WORD(), LH_WORD, theme["text"], theme,
                    visible_count(len(card["word"]), lt - card["_t_word"]))
    y += len(card["_word_lines"]) * LH_WORD + 4 * S

    # 1b. 音標 + 喇叭按鈕
    ipa = card.get("ipa", "")
    if ipa:
        f = F_IPA()
        d.text((x, y + (SPEAKER - sum(f.getmetrics())) / 2), ipa, font=f, fill=theme["sub"])
        bx = x + f.getlength(ipa) + 10 * S
    else:
        bx = x
    d.ellipse((bx, y, bx + SPEAKER, y + SPEAKER), outline=theme["divider"], width=max(2, int(S)))
    cx, cy, u = bx + SPEAKER / 2, y + SPEAKER / 2, S
    d.polygon([(cx - 6 * u, cy - 2.5 * u), (cx - 3 * u, cy - 2.5 * u), (cx + 1 * u, cy - 6 * u),
               (cx + 1 * u, cy + 6 * u), (cx - 3 * u, cy + 2.5 * u), (cx - 6 * u, cy + 2.5 * u)], fill=theme["sub"])
    d.arc((cx - 1 * u, cy - 4 * u, cx + 6 * u, cy + 4 * u), -55, 55, fill=theme["sub"], width=max(2, int(1.4 * u)))
    y += SPEAKER + 12 * S

    # 2. 詞性膠囊（FadeIn 220ms）+ 釋義
    y += 2 * S
    def_h = max(len(card["_def_lines"]) * LH_DEF, 28 * S)
    if card["_pos"]:
        k = max(0.0, min(1.0, lt / 0.22))
        chip_h = 12 * S * 1.2 + 8 * S + 2 * S
        cy0 = y + (min(def_h, LH_DEF) - chip_h) / 2
        mix = lambda c: tuple(int(b + (v - b) * k) for b, v in zip(theme["bg"], c))
        d.rounded_rectangle((x, cy0, x + card["_pos_w"], cy0 + chip_h), radius=chip_h / 2,
                            fill=mix(theme["chip_bg"]), outline=mix(theme["chip_border"]), width=max(2, int(S)))
        fp = F_POS()
        d.text((x + 11 * S, cy0 + (chip_h - sum(fp.getmetrics())) / 2), card["_pos"], font=fp, fill=mix(theme["sub"]))
    dx = x + card["_pos_w"] + (10 * S if card["_pos"] else 0)
    draw_text_block(d, dx, y, card["definition"], card["_def_lines"], F_DEF(), F_DEF(), LH_DEF, theme["text"], theme,
                    visible_count(len(card["definition"]), lt - card["_t_def"]))
    y += def_h

    # 分隔線
    y += 16 * S
    d.rectangle((x, y, m + CARD_W - PAD_X, y + max(2, S)), fill=theme["divider"])
    y += 1 * S + 14 * S

    # 3. 例句 + 翻譯（目標字：螢光底 + 底線）
    y += 4 * S
    draw_text_block(d, x, y, card["sentence"], card["_sent_lines"], F_SENT(), F_SENT_HL(), LH_SENT, theme["text"],
                    theme, visible_count(len(card["sentence"]), lt - card["_t_sent"]), card["_span"])
    y += len(card["_sent_lines"]) * LH_SENT + 2 * S
    draw_text_block(d, x, y, card["translation"], card["_tr_lines"], F_TR(), F_TR(), LH_SENT, theme["text"], theme,
                    visible_count(len(card["translation"]), lt - card["_t_tr"]))
    return img, m


# ---------- main ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--subs", required=True)
    ap.add_argument("--cards", required=True)
    ap.add_argument("--hold", type=float, default=3.0, help="打完字後停留秒數")
    ap.add_argument("--theme", choices=THEMES, default="light")
    ap.add_argument("--type-speed", type=float, default=2.0, help="打字速度倍率；1 = App 原速")
    ap.add_argument("--audio", default="", help="原片沒有音軌時，從這支檔案取音訊")
    ap.add_argument("--out", required=True)
    ap.add_argument("--stills", default="")
    a = ap.parse_args()

    theme = THEMES[a.theme]
    global TEXT_UPDATE, TYPE_INTERVAL, TYPE_TAIL, REVEAL_DELAY
    TEXT_UPDATE, TYPE_INTERVAL, TYPE_TAIL, REVEAL_DELAY = (v / a.type_speed for v in
                                                           (TEXT_UPDATE, TYPE_INTERVAL, TYPE_TAIL, REVEAL_DELAY))
    sw, sh, dur = probe(a.source)
    cards = sorted(json.loads(pathlib.Path(a.cards).read_text()), key=lambda c: c["trigger"])
    for c in cards:
        prepare_card(c)
        c["_start"] = c["trigger"]
        c["_end"] = c["trigger"] + c["_t_done"] + c.get("hold", a.hold)
    cues = load_subs(a.subs)
    words = [c.get("match", c["word"]) for c in cards]
    segments = build_segments(cards, dur)

    vid_h = round(W * sh / sw / 2) * 2
    y0 = (H - vid_h) // 2
    sub_gap = 150
    max_sub_h = max((sub_block(c, words).height for c in cues), default=0)
    ch = max(c["_h"] for c in cards)
    block_h = vid_h + sub_gap + max_sub_h + 40 + ch
    top = max(70, (H - block_h) // 2)
    d_push = y0 - top
    card_final_y = top + vid_h + sub_gap + max_sub_h + 40

    print(f"video {sw}x{sh} -> band {W}x{vid_h} @y={y0}; push {d_push}px; card {CARD_W}x{ch} @y={card_final_y}; "
          f"theme {a.theme}")
    for s, e, cs in segments:
        print(f"  segment {s:.2f}-{min(e, dur):.2f}s: " + ", ".join(
            f"{c['word']}@{c['trigger']:.2f}–{min(c['_end'], dur):.2f} (打字 {c['_t_done']:.1f}s)"
            for c in cs))

    sub_cache = {}

    half = (CARD_W - SPLIT_GAP) / 2
    SLOTS = {"full": (CARD_MARGIN, 1.0), "left": (CARD_MARGIN, half / CARD_W),
             "right": (CARD_MARGIN + half + SPLIT_GAP, half / CARD_W)}

    def slot_at(c, cs, t):
        others = [o for o in cs if o is not c and o["_start"] <= t < o["_end"]]
        if any(o["_start"] < c["_start"] for o in others):
            return "right"
        return "left" if others else "full"

    def slot_geom(c, cs, t):
        """全寬 / 左半 / 右半，切換時用 RESHAPE 秒過渡。"""
        events = sorted({c["_start"]} | {o[k] for o in cs if o is not c for k in ("_start", "_end")})
        cur, prev, since = slot_at(c, cs, c["_start"]), None, c["_start"]
        for ev in events:
            if c["_start"] < ev <= t:
                nxt = slot_at(c, cs, ev)
                if nxt != cur:
                    prev, cur, since = cur, nxt, ev
        (x1, s1) = SLOTS[cur]
        if prev is None:
            return x1, s1
        k = ease((t - since) / RESHAPE)
        (x0, s0) = SLOTS[prev]
        return x0 + (x1 - x0) * k, s0 + (s1 - s0) * k

    def card_layers(t):
        """回傳 [(card_img, x, alpha, dy)]，img 已縮放、x 為卡片左緣。"""
        for s, e, cs in segments:
            if not (s <= t < e):
                continue
            layers = []
            for c in cs:
                lt = t - c["_start"]
                if lt < 0 or (not c["_last"] and t >= c["_end"] + FADE_OUT):
                    continue
                alpha, dy = 1.0, 0.0
                if c["_start"] > s:                               # 中途加入：由下淡入（分割時等左邊那張縮好）
                    wait = RESHAPE * 0.6 if slot_at(c, cs, c["_start"]) == "right" else 0
                    k = ease((lt - wait) / SWAP)
                    alpha, dy = k, 40 * (1 - k)
                if not c["_last"] and t >= c["_end"]:             # 時間到：上移淡出
                    k = ease((t - c["_end"]) / FADE_OUT)
                    alpha, dy = alpha * (1 - k), -30 * k
                x, sc = slot_geom(c, cs, t)
                img, m = render_card(c, lt, theme, c["_h"])
                if sc < 0.999:
                    img = img.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.LANCZOS)
                layers.append((img, x - m * sc, alpha, dy - m * sc))
            return layers
        return []

    def overlay_frame(t):
        p = push_progress(t, segments)
        vy = y0 - d_push * p
        frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        cue = next((c for c in cues if c["start"] <= t < c["end"]), None)
        if cue:
            key = id(cue)
            if key not in sub_cache:
                sub_cache[key] = sub_block(cue, words)
            frame.alpha_composite(sub_cache[key], (0, int(vy + vid_h + sub_gap)))
        if p > 0:
            cy = card_final_y + (H + 60 - card_final_y) * (1 - p)
            for img, x, alpha, dy in card_layers(t):
                alpha *= min(1, p * 1.6)
                if alpha < 1:
                    img.putalpha(img.getchannel("A").point(lambda v, k=alpha: int(v * k)))
                frame.alpha_composite(img, (int(x), int(cy + dy)))
        return frame, vy

    vf_bg = (f"[0:v]fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
             f"gblur=sigma=40,eq=brightness=-0.08[bg];"
             f"[0:v]fps={FPS},scale={W}:{vid_h},setsar=1[vid];")

    if a.stills:
        out = pathlib.Path(a.out)
        out.mkdir(parents=True, exist_ok=True)
        for s in [float(v) for v in a.stills.split(",")]:
            ov, vy = overlay_frame(s)
            png = out / f"ov_{s:05.2f}.png"
            ov.save(png)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(s), "-i", a.source, "-i", str(png),
                            "-filter_complex", vf_bg + f"[bg][vid]overlay=0:{int(vy)}[b];[b][1:v]overlay=0:0",
                            "-frames:v", "1", str(out / f"still_{s:05.2f}.png")], check=True)
            png.unlink()
            print("still", s)
        return

    n = int(dur * FPS)
    y_expr = ffmpeg_push_expr(y0, d_push, segments)
    audio_in = ["-i", a.audio] if a.audio else []
    audio_map = "2:a" if a.audio else "0:a?"
    ff = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-i", a.source,
         "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-framerate", str(FPS), "-i", "-", *audio_in,
         "-filter_complex", vf_bg + f"[bg][vid]overlay=x=0:y='{y_expr}'[b];[b][1:v]overlay=0:0:shortest=1,format=yuv420p[v]",
         "-map", "[v]", "-map", audio_map, "-shortest", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k", "-r", str(FPS), a.out],
        stdin=subprocess.PIPE)
    last_key, last_bytes = None, None
    for i in range(n):
        t = i / FPS
        p = push_progress(t, segments)
        cue = next((c for c in cues if c["start"] <= t < c["end"]), None)
        key = None if p > 0 else (id(cue) if cue else -1)   # 卡片不在時，同一句字幕的幀可重複使用
        if key is None or key != last_key:
            last_bytes = overlay_frame(t)[0].tobytes()
            last_key = key
        ff.stdin.write(last_bytes)
        if i % 90 == 0:
            print(f"{i}/{n}", flush=True)
    ff.stdin.close()
    if ff.wait() != 0:
        sys.exit("ffmpeg failed")
    print("done", a.out)


if __name__ == "__main__":
    main()
