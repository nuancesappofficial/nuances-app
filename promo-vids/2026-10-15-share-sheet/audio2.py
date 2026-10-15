"""Upbeat synthesized bed (~116 BPM) + SFX placed from an S1 timeline JSON.
usage: python3 audio2.py out/s1v3_timeline.json out/s1v3_audio.wav
"""
import json, sys
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 48000; rng = np.random.default_rng(11)
tl = json.load(open(sys.argv[1])); DUR = tl["duration"]; N = int(DUR * SR) + SR
def flt(x, f, kind, o=2): return sosfilt(butter(o, f, kind, fs=SR, output="sos"), x)
def tt(d): return np.arange(int(d * SR)) / SR
def place(buf, sig, t, g=1.0):
    i = int(max(0, t) * SR); j = min(len(buf), i + len(sig))
    if i < len(buf): buf[i:j] += g * sig[: j - i]
def midi(n): return 440 * 2 ** ((n - 69) / 12)

BPM = 116; beat = 60 / BPM; bar = 4 * beat; nb = int(DUR / bar) + 2
prog = [[60, 64, 67, 72], [59, 62, 67, 71], [57, 60, 64, 69], [57, 60, 65, 69]]   # C G Am F
roots = [36, 31, 33, 29]
def pluck(f, d=.3, v=.1):
    t = tt(d); ph = 2 * np.pi * f * t
    saw = sum(np.sin(k * ph) / k for k in range(1, 7))
    return flt(saw * np.exp(-t * 12) * np.minimum(1, t / .002), min(9000, f * 6), "low") * v
def pad(fs, d, v=.03):
    t = tt(d); s = sum(np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * 2.003 * f * t) for f in fs)
    return s * np.minimum(1, t / .25) * np.minimum(1, (d - t) / .3) * v
mel = np.zeros(N); bass = np.zeros(N); drums = np.zeros(N)
for b in range(nb):
    t0 = b * bar; ch = prog[b % 4]
    place(mel, pad([midi(n) for n in ch], bar), t0)
    for s in range(16):
        if s % 4 == 3 and rng.random() < .5: continue
        n = ch[[0, 1, 2, 3, 2, 1][s % 6]] + (12 if s % 8 == 6 else 0)
        place(mel, pluck(midi(n), v=.08 if s % 2 else .11), t0 + s * beat / 4)
    for s in range(8):
        t = tt(beat / 2 * .9); f = midi(roots[b % 4] + (12 if s % 4 == 3 else 0))
        place(bass, (np.sin(2 * np.pi * f * t) + .25 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 6) * .3, t0 + s * beat / 2)
def kick():
    t = tt(.32); f = 48 + 110 * np.exp(-t * 32)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 10)
def clap():
    t = tt(.22); return flt(rng.standard_normal(len(t)), [1100, 6000], "band") * np.exp(-t * 22) * .7
def hat(v):
    t = tt(.05); return flt(rng.standard_normal(len(t)), 8000, "high") * np.exp(-t * 80) * v
for b in range(nb):
    t0 = b * bar
    for q in range(4): place(drums, kick(), t0 + q * beat, .8)
    for q in (1, 3): place(drums, clap(), t0 + q * beat, .5)
    for s in range(16): place(drums, hat(.09 if s % 2 else .14), t0 + s * beat / 4)
tN = np.arange(N) / SR; duck = .55 + .45 * np.minimum(1, ((tN % beat) / beat) / .45)
music = np.tanh(((mel + bass) * duck + drums * .8) * 1.2) * .8
music *= np.minimum(1, tN / .4)
# music stops right after the last word: fast low-pass sweep, then a silent beat
re = tl.get("readEnd", DUR); i0 = int((re - .05) * SR); i1 = int((re + .3) * SR)
seg = music[i0:i1].copy(); out = np.zeros_like(seg); step = 1200
for k in range(0, len(seg), step):
    fc = max(150, 6000 * (1 - k / len(seg)) ** 2)
    out[k:k + step] = flt(seg[:k + step], fc, "low")[k:k + step]
music[i0:i1] = out * np.linspace(1, 0, len(seg)); music[i1:] = 0

def s_thud():
    t = tt(.35); f = 70 + 60 * np.exp(-t * 25)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12) + flt(rng.standard_normal(len(t)), 2500, "low") * np.exp(-t * 90) * .5) * .9
def s_sweep(d, up):
    t = tt(d); x = t / d; n = rng.standard_normal(len(t)); env = np.sin(np.pi * x) ** 1.5
    a = x if up else 1 - x
    return (flt(n, [250, 1400], "band") * (1 - a) + flt(n, [1400, 7000], "band") * a) * env * .45
