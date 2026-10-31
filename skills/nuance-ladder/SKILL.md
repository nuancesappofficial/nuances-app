---
name: nuance-ladder
description: 製作 Nuances「英文道地度升級」短影音。第一屏中文句子，接著 App 卡片詳情（有圖版）一張一張疊上來像發牌，5 級英文說法從 Lv.1 課本到 Lv.5 在地，頭像一張比一張更貼近句意（例如越來越累），每張落下配一聲噴漆音效，最後接冷啟動 Splash 與固定 CTA。當使用者要做「一句中文、英文越講越道地」的影片，或呼叫 /nuance-ladder 時使用。
---

# Nuance Ladder

成片結構：**中文句子頁 → 5 張卡片詳情疊成牌堆（課本 → 在地）→ 冷啟動 Splash → CTA**。不需要 App 實機錄影。

## 在地化
之後會依國家換語言重做（規則見 clip-to-nuance 的「在地化」一節）：所有會換語言的字（hook、副標、釋義、翻譯、CTA 標語）都放在資料檔（`slides.json` / `cards.json` 等），不手動改圖；跟語言無關的設定（畫面秒數、`focus`、`size`）換語言時沿用。

## 管線流程（7 步驟）

1. **取得中文句子與主題**
   - 中文句子（例如「我累爆了」）、主題名稱 `<topic>`。沒給 `<topic>` 就用句子的英文簡稱（`so-tired`）。
   - 工作資料夾：用 `python3 .agents/skills/promo-queue/scripts/postq.py new <分類> <topic> --title "中文標題"` 開（分類照用途選 promo / demo / in-app，還不確定就用 wip，之後 `postq.py move` 換分類；例如 `promo-vids/wip/001-so-tired/`），會自動拿該分類的下一個編號並記進點名表 `promo-vids/index.json`；不要自己 mkdir。

2. **寫 5 級英文說法（強制互動）**
   - 由淺到深：`課本` → `一般` → `口語` → `道地` → `在地`。
   - 每級都要是母語者真的會講的話；Lv.5 是特定地區或族群的講法，用 `note` 標出來（「英式」「美國南方」「澳洲」）。
   - 每級同時寫：釋義列 `meaning`、例句 `sentence` + 翻譯 `sentenceZh`、一句 `hook`（Insider Insight，灰字）、兩條拉桿分數。
   - 拉桿就是 App 的 `NuanceMetricsLeverUI`：`formal` =「隨意 ↔ 正式」（越後面越低）、`intensity` =「微弱 ↔ 強烈」（越後面越高），1–10。
   - **列給使用者看，停下來等確認或修改**，確認後才繼續。

3. **生頭像圖（交給 Antigravity）**
   - 用 `mcp__antigravity__run_task`（`project_dir: "nuances-app"`、`wait_seconds: 0`，之後 `get_task` 等），請它用生圖工具產 5 張 PNG 存到工作資料夾 `lv1.png`…`lv5.png`，不要改程式碼。
   - 要求：**同一個角色**（同臉、同髮型、同一件淺藍帽 T）、胸上半身置中、精緻柔和 3D 渲染（Pixar / Memoji 等級）、單色柔和背景、橫向約 1.4:1、無文字。用前一張當下一張的參考圖。
   - 狀態一張比一張更貼近句意，背景也從暖色漸漸變灰暗。範例（我累爆了）：精神微笑 → 有點累 → 眼皮下垂黑眼圈 → 被榨乾拿空咖啡杯 → 頭歪快睡著。
   - `get_task` 回 `failed` 也要去看檔案：它常常其實已經存好了。拼成一張縮圖檢查角色有沒有一致。
   - 圖片區 360×250，臉在上半部時 `imageY` 設 20–25（裁切的垂直位置，預設 30）。
   - 沒圖時省略 `image` 會用內建佔位頭像（程式畫的，只拿來先看節奏）。

4. **寫 `ladder.json`**（放在工作資料夾）
   ```json
   {"zh": "我累爆了", "levels": [
     {"tag": "課本", "en": "I am very tired.", "meaning": "最標準，但聽起來很生硬",
      "sentence": "I am very tired after work.", "sentenceZh": "我下班後非常累。",
      "formal": 8, "intensity": 3, "hook": "文法完全正確，但母語者日常很少把 I am 拆開講。",
      "image": "lv1.png", "imageY": 22},
     ...
     {"tag": "在地", "en": "I'm absolutely knackered, mate.", "note": "英式", ...}]}
   ```
   - 例句裡標色的字預設是 `en`（去掉句尾標點）；寫法不同時加 `"match"`。
   - 範例：`promo-vids/wip/001-so-tired/ladder.json`。

