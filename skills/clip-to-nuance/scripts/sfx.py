#!/usr/bin/env python3
"""Splash / CTA 音效：照搬 promo 1（promo-vids/2026-10-12-feature-promo/project/audio2.py）的合成音效與 sfx_mix.json 的音量。

usage: python3 sfx.py <out.wav> <duration> <type@sec> [<type@sec> ...]
type: whoosh（splash 進場）/ pop（splash 出現）/ swipe（splash 擦除）/ shine（CTA icon 掃光）
promo 1 的時間：whoosh = splash 前 0.15 秒、pop = splash +0.1、swipe = splash +0.6、shine = CTA 掃光開始（第 241 幀）。
"""
import sys
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 48000
rng = np.random.default_rng(11)

def flt(x, f, kind, o=2): return sosfilt(butter(o, f, kind, fs=SR, output="sos"), x)
def tt(d): return np.arange(int(d * SR)) / SR

def s_sweep(d, up):
    t = tt(d); x = t / d; n = rng.standard_normal(len(t)); env = np.sin(np.pi * x) ** 1.5
    a = x if up else 1 - x
    return (flt(n, [250, 1400], "band") * (1 - a) + flt(n, [1400, 7000], "band") * a) * env * .45

def s_pop(f0=500, f1=1100, d=.09, v=.3):
    t = tt(d); f = f0 + (f1 - f0) * t / d; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 40) * v

def s_shine():
    d = 1.4; t = tt(d); sw = .45
    env = np.where(t < sw, (t / sw) ** 2, np.exp(-(t - sw) * 6))
    shimmer = flt(rng.standard_normal(len(t)), [5500, 12000], "band", 2) * env * .10
    tb = np.maximum(0, t - sw); gate = (t >= sw) * np.minimum(1, tb / .004)
    bell = sum(a * np.sin(2 * np.pi * f * tb) * np.exp(-tb * r) for f, a, r in ((2093, .5, 4), (3136, .35, 5), (4186, .25, 6.5), (5274, .15, 8)))
    return shimmer + bell * gate * .2

SOUNDS = {   # (合成, promo 1 的 place() 倍率 × sfx_mix.json 增益)
    "whoosh": (lambda: s_sweep(.35, True), .9),
    "pop": (lambda: s_pop(260, 700, .14, .35), 1.0),
    "swipe": (lambda: s_sweep(.22, True), .35),
    "shine": (s_shine, 10 ** (12 / 20)),
}
PEAK = 10 ** (-8 / 20)   # 音效之間的比例照 promo 1；整體峰值壓在 -8 dBFS（原片台詞峰值約 -9 dB）

out, dur = sys.argv[1], float(sys.argv[2])
buf = np.zeros(int(dur * SR) + SR)
for ev in sys.argv[3:]:
    ty, t = ev.split("@")
    synth, g = SOUNDS[ty]
    sig = synth() * g
    i = int(max(0.0, float(t)) * SR)
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]
buf = buf[: int(dur * SR)]
buf = buf / max(1e-9, np.max(np.abs(buf))) * PEAK
wavfile.write(out, SR, np.stack([buf, np.roll(buf, 10)], 1).astype(np.float32))
print("sfx", out)
