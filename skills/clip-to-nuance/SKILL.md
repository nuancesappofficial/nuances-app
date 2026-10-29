---
name: clip-to-nuance
description: 自動化製作 Nuances Promo 短影音管線。原片壓成 9:16 雙語字幕、目標單字高亮；台詞講到目標單字時影片不暫停，Ghost 單字卡從底部升起把影片往上推、停留後落回；最後接冷啟動 Splash 與固定 CTA 結尾（含 promo 1 音效）；影片做完接著呼叫 clip-to-slides 做 IG 輪播圖。
---

# Clip to Nuance

把影視熱門片段做成 Nuances App 推廣短片。成片結構：**原片（含 Ghost 卡上推）→ 冷啟動 Splash → CTA**。不需要任何 App 實機錄影。

## 管線流程（7 步驟）

1. **取得來源、秒數、主題**
   - 影片網址、時間區間（例如 `00:20 ~ 00:47`）、主題名稱 `<topic>`。
   - 沒給 `<topic>` 就先問，問到才繼續。

2. **下載影音與字幕**
   - `yt-dlp` 下載指定區間影音與原生字幕（沒有就用本地 Whisper 轉錄）→ `promo-vids/<YYYY-MM-DD>/<topic>/<topic>.mp4`（16:9 原片，含音軌，不做任何加工）。
   - 同時保留 YouTube 自動字幕 `.vtt`（有字級時間，第 4 步要用）。
   - **下載完先停下來，請使用者打開 `<topic>.mp4` 檢查並自行修剪**，給出檔案路徑後等使用者回覆「好了」才繼續。
   - 使用者回覆後重新讀檔（修剪可能直接覆蓋原檔，也可能另存新檔——兩種都要找）：
     - 用 `ffprobe` 看新長度。
     - 把新片第一幀和下載時的原片比對，算出頭被剪掉幾秒；之後所有字幕時間與 trigger 都要減掉這個秒數。
     - 確認有音軌；沒有的話把下載時的音軌接回去（`-map 0:v -map 1:a -c:v copy -shortest`）。

3. **單字推薦與確認（強制互動）**
   - 從台詞挑 3 個有學習價值或細微語意的單字/短語推薦給使用者。
   - **停下來等使用者選定**，選定後才繼續。

4. **準備字幕與單字卡資料**
   - 字幕：雙語（英文 + 繁體中文）寫成 `subtitles.ass`（Style 名稱 `Eng` / `Chi`）或 `subs.json`（`[{"start","end","en","zh"}]`）。**不要先把字幕燒進影片**——字幕要跟著影片一起被推上去，由下一步一起渲染。
   - 單字卡：每個選定的字一張，寫進 `cards.json`（陣列），欄位對應 App 的 Ghost 卡正面：
     ```json
     [{"word":"stranger","ipa":"/ˈstreɪn.dʒɚ/","pos":"n.","definition":"陌生人；不認識的人",
       "sentence":"Jeez Mitchell, there's a stranger in our hot tub!","translation":"天啊 Mitchell，我們浴缸裡有個陌生人！",
       "trigger":2.46}]
     ```
   - `pos` 用 `n.` / `v.` / `adj.` / `phrase`…，會轉成 App 的中文標籤（名詞、動詞、片語…）。
   - **`trigger` 與 `sentence` 一律用該字在片中第一次被講出來的那句**。秒數取 `.vtt` 字級時間（`<00:00:23.080><c> stranger</c>`）減掉剪輯起點；可選 `"hold"` 覆寫該卡停留秒數；台詞裡的寫法跟 `word` 不同時（例如 word 是 `bring something to the table`、台詞是 `bringing something to the table`），加 `"match"` 指定要標色的原文。
   - 使用者若自己修剪過原片，先比對畫面確認剪的是頭還是尾，再換算 trigger。

5. **渲染 Part 1：Ghost 卡上推（影片不暫停）**
   ```bash
   python3 .agents/skills/clip-to-nuance/scripts/render_ghost_push.py \
     --source <topic>.mp4 --subs subtitles.ass --cards cards.json \
     [--hold 3] [--theme light|dark] [--type-speed 2] [--audio <有音軌的檔>] \
     --out <topic>-ghost.mp4
   ```
   - 先加 `--stills <秒數,...>` 輸出預覽 PNG（`--out` 改成資料夾）確認版面，再壓整支。
   - 卡片 UI 照抄 App 的 `CreateCardGhostPreviewSceneUI` 正面（預設 Light）：單字、音標 + 喇叭、詞性膠囊、釋義、分隔線、例句（目標字螢光底 + 底線）、翻譯。
   - 打字效果：App `ProgressiveText` 的跳字規則（每 50ms 一跳，依剩餘字數一次 1/2/3/6 字），**2 倍速、各段之間不停頓**，單字 → 釋義 → 例句 → 翻譯一口氣打完（一張卡約 1.3–1.6 秒）。
   - 停留：每張卡**打完後在畫面上停 3 秒**（`--hold`），然後下沉、影片落回。音訊全程不斷。
   - 多張卡：
     - 上一張還沒走、下一張就來 → 上一張縮到**左半邊**，新的一張出現在右半邊；上一張時間到淡出後，右邊那張放大回全寬。
     - 上一張剛走、下一張在 1.2 秒內就來 → 影片不落回，直接換卡。
     - 最後一張停到片尾還不夠時，就一路停到片尾（接 Splash）。
   - 腳本開頭會印出每張卡的出現 / 離開秒數。
   - 字幕中的目標單字全程以 Nuances 藍（`#4EAFF4`）標色。

