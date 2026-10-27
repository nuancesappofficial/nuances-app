#!/bin/bash
# Part 1（Ghost 上推成品）→ 冷啟動 Splash → 固定 CTA，加上 promo 1 的 Splash / CTA 音效，輸出 <topic>-final.mp4 / .mov
# usage（在 nuances-app 專案根目錄執行）: compose_final.sh <part1.mp4> <out-final.mp4>
set -e

PART1="$1"
OUT="$2"

if [ -z "$PART1" ] || [ -z "$OUT" ]; then
    echo "Usage: compose_final.sh <part1.mp4> <out-final.mp4>"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# skill 目錄是 symlink 到 repo 外，所以用目前工作目錄找專案根目錄
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
CTA="$PROJECT_ROOT/promo-vids/CTA-screens/CTA-nuances.mp4"
SPLASH="$PROJECT_ROOT/promo-vids/CTA-screens/splash_transparent.mov"
[ -f "$CTA" ] || { echo "找不到 $CTA（用 scripts/build_cta.py 產生）"; exit 1; }
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

P1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$PART1")
CTA_SEC=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$CTA")
TOTAL=$(python3 -c "print($P1 + $CTA_SEC)")

# promo 1 的時間：whoosh 在 splash 前 0.15 秒、pop +0.1、swipe +0.6（splash 擦除）、shine +1.6（CTA icon 掃光）
python3 "$SCRIPT_DIR/sfx.py" "$WORK_DIR/sfx.wav" "$TOTAL" \
  "whoosh@$(python3 -c "print($P1 - 0.15)")" "pop@$(python3 -c "print($P1 + 0.1)")" \
  "swipe@$(python3 -c "print($P1 + 0.6)")" "shine@$(python3 -c "print($P1 + 1.6)")"

# splash 前 19 幀全不透明、之後擦除透出 CTA，所以直接疊在 CTA 開頭
ffmpeg -v error -y -i "$PART1" -i "$CTA" -i "$SPLASH" -f lavfi -t "$CTA_SEC" -i anullsrc=r=48000:cl=stereo -i "$WORK_DIR/sfx.wav" \
  -filter_complex "[0:v]fps=30,setsar=1,format=yuv420p[p1v];[0:a]aresample=48000,aformat=channel_layouts=stereo[p1a];
                   [1:v]fps=30,scale=1080:1920,setsar=1[cta];[cta][2:v]overlay=0:0:eof_action=pass,format=yuv420p[ctav];
                   [p1v][p1a][ctav][3:a]concat=n=2:v=1:a=1[v][bed];
                   [4:a]aresample=48000,aformat=channel_layouts=stereo[fx];[bed][fx]amix=inputs=2:duration=first:normalize=0[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k "$OUT"

cp "$OUT" "${OUT%.mp4}.mov"
echo "=== 完成：$OUT（及 .mov）==="
