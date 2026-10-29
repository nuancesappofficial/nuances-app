---
name: clip-to-slides
description: 把 clip-to-nuance 做好的影視片段變成 IG 輪播圖（暗色海報風，4:5 1080x1350）：封面一句「打破你以為的」hook → 每個目標單字一頁（劇照 + 台詞 + 單字解釋）→ CTA。當使用者要把片段做成圖文輪播、slideshow、carousel，或呼叫 /clip-to-slides 時使用。
---

# Clip to Slides

成品結構：**封面 hook → 單字頁 ×3–5（一字一頁）→ CTA**，全部 1080x1350 PNG。素材直接吃 clip-to-nuance 的工作資料夾，不用重新下載。

## 管線流程（5 步驟）

1. **找到工作資料夾**
   - `promo-vids/<YYYY-MM-DD>/<topic>/`，裡面要有 `<topic>.mp4` 和 `cards.json`（clip-to-nuance 第 4 步產的）。
   - 還沒有就先跑 `/clip-to-nuance` 第 1–4 步（下載、修剪、選字、寫 `cards.json`），做完再回來。
   - 單字頁數 = `cards.json` 的張數，要 3–5 個。

2. **寫封面 hook（強制互動）**
   - 句型固定用「**打破你以為的**」：中文意思 + 台灣人直覺會講的錯誤 / 中式英文，答案（正確說法）留到內頁才揭曉。
     - 範例：「大驚小怪」英文可不是 too surprised（答案在內頁：overreacting）。
   - 規則：中文最多 22 字、3 行內（用 `|` 斷行）；只標 1 個藍色重點（`[文字]`），通常標那個錯誤說法；**不說出答案**；錯誤說法要真的是台灣學習者常見的講法。
   - 同時寫一行副標 `sub`（例如「《摩登家庭》30 秒，3 個母語者天天在用的字」）和小標 `kicker`（預設「看影集學英文」）。
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
    "cover": {"time": 8, "focus": "63% 30%", "kicker": "看影集學英文",
              "hook": "「大驚小怪」|英文可不是|[too surprised]", "sub": "《摩登家庭》30 秒，3 個母語者天天在用的字"},
    "words": {"stranger": {"time": 2.6, "focus": "40% 50%"}},
    "cta": {"headline": "看劇聽到不懂的字|一鍵存成[單字卡]", "sub": "跟「懶得查」說 bye bye！"}}
   ```
   - `words` / `cta` 都選填；`cta` 預設跟影片版 CTA 同一套文案（`render_slides.py` 的 `CTA_DEFAULT`）。
   ```bash
   python3 .agents/skills/clip-to-slides/scripts/render_slides.py --slides slides.json
   ```
   - 輸出 `slides/slide_01.png`…，和一張總覽 `<topic>-slides-strip.jpg`。
   - **讀總覽圖自己檢查**：封面臉有沒有被裁掉、例句標色有沒有標到、字有沒有被擠小。文字太長時模板會自動縮字（最多縮到 60%），縮太多就改短文案。

5. **交付**
   - 把總覽圖傳給使用者，附上 `slides/` 路徑。
   - 同時寫 `caption.txt`：第一行重複 hook（不給答案）、列出 3–5 個單字（英文 + 中文）、一行「下載 Nuances，看劇順手存單字」、5–8 個中文 / 英文 hashtag（劇名、#學英文、#英文單字…）。

## 版面規格（照 `assets/slides.html`）
- 1080x1350、底色 `#0E0F12`、強調色 Nuances 藍 `#4EAFF4`；左右邊距 64。
- 頂列：左邊系列字（封面 = `show`、單字頁 = `WORD 01`、CTA = `NUANCES`），右邊頁碼 `n / 總頁數`。底列：App icon + `Nuances`，右邊「往右滑 →」（封面）或 `→`。
- 封面：劇照滿版 + 底部暗色漸層；藍底小標、104px 粗 900 大標、36px 副標。
- 單字頁：上方 780px 劇照漸層融進黑底；下方依序是藍色引號、英文台詞（目標字藍底標色，`match` 規則同 clip-to-nuance）、中文翻譯、分隔線、92px 單字 + 音標、詞性外框膠囊 + 中文釋義。
- CTA：封面劇照模糊壓暗當底，App icon、標語（`|` 斷行、`[ ]` 標藍）、副標、App Store / Google Play 徽章、App 名稱。
- 字型：Noto Sans TC（900）+ Inter，渲染時從 Google Fonts 載入，**需要網路**；離線會退回 PingFang TC（變細，不能用）。

## Skill 檔案
- `scripts/render_slides.py`：抓畫面（ffmpeg）→ 寫 `data.js` → Chrome headless 逐頁截圖 → 總覽圖；`--contact` 出挑封面用的總覽。
- `assets/slides.html`：三種頁面的模板（`?i=0` 封面、`1..n` 單字頁、最後一頁 CTA）。
- `assets/icon.png`、`assets/badge_*.png`：App icon 與商店徽章（跟 clip-to-nuance 同一套）。
- 範例：`promo-vids/2026-10-07/modern_family/`（`slides.json`、`slides/`、`modern_family-slides-strip.jpg`）。

## 調用方式
- `/clip-to-slides`
- 或「把 modern_family 做成輪播圖」。
