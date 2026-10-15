"""Deterministic frame renderer: loads a scene HTML, awaits window.prepareFrame(t) if present (image sequences), calls window.renderFrame(t) per frame, pipes to ffmpeg.

usage: python3 render.py scenes/s1.html out/s1.mp4 --fps 30 --scale 0.5 [--locale ja] [--textless]
       python3 render.py scenes/s1.html out/stills --stills 0,6,7.5
"""
import argparse, json, pathlib, subprocess, sys
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("scene"); ap.add_argument("out")
ap.add_argument("--fps", type=int, default=30)
ap.add_argument("--scale", type=float, default=0.5)
ap.add_argument("--stills", default="")
ap.add_argument("--timeline", default="")
ap.add_argument("--locale", default="zh-TW")
ap.add_argument("--textless", action="store_true")
ap.add_argument("--query", default="", help="extra query, e.g. part=s3b")
a = ap.parse_args()

scene = pathlib.Path(a.scene).resolve()
with sync_playwright() as p:
    b = p.chromium.launch(args=["--font-render-hinting=none", "--disable-lcd-text"])
    pg = b.new_page(viewport={"width": 1080, "height": 1920}, device_scale_factor=a.scale)
    pg.goto(scene.as_uri() + f"?locale={a.locale}" + ("&textless=1" if a.textless else "") + ("&" + a.query if a.query else "")); pg.wait_for_function("window.TIMELINE !== undefined")
    pg.evaluate("document.fonts.ready")
    tl = pg.evaluate("window.TIMELINE")
    if a.timeline:
        pathlib.Path(a.timeline).write_text(json.dumps(tl, indent=1))
    if a.stills:
        out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
        for s in a.stills.split(","):
            pg.evaluate(f"(async () => {{ if (window.prepareFrame) await window.prepareFrame({float(s)}); window.renderFrame({float(s)}); }})()")
            pg.screenshot(path=str(out / f"t{float(s):06.2f}.png"))
        print("duration", tl["duration"]); sys.exit()
    n = int(round(tl["duration"] * a.fps))
    w, h = int(1080 * a.scale), int(1920 * a.scale)
    ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(a.fps), "-i", "-",
                           "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                           "-vf", f"scale={w}:{h}", a.out], stdin=subprocess.PIPE)
    for i in range(n):
        pg.evaluate(f"(async () => {{ if (window.prepareFrame) await window.prepareFrame({i / a.fps}); window.renderFrame({i / a.fps}); }})()")
        ff.stdin.write(pg.screenshot(type="jpeg", quality=95))
        if i % 60 == 0: print(f"{i}/{n}", flush=True)
    ff.stdin.close(); ff.wait()
    print("done", n, "frames", tl["duration"], "s")