def s_key():
    # crisp iOS-style key tick: very short bright click, almost no low end, slight per-key variation
    t = tt(.022); f = 3000 * (1 + .08 * (rng.random() - .5)); g = .85 + .3 * rng.random()
    click = flt(rng.standard_normal(len(t)), [2200, 7500], "band", 4) * np.exp(-t * 420)
    tick = np.sin(2 * np.pi * f * t) * np.exp(-t * 650) * .35
    body = np.sin(2 * np.pi * 650 * t) * np.exp(-t * 320) * .08
    x = (click * .9 + tick + body); x[:int(.0006 * SR)] *= np.linspace(0, 1, int(.0006 * SR))
    return x * .55 * g
def s_detent():
    # mechanical picker-wheel detent (synthesized, in the spirit of an iOS time picker): dry plastic "tk" — sharp noise transient,
    # two short woody resonances, a faint low knock; tiny random variation so a fast run doesn't sound like a buzz
    t = tt(.03); v = 1 + .06 * (rng.random() - .5)
    tr = flt(rng.standard_normal(len(t)), [1800, 7000], "band", 4) * np.exp(-t * 900)
    res = (np.sin(2 * np.pi * 1150 * v * t) * .55 + np.sin(2 * np.pi * 2900 * v * t) * .35) * np.exp(-t * 380)
    knock = np.sin(2 * np.pi * 210 * t) * np.exp(-t * 160) * .25
    x = tr * .8 + res + knock; x[:int(.0004 * SR)] *= np.linspace(0, 1, int(.0004 * SR))
    return x * .42
def s_cardhit():
    # a card slotting into the phone: deep, short, soft "thup" — pitch-dropping body + muffled slap, no high end
    t = tt(.22); f = 95 + 85 * np.exp(-t * 45)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22)
    slap = flt(rng.standard_normal(len(t)), [300, 1400], "band", 2) * np.exp(-t * 140) * .45
    x = body + slap; x[:int(.001 * SR)] *= np.linspace(0, 1, int(.001 * SR))
    return x * .75
def s_chirp(k=0):
    # light "received" chirp: two quick gliding sine blips (second a fifth up); k raises the pitch a step per card
    f0 = 1180 * 2 ** ([0, 2, 4, 5, 7][min(k, 4)] / 12); out = np.zeros(int(.16 * SR))
    for i, (fa, fb, t0) in enumerate(((f0 * .94, f0, 0), (f0 * 1.5 * .96, f0 * 1.5, .055))):
        t = tt(.07); f = fa + (fb - fa) * np.minimum(1, t / .02); x = np.sin(2 * np.pi * np.cumsum(f) / SR) + .18 * np.sin(4 * np.pi * np.cumsum(f) / SR)
        x *= np.minimum(1, t / .003) * np.exp(-t * 55); j = int(t0 * SR); out[j:j + len(x)] += x * (1 if i else .85)
    return out * .26
def s_shine():
    # app-icon light sweep: airy shimmer swells for .45 s, then a soft glassy sparkle rings out
    d = 1.4; t = tt(d); sw = .45
    env = np.where(t < sw, (t / sw) ** 2, np.exp(-(t - sw) * 6))
    shimmer = flt(rng.standard_normal(len(t)), [5500, 12000], "band", 2) * env * .10
    tb = np.maximum(0, t - sw); gate = (t >= sw) * np.minimum(1, tb / .004)
    bell = sum(a * np.sin(2 * np.pi * f * tb) * np.exp(-tb * r) for f, a, r in ((2093, .5, 4), (3136, .35, 5), (4186, .25, 6.5), (5274, .15, 8)))
    return shimmer + bell * gate * .2
def s_swell():
    # stream forming: soft tonal swell (no noise whoosh): two detuned sines gliding up a fifth, gentle attack, airy top
    d = .75; t = tt(d); f = 330 * 2 ** (7 / 12 * np.minimum(1, t / .55))
    ph = 2 * np.pi * np.cumsum(f) / SR; env = np.minimum(1, t / .25) * np.exp(-np.maximum(0, t - .35) * 5)
    return (np.sin(ph) + .6 * np.sin(ph * 1.005 * 2) + .25 * np.sin(ph * 3)) * env * .09
def s_form():
    # pill condenses into the app icon: soft low body + glassy tink
    t = tt(.6); body = np.sin(2 * np.pi * np.cumsum(140 + 60 * np.exp(-t * 30)) / SR) * np.exp(-t * 14) * .35
    tink = (np.sin(2 * np.pi * 1760 * t) + .4 * np.sin(2 * np.pi * 2640 * t)) * np.exp(-t * 9) * .12
    return (body + tink) * np.minimum(1, t / .003)
