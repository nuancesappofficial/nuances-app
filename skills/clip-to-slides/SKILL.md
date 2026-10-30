---
name: clip-to-slides
description: 把 clip-to-nuance 做好的影視片段變成輪播圖（小報海報風，一次輸出 4:5 / 3:4 / 9:16 三種尺寸和一支 9:16 輪播影片，給不同平台用）：封面一句「打破你以為的」hook → 每個目標單字一頁（劇照 + 台詞 + 單字解釋）→ CTA。當使用者要把片段做成圖文輪播、slideshow、carousel，或呼叫 /clip-to-slides 時使用。
---

# Clip to Slides

成品結構：**封面 hook → 單字頁 ×3–5（一字一頁）→ CTA**，一次輸出各平台要的版本（見下面「輸出」）。素材直接吃 clip-to-nuance 的工作資料夾，不用重新下載。

## 管線流程（6 步驟）

1. **找到工作資料夾**
   - `promo-vids/<YYYY-MM-DD>/<topic>/`，裡面要有 `<topic>.mp4` 和 `cards.json`（clip-to-nuance 第 4 步產的）。
   - 還沒有就先跑 `/clip-to-nuance` 第 1–4 步（下載、修剪、選字、寫 `cards.json`），做完再回來。
   - 從 clip-to-nuance 第 7 步自動進來時，資料夾就是剛做完影片的那個，直接跳到第 2 步。
   - 單字頁數 = `cards.json` 的張數，要 3–5 個。

2. **寫封面 hook（強制互動）**
   - 句型固定用「**打破你以為的**」：中文意思 + 台灣人直覺會講的錯誤 / 中式英文，答案（正確說法）留到內頁才揭曉。
     - 範例：「大驚小怪」英文可不是 too surprised（答案在內頁：overreacting）。
   - 規則：中文最多 22 字、3 行內（用 `|` 斷行）；錯誤說法單獨放一行寫成 `[too surprised]`，封面會用藍線把它劃掉；**不說出答案**；錯誤說法要真的是台灣學習者常見的講法。
   - 同時寫一行副標 `sub`（例如「《摩登家庭》30 秒，3 個母語者天天在用的字」）。
   - **一次給 3 個 hook（針對不同單字），停下來等使用者選定或修改**，選定才繼續。

3. **挑封面畫面**
   ```bash
   python3 .agents/skills/clip-to-slides/scripts/render_slides.py --source <topic>.mp4 --contact contact.jpg [--every 1.5]
   ```
   - 讀 `contact.jpg`（每格左上角是秒數），挑表情最誇張、臉最清楚的一格當封面 `time`。
   - 4:5 只裁得到原片中間約 45% 寬，用 `focus`（CSS `background-position`，例如 `"63% 30%"`）把臉移進畫面；主角在左就調小第一個數字。
   - 單字頁預設用 `cards.json` 的 `trigger` 秒數；那一格嘴型怪或沒人臉時，在 `words` 裡覆寫 `time` / `focus`。

4. **寫 `slides.json` 並渲染**（放在工作資料夾）
   ```json
   {"source": "modern_family.mp4", "cards": "cards.json", "show": "MODERN FAMILY",
    "cover": {"time": 8, "focus": "63% 30%",
              "hook": "「大驚小怪」|英文可不是|[too surprised]", "sub": "《摩登家庭》30 秒，3 個母語者天天在用的字"},
    "words": {"stranger": {"time": 2.6, "focus": "40% 50%"}},
    "cta": {"headline": "跟「懶得查」|[說 bye bye！]"}}
   ```
   - `words` / `cta` 都選填；`cta` 預設是 App slogan「跟「懶得查」說 bye bye！」、沒有副標（`render_slides.py` 的 `CTA_DEFAULT`），通常不用改。
   ```bash
   python3 .agents/skills/clip-to-slides/scripts/render_slides.py --slides slides.json
   ```
   - 輸出（約 20 秒）：
     | 檔案 | 尺寸 | 給誰 |
     |---|---|---|
     | `slides/slide_01.png`… | 4:5 1080x1350 | IG、Threads、Dcard、X（前 4 張） |
     | `slides-3x4/` | 3:4 1080x1440 | 小紅書圖文 |
     | `slides-9x16/` | 9:16 1080x1920 | TikTok 圖文、抖音、LINE VOOM |
     | `<topic>-slideshow.mp4` | 9:16 影片，約 15 秒 | FB Reels、TikTok、YouTube Shorts（只收影片的平台） |
     | `<topic>-slides-strip.jpg` | 4:5 總覽 | 自己檢查用 |
   - `--sizes 4x5` 只出某些尺寸、`--no-video` 不做影片。哪個平台用哪個版本由 promo-queue 自動挑。
   - **讀總覽圖自己檢查**：封面臉有沒有被裁掉、例句標色有沒有標到、字有沒有被擠小。文字太長時模板會自動縮字（最多縮到 60%），縮太多就改短文案。

