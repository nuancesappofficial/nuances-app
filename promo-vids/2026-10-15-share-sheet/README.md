# Share-sheet showcase (2026-10-15)

Standalone clips showing Nuances in the system share sheet. New project, separate from 2026-10-12-feature-promo.

- `android.html` — Android clip (Samsung One UI-style, generic, no brand marks). Copy in `STR`, timing in `T`, taps in `TAPS`.
- `android_share_v1.mp4` — approved preview (7.2 s, 540×960 @30fps).
- `ios.html` — iOS clip (iOS 26-style: dark screenshot editor, glass share sheet with Nuances first, liquid-glass notification 「收到 🫡」 at the top).
- `ios_share_v1.mp4` — iOS preview (7.85 s, 540×960 @30fps).
- `render.py`, `audio2.py` — copies of the renderer / SFX synth (needs Playwright + ffmpeg).

Render:
    python3 render.py android.html out.mp4 --fps 30 --scale 0.5 --timeline tl.json
    python3 audio2.py tl.json a.wav
    ffmpeg -i out.mp4 -i a.wav -c:v copy -c:a aac -shortest android_share_v1.mp4
Final quality: --fps 60 --scale 1

Render iOS: same commands with ios.html.