6. **接 Splash + CTA + 音效，輸出成品**
   ```bash
   .agents/skills/clip-to-nuance/scripts/compose_final.sh <topic>-ghost.mp4 <topic>-final.mp4
   ```
   - 在專案根目錄執行。Part 1 結束後切到冷啟動 Splash（前 19 幀不透明），藍色面板擦除後透出 CTA。
   - CTA 固定用 `promo-vids/CTA-screens/CTA-nuances.mp4`（5.27 秒，不輪替）。
   - 音效照搬 promo 1（`scripts/sfx.py`，合成音、不用外部音檔）：Splash 前 0.15 秒 whoosh、Splash +0.1 pop、+0.6 swipe（擦除）、+1.6 shine（CTA icon 掃光）。音效峰值壓在 -8 dBFS。
   - 同時輸出 `<topic>-final.mp4` 與同名 `.mov`。

7. **接著做輪播圖（呼叫 `/clip-to-slides`）**
   - 影片交付後，直接用 Skill 工具呼叫 `clip-to-slides`，沿用同一個工作資料夾的 `<topic>.mp4` 與 `cards.json`，不用重新下載或選字。
   - 從 clip-to-slides 的第 2 步（寫封面 hook）開始，照它的流程走完；hook 一樣要停下來等使用者選定。
   - clip-to-slides 最後一步會把影片和輪播圖一起排進發文排程（promo-queue），這裡不用另外排。

## 版面規格（1080x1920、30fps、48kHz stereo）
- 背景：原片放大填滿 + 高斯模糊。
- 中段：16:9 原片（1080 寬，約 608 高）置中；字幕在影片下方 150px。
- 上推時：影片 + 字幕 + 卡片整組垂直置中（頂端最少留 70px）。卡片寬 968，App 尺寸 ×2.6；分割時每張寬 472（間距 24）。
- 推移曲線在 `render_ghost_push.py` 裡同時用於 ffmpeg 的 overlay y 表達式與 PIL 疊層（`ease()` / `ffmpeg_push_expr()`），要改就兩個一起改。

## 影片儲存與命名
全部放在 `promo-vids/<YYYY-MM-DD>/<topic>/`：
- 自動建立目錄；同日同名已存在時改用 `<topic>_02/`、`<topic>_03/`…
- 檔名：
  - 來源原片：`<topic>.mp4`
  - 字幕 / 單字卡資料：`subtitles.ass`（或 `subs.json`）、`cards.json`
  - Part 1（Ghost 上推）：`<topic>-ghost.mp4`
  - 最終成品：`<topic>-final.mp4`（及 `.mov`）

## 公用素材（`promo-vids/CTA-screens/`）
- `splash_transparent.mov`：冷啟動 1.6 秒透明轉場（ProRes 4444）。重新生成用 `scripts/generate_native_splash.swift`。
- `CTA-nuances.mp4`：固定 CTA = promo 1 的 CTA 底片（`promo-vids/2026-10-12-feature-promo/project/assets/cta1/` 第 193–350 幀：App icon + 掃光，文字都已擦掉）+ 標語「跟「懶得查」說bye bye!」+ App 名稱「Nuances: 英文單字卡」（64px，promo 1 是 44px）+ App Store / Google Play 徽章。
  - 換文字時重產（標語用 `|` 斷行）：
    ```bash
    cd .agents/skills/clip-to-nuance/scripts && python3 build_cta.py \
      <repo>/promo-vids/2026-10-12-feature-promo/project/assets/cta1 \
      <repo>/promo-vids/CTA-screens/CTA-nuances.mp4 "跟「懶得查」|說bye bye!" [--name "Nuances: 英文單字卡"]
    ```
  - 徽章 PNG 在 skill 的 `assets/`（`badge_appstore_zh-TW.png`、`badge_play_zh-TW.png`）。

## Skill 檔案
- `scripts/render_ghost_push.py`：第 5 步，Ghost 卡上推 + 字幕。
- `scripts/compose_final.sh`：第 6 步，接 Splash + CTA，呼叫 `sfx.py` 加音效。
- `scripts/build_cta.py`：換 CTA 文字時重產 `CTA-nuances.mp4`。
- `scripts/generate_native_splash.swift`：重產 Splash。
- `_legacy/`：舊版「暫停 + 截圖吸入」做法的腳本與素材，管線已不使用。
- 範例成品：`promo-vids/2026-10-07/modern_family/`（`cards.json`、`subtitles.ass`、`modern_family-final.mp4`）。

## 調用方式
- `/clip-to-nuance`
- 或直接給影片網址、秒數區間與主題（例如：`https://... 00:20 ~ 00:47 topic: modern_family`）。