5. **交付**
   - 把總覽圖傳給使用者，附上 `slides/` 路徑。
   - 同時寫 `caption.txt`：第一行重複 hook（不給答案）、列出 3–5 個單字（英文 + 中文）、一行「看劇聽到不懂的字，用 Nuances 一鍵存成單字卡 📲」、5–8 個中文 / 英文 hashtag（劇名、#學英文、#英文單字…）。
   - 資料夾裡有 `<topic>-final.mp4`（從 clip-to-nuance 接過來）時，也寫影片用的 `caption-reel.txt`：格式一樣，但第一行換一句不同的 hook（用劇情懸念，例如「浴缸裡泡著一個陌生人，他們第一個念頭竟然是…打招呼？」）。

6. **排進發文（promo-queue）**
   ```bash
   python3 .agents/skills/promo-queue/scripts/postq.py add promo-vids/<YYYY-MM-DD>/<topic> --hook-reel <影片 hook 句型，例如 劇情懸念>
   ```
   - 影片和輪播圖各排一篇，自動接在排程最後面；印出來的時間轉告使用者。
   - 規則、看板、改順序見 promo-queue skill。

## 版面規格（照 `assets/slides.html`，小報海報風）
- 寬 1080，高 1350 / 1440 / 1920（模板 `?h=`）、底色 `#0B0B0C`、字色暖白 `#F3EFE7`、強調色 Nuances 藍 `#4EAFF4`；左右邊距 72；整頁疊一層細顆粒。
- 字型：英文大字 Anton（單字頁全大寫）、中文 Noto Sans TC 700、音標 Noto Serif 斜體、頂列 JetBrains Mono。渲染時從 Google Fonts 載入，**需要網路**；離線會退回系統字（不能用）。
- 頂列：左邊劇名（CTA = `NUANCES`），右邊頁碼 `01 / 05`。沒有底列。
- 封面：劇照滿版 + 底部暗色漸層。`hook` 第一行 = 132px 大標；整行只有 `[錯誤說法]` 的那行 = 150px 英文斜體 + 藍線劃掉；其他行 = 52px 灰字。下面一條細線，左 `sub`、右「答案往右滑 →」。不用 `kicker`。
- 單字頁：上方 56% 劇照漸層融進黑底；台詞做成片中字幕（置中白字 + 陰影，目標字藍色，`match` 規則同 clip-to-nuance），下面一行中文翻譯；下方 `NO.01 + 詞性`、170px 單字（太長自動縮成一行）、音標、細線、中文釋義。
- CTA：品牌深藍底，最後 3 個單字做成附劇照的單字卡疊在上方（卡片字體照 App：SF Pro 900 + PingFang TC，灰色詞性膠囊），下面 slogan（`|` 斷行、`[ ]` 標藍，可用 `{n}` = 單字數；有 `sub` 才顯示副標）、App Store / Google Play 徽章。

- 9:16 有安全區：TikTok / Reels / Shorts 的介面會蓋住上方約 150px、右側約 180px、下方約 300px，所以 9:16 的頂列、文字區、底列都往內縮（模板的 `.tall` 規則）。
- 輪播影片：封面停 3 秒、每個單字頁 2.8 秒、CTA 3.2 秒，左滑換頁 0.35 秒，換頁配 clip-to-nuance `sfx.py` 的 swipe 音效、CTA 配 shine。

## Skill 檔案
- `scripts/render_slides.py`：抓畫面（ffmpeg）→ 寫 `data.js` → Chrome headless 逐頁截圖 → 總覽圖；`--contact` 出挑封面用的總覽。
- `assets/slides.html`：三種頁面的模板（`?i=0` 封面、`1..n` 單字頁、最後一頁 CTA）。
- `assets/icon.png`、`assets/badge_*.png`：App icon 與商店徽章（跟 clip-to-nuance 同一套）。
- 範例：`promo-vids/2026-10-07/modern_family/`（`slides.json`、`slides/`、`modern_family-slides-strip.jpg`）。

## 調用方式
- `/clip-to-slides`
- 或「把 modern_family 做成輪播圖」。