def s_stream():
    # long airy whoosh carrying the screenshot into the stream (character of the LangEase 9.3–10.7 s pass):
    # broadband noise through a band-pass whose centre glides up then settles, slow swell, long tail, faint sub push at the peak
    d = 1.7; t = tt(d); n = rng.standard_normal(len(t))
    pk = .85; env = np.where(t < pk, (t / pk) ** 2.2, np.exp(-(t - pk) * 3.2))
    out = np.zeros(len(t)); seg = 2048
    for i in range(0, len(t), seg):
        tc = t[min(i + seg // 2, len(t) - 1)]; fc = 500 + 3800 * np.sin(np.pi * min(1, tc / (pk * 1.25)) / 2) ** 2 * (1 if tc < pk * 1.25 else np.exp(-(tc - pk * 1.25) * 1.5))
        blk = n[max(0, i - 512): i + seg]; f = flt(blk, [max(80, fc * .45), min(15000, fc * 2.2)], "band", 2)[-len(n[i:i + seg]):]
        out[i:i + seg] = f
    air = flt(n, 6000, "high") * env * .25
    sub = np.sin(2 * np.pi * np.cumsum(55 + 25 * np.exp(-np.abs(t - pk) * 6)) / SR) * np.exp(-((t - pk) / .25) ** 2) * .35
    return (out * env * .55 + air + sub) * .8
def s_ding():
    t = tt(.6); s = np.sin(2 * np.pi * 1568 * t) + .5 * np.sin(2 * np.pi * 2352 * t) + .25 * np.sin(2 * np.pi * 3136 * t)
    return s * np.exp(-t * 7) * np.minimum(1, t / .002) * .22

def s_click(f=1800, v=.35):
    t = tt(.03); return (np.sin(2 * np.pi * f * t) * np.exp(-t * 180) + flt(rng.standard_normal(len(t)), 2000, "high") * np.exp(-t * 400) * .4) * v
def s_beep(d, f=880):
    d = max(.03, min(d, .14)); t = tt(d); env = np.minimum(1, t / .004) * np.minimum(1, (d - t) / .01)
    return lp(np.sign(np.sin(2 * np.pi * f * t)) * .5 + np.sin(2 * np.pi * f * t) * .5, 3500) * env * .32
def lp(x, f): return flt(x, f, "low")
def s_tone(d, f=880):
    t = tt(d); vib = 1 + .01 * np.sin(2 * np.pi * 9 * t); ph = 2 * np.pi * np.cumsum(f * vib) / SR
    env = np.minimum(1, t / .02) * np.minimum(1, (d - t) / .006) * (0.6 + 0.4 * t / d)
    return lp(np.sign(np.sin(ph)) * .45 + np.sin(ph) * .55, 4000) * env * .3
def s_pop(f0=500, f1=1100, d=.09, v=.3):
    t = tt(d); f = f0 + (f1 - f0) * t / d; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 40) * v
def s_shutter():
    t = tt(.18); n = rng.standard_normal(len(t))
    a = flt(n, [1500, 8000], "band") * np.exp(-((t - .01) ** 2) / .00003) ; b = flt(n, [800, 5000], "band") * np.exp(-((t - .09) ** 2) / .00004)
    return (a + .8 * b) * .5
def s_charge(d):
    t = tt(d); x = t / d; f = 180 + 520 * x ** 2
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * .5 + flt(rng.standard_normal(len(t)), 3000, "low") * .25) * x ** 2 * .35
def s_hit():
    t = tt(.6); body = np.sin(2 * np.pi * np.cumsum(60 + 80 * np.exp(-t * 20)) / SR) * np.exp(-t * 9)
    sh = sum(np.sin(2 * np.pi * f * t) for f in (1320, 1760, 2640)) * np.exp(-t * 5) * .08
    return body * .8 + sh

def s_bell(f, d=1.2, v=.22):
    t = tt(d); x = np.sin(2 * np.pi * f * t) + .45 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 3) + .18 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t * 5)
    return x * np.exp(-t * 3.2) * np.minimum(1, t / .003) * v
CHIME = [659.25, 783.99, 880.0, 1046.5, 1318.5]          # E5 G5 A5 C6 E6 — rising, resolves on the last word
def s_resolve():
    out = np.zeros(int(2.0 * SR))
    for k, f in enumerate((523.25, 659.25, 783.99, 1046.5)): out[int(k * .045 * SR):][:int(1.8 * SR)] += s_bell(f, 1.8, .14)[: len(out) - int(k * .045 * SR)]
    sp = flt(rng.standard_normal(len(out)), 6000, "high") * np.exp(-np.arange(len(out)) / SR * 4) * .04
    return out + sp

