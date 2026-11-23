#!/bin/bash
# 換語言：改 subs.json / cards.json / slides.json / caption*.txt 和下面的 TITLE，再跑這支
set -e
cd "$(dirname "$0")"; ROOT=$(git rev-parse --show-toplevel); SK=$ROOT/.agents/skills
TITLE="黃仁勳復任 NVIDIA 執行長|董事會聲明 Part 2/2"; TITLE_SUB="NBC News"
python3 $SK/clip-to-nuance/scripts/render_ghost_push.py --source huang-ceo-return-2.mp4 --subs subs.json --cards cards.json --title "$TITLE" --title-sub "$TITLE_SUB" "$@" --out ${OUT:-huang-ceo-return-2-ghost.mp4}
[ -n "$OUT" ] && exit 0
(cd "$ROOT" && $SK/clip-to-nuance/scripts/compose_final.sh promo-vids/news/007-huang-ceo-return-2/huang-ceo-return-2-ghost.mp4 promo-vids/news/007-huang-ceo-return-2/huang-ceo-return-2-final.mp4)