5. **渲染 Part 1**
   ```bash
   python3 .agents/skills/nuance-ladder/scripts/render_ladder.py \
     --ladder ladder.json --sfx promo-vids/sounds/jsr_sprays.m4a --out <topic>-ladder.mp4
   ```
   - 先加 `--stills 1,4.5,12.4` 輸出預覽 PNG（`--out` 改成資料夾），確認字沒被擠掉（內容太長時 Insider Insight 會自動減行或藏起來）。
   - 節奏：中文頁 `--intro 1.6` 秒 → 每 `--step 2.6` 秒飛進一張 → 最後一張停 `--tail 2.8` 秒（總長約 14.8 秒）。要自訂每張的時間就在該級填 `"at"`。
   - 音效：`--sfx` 的音檔會自動切成一聲一聲，第 k 張卡飛進來時放第 k 聲（`--sfx-offset` 調延遲、`--sfx-gain` 調音量；`--sfx <檔> --detect` 看切出幾聲）。不給 `--sfx` 就是無聲片。
   - `promo-vids/sounds/jsr_sprays.m4a`：Jet Set Radio 噴漆音效合集（YouTube `So3D5JdnRk8`），11 聲。

6. **接 Splash + CTA + 音效**
   ```bash
   .agents/skills/clip-to-nuance/scripts/compose_final.sh <topic>-ladder.mp4 <topic>-final.mp4
   ```
   - 在專案根目錄執行，跟 clip-to-nuance 共用腳本與 `promo-vids/CTA-screens/` 素材。

7. **排進發文（promo-queue）**
   - 在工作資料夾寫 `caption-reel.txt`：第一行 hook（例如「『我累爆了』英文只會說 I'm very tired？」），接著列出 5 級說法（Lv.1–Lv.5），一行「看劇聽到不懂的字，用 Nuances 一鍵存成單字卡 📲」，最後 5–8 個 hashtag。
   ```bash
   python3 .agents/skills/promo-queue/scripts/postq.py add promo-vids/<分類>/<編號>-<topic> --hook-reel <hook 句型>
   ```
   - 只有影片，所以只排一篇；印出來的時間轉告使用者。

## 畫面規格（1080x1920、30fps）
- 卡片 `assets/ladder.html` 的數值**照 App 原始碼**，App 卡片改版時要一起改：
  - `CardDetailFlow.tsx`：`detailPaper`（白底、圓角 30、1px `rgba(0,0,0,.06)` 邊、陰影 0/24/30 12%）、`heroMedia` 高 250、`referenceWord`（粗 900、字距 -1.2、長度 >18/15/12 字 → 30/34/40，其他 52）、`referenceMeaning` 20/28 粗 700。
  - `CardDetailCarouselCardUI.tsx`：淺色 `ui` 色票、`ipaRow`、例句 20/28 粗 600、目標字藍底底線、Insider Insight 灰字 `#8A8E97`、`practiceButton` + 分享 / 愛心 / 資料夾。
  - App 沒指定字型 → iOS 系統字（SF Pro + PingFang TC）。
- 卡片 360×660 CSS × 2.3 倍；陰影在 PIL 補（App 陰影 + 一層貼身淡陰影做出厚度）。
- 標題列：中文句子 + 「Lv.n · 標籤」藍色膠囊 + 5 格進度條（App 複習頁的分段條樣式）。
- 牌堆：新卡從下方帶一點旋轉飛上來、落定微回彈；舊卡每退一層往上露 30px、縮 5%、變暗 7%，最多露 3 層。

## Skill 檔案
- `scripts/render_ladder.py`：Chrome headless 截圖（中文頁、標題列、每張卡透明 PNG）→ PIL 疊牌 → ffmpeg。
- `assets/ladder.html`：畫面模板（`?mode=intro | header&i= | card&i=`）。
- `assets/Ionicons.ttf`：App 用的圖示字型。

## 調用方式
- `/nuance-ladder`
- 或直接給句子：「我累爆了 topic: so-tired」