sfx = np.zeros(N)
for e in tl["events"]:
    ty, t = e["type"], e["t"]
    if ty == "thud": place(sfx, s_thud(), t)
    elif ty == "rise": place(sfx, s_sweep(.3, True), t)
    elif ty == "fall": place(sfx, s_sweep(.25, False), t, .8)
    elif ty == "key": place(sfx, s_key(), t)
    elif ty == "swell": place(sfx, s_swell(), t)
    elif ty == "stream": place(sfx, s_stream(), t)
    elif ty == "form": place(sfx, s_form(), t)
    elif ty == "chirp": place(sfx, s_chirp(e.get("k", 0)), t)
    elif ty == "shine": place(sfx, s_shine(), t)
    elif ty == "cardhit": place(sfx, s_cardhit(), t, e.get("g", 1.0))
    elif ty == "detent": place(sfx, s_detent(), t, e.get("g", 1.0))
    elif ty == "ding": place(sfx, s_ding(), t)
    elif ty == "chime": place(sfx, s_bell(CHIME[min(e.get("k", 0), 4)]), t)
    elif ty == "done": place(sfx, s_bell(1567.98, .9, .16), t); place(sfx, s_bell(2093.0, .9, .1), t + .07)
    elif ty == "resolve": place(sfx, s_resolve(), t)
    elif ty == "pause": place(sfx, s_click(900, .4), t)
    elif ty == "play": place(sfx, s_click(1700, .3), t)
    elif ty == "beep": place(sfx, s_beep(e.get("d", .1)), t + .01)
    elif ty == "tone": place(sfx, s_tone(e["d"]), t)
    elif ty == "alert": place(sfx, s_pop(700, 900, .07, .25), t)
    elif ty == "tap" or ty == "tick": place(sfx, s_click(1500 if ty == "tick" else 1200, .3), t)
    elif ty == "shutter": place(sfx, s_shutter(), t)
    elif ty == "charge": place(sfx, s_charge(.65), t)
    elif ty == "release" or ty == "dive" or ty == "whoosh": place(sfx, s_sweep(.35, True), t, .9)
    elif ty == "char": place(sfx, s_pop(300, 520, .08, .22), t)
    elif ty == "hit": place(sfx, s_hit(), t)
    elif ty == "fire": place(sfx, s_pop(700, 1700, .07, .3), t); place(sfx, s_click(2400, .25), t); place(sfx, s_sweep(.3, True), t + .02, .5)   # share arrow fires the stream
    elif ty == "pop": place(sfx, s_pop(260, 700, .14, .35), t)
    elif ty == "suck": place(sfx, s_sweep(.3, False), t, .8)
    elif ty == "eject": place(sfx, s_pop(600, 1300, .07, .25), t)
    elif ty == "swipe": place(sfx, s_sweep(.22, True), t, .35)
    elif ty == "typeStart":
        for j in range(60): place(sfx, s_key(), t + j * .055, .25)
    elif ty == "slide": place(sfx, s_sweep(.5, True), t, .12)
MUSIC = '--music' in sys.argv
voice = np.zeros(N)
VO_WAV = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--vo=")), None)
if VO_WAV and tl.get("vo"):
    import subprocess, tempfile, os
    sr0, raw = wavfile.read(VO_WAV); raw = raw.astype(np.float32) / 32768
    if raw.ndim > 1: raw = raw.mean(1)
    if sr0 != SR: raw = np.interp(np.arange(int(len(raw) * SR / sr0)) * sr0 / SR, np.arange(len(raw)), raw)
    for c in tl["vo"]:
        seg = raw[int(c["src0"] * SR): int(c["src1"] * SR)].copy()
        f = int(.008 * SR); seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
        if abs(c["rate"] - 1) > 1e-3:
            with tempfile.TemporaryDirectory() as d:
                a, b = os.path.join(d, "a.wav"), os.path.join(d, "b.wav")
                wavfile.write(a, SR, (seg * 32767).astype(np.int16))
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a, "-af", f"atempo={c['rate']}", b], check=True)
                seg = wavfile.read(b)[1].astype(np.float32) / 32768
        place(voice, seg, c["out0"])
mix = ((music * .5 if MUSIC else 0) + sfx * .55 + voice * 1.0)[: int(DUR * SR)]
mix /= np.max(np.abs(mix)) / .89
wavfile.write(sys.argv[2], SR, (np.stack([mix, np.roll(mix, 10)], 1) * 32767).astype(np.int16))
print("audio", round(DUR, 2), "s")
