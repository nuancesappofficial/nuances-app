---
name: promo-queue
description: Nuances 推廣貼文的排程、自動發文與成效追蹤。排程（queue.json，存在 Supabase）記錄排隊中 / 已發布的貼文，依國家（channel）分帳號，GitHub Actions 時間到自動發到 Instagram、Threads、Facebook 粉專、TikTok、YouTube Shorts（小紅書等沒有 API 的平台列成待手動發布），發文後第 3、7 天自動抓成效數字並比較哪種格式 / hook / 劇名比較好，看板在 promo-vids/dashboard.html。當 clip-to-nuance / clip-to-slides / nuance-ladder 做完要排進發文、使用者問「下一篇是什麼」「哪些發過了」「發文狀況」「哪支表現好」「下一支該做哪種」、要改發文順序或時段、要加國家或平台、要重發失敗的貼文，或呼叫 /promo-queue 時使用。
---

# Promo Queue

**排程 `queue.json` 是唯一的紀錄**（存在 Supabase 私人 bucket `promo-private`，不在本機）：哪些貼文已發布、下一篇是什麼都以它為準，回答使用者前先跑 `list`。不要憑記憶說「已經發過了」。

指令都在專案根目錄跑，`Q=.agents/skills/promo-queue/scripts/postq.py`：

| 要做的事 | 指令 |
|---|---|
| 做完一支片段，排進發文 | `python3 $Q add promo-vids/<日期>/<topic>` |
| 看排程 | `python3 $Q list` |
| 給使用者看看板 | 開 `promo-vids/dashboard.html`（打開時從雲端讀即時資料，每分鐘更新；檔案不見了跑 `python3 $Q dashboard`） |
| 確認會發什麼、不真的發 | `python3 $Q post-due --dry-run` / `python3 $Q post <id> --dry-run` |
| 手動平台發完了 | `python3 $Q done <id> --platform xiaohongshu [--url …]` |
| 國家 / 帳號組 | `python3 $Q channel`（列出）、`channel add jp --name 日本 --tz Asia/Tokyo --lang ja`、`channel set tw --slots 12:30,20:00 --reel instagram,facebook,xiaohongshu` |
| 跳過某篇 | `python3 $Q skip <id>` |
| 看成效 | `python3 $Q metrics`（`--now` 不管天數立刻抓一次） |
| 重發失敗的平台 | `python3 $Q retry <id> [--platform threads]` |
| 刪掉或改順序後重排時段 | `python3 $Q reschedule` |

`<id>` 可以只打結尾，例如 `modern_family-reel`。

## 排進發文（add）

1. 資料夾裡要有：
   - 影片：`*-final.mp4` + 文案 `caption-reel.txt`（沒有時會用 `caption.txt`）
   - 輪播圖：`slides/slide_*.png` + 文案 `caption.txt`
2. 兩個都有就排兩篇（影片、輪播圖），各占一個時段；`--channel jp` 排到別的國家（預設第一個，tw），內容語言要跟那個國家一致；`--only reel|carousel` 只排一種，`--at "2026-11-02 20:00"` 指定時間。
   - 標籤（拿來比成效）：`--hook-reel <句型>`（例如 `劇情懸念`）、`--hook-carousel <句型>`（預設 `打破你以為的`）、`--show <劇名>`（預設讀 `slides.json`）。格式自動判斷：輪播圖 / Ghost 卡影片 / nuance-ladder。
3. 文案寫法：
   - 第一行是 hook（不給答案），接著列出單字（英文｜中文），一行 CTA「看劇聽到不懂的字，用 Nuances 一鍵存成單字卡 📲」，最後 5–8 個 hashtag。
   - 影片的 hook 跟輪播圖不同句，避免同一個主題連兩天講一樣的話。
   - Threads 上限 500 字、只留第一個 hashtag；YouTube 標題取第一行；這些腳本會自動處理。
4. 範例：`promo-vids/2026-10-07/modern_family/`（`caption.txt`、`caption-reel.txt`）。

## 國家（channel）
- 每個國家一組：自己的帳號 token、時區、發文時段（當地時間）、內容語言、影片 / 輪播圖各發哪些平台。存在 queue 的 `channels`，金鑰在雲端 `secrets.json` 的 `channels.<代號>`。
- 第一站是 `tw`（台灣，zh-Hant）。加國家：使用者跑 `setup_wizard.sh` 選新的代號（例如 `hk`、`jp`），精靈會建 channel 並授權那個國家的帳號；同一個 Meta / TikTok / Google App 可以管多國帳號，不用重建。
- 排程、補發間隔、成效評等（中位數）、看板都**依國家分開**；不同國家的數字不互相比。
- TikTok 帳號的地區在註冊時決定，提醒使用者用當地門號或當地網路註冊。

## 平台
| 平台 | 方式 | 影片 | 輪播圖 |
|---|---|---|---|
| Instagram | API（走 Facebook 登入：IG 要連到同國家的 FB 粉專，用粉專權杖，不會過期；`secrets` 裡 `via: facebook`） | Reels | 輪播 |
| Threads | API | 影片 | 輪播 |
| Facebook 粉專 | API | Reels（90 秒內、30 篇 / 24 小時） | 改發 9:16 輪播影片（FB 多圖會排成拼貼，不能滑） |
| TikTok | API | 影片 | 改發 9:16 輪播影片（API 圖文要驗證網域） |
| YouTube | API | Shorts | 改發 9:16 輪播影片 |
| 小紅書 | 手動 | ✓ | 3:4 圖（標題 20 字內，看板會給建議標題） |
| 抖音、LINE VOOM | 手動 | ✓ | 9:16 圖 |
| X | 手動 | ✓ | 4:5 前 4 張（一篇最多 4 張）；文案自動縮到 280（中文算 2） |
| Dcard、Naver Blog | 手動 | ✓ | 4:5 圖 |
| Bilibili | 手動 | ✓ | 輪播影片 |

- 哪個平台用哪個版本寫在 `postq.py` 的 `VARIANT`；版本來自 clip-to-slides 的輸出，`add` 時全部一起上傳。缺版本（舊資料夾沒有 3:4 / 9:16 / 輪播影片）的平台會略過並註明，重跑 clip-to-slides 再 `retry`。
- 輪播圖改發影片的平台，狀態裡會記 `as: reel`，成效照影片算，但跟「影片」那類貼文分開比。

- 手動平台（`platforms.py` 的 `MANUAL`）：時間到時狀態變「待手動」（不擋後面的排程），看板最上方「待手動發布」列出素材連結、可直接複製的文案和 `done` 指令。使用者說發好了，就幫他跑 `done`。
- 加平台到某國：`channel set <代號> --reel …,… --carousel …,…`（完整清單，會覆蓋）。

## 自動發文怎麼運作
- **全部在雲端，Mac 關機也會發**：
  - `add` 時（在 Mac 上）就把影片 / 圖片 / 縮圖傳到 Supabase 公開 bucket `promo-media`，文案也存進排程，之後不需要本機檔案。
  - GitHub Actions（`.github/workflows/promo-queue.yml`）每小時第 3 分跑 `post-due`：讀 Supabase 的 queue 和金鑰 → 發文 → 抓成效 → 寫回 → 更新看板資料 `promo-media/state/view.json`。
  - 只有 `main` 分支上的 workflow 會被排程執行；repo secrets 要有 `SUPABASE_URL`、`SUPABASE_SERVICE_KEY`。
  - 手動觸發：GitHub → Actions → promo-queue → Run workflow（或 `gh workflow run promo-queue.yml`）。
- GitHub 排程可能延遲；錯過的時段一次只補一篇，兩篇至少隔 `min_gap_hours`（預設 6 小時），後面的自動往後順延。
- 時段、間隔、每種貼文發哪些平台都在 `queue.json` 的 `settings`（`slots`、`min_gap_hours`、`platforms`）。改完跑 `reschedule`。
- 平台對應（新國家的預設）：
  - 預設：影片 → IG、Threads、Facebook、TikTok、YouTube；輪播圖 → IG、Threads、Facebook（每國可改，見上面「平台」）
- IG / Threads 直接用公開網址（PNG 上傳時自動轉 JPEG），網址記在該篇的 `public_urls`；TikTok / YouTube 發文時從公開網址下載再上傳。
- 每個平台各自記狀態：`queued` → `posted`（記 `url`）/ `skipped`（未設定或不支援，記 `note`）/ 失敗會重試，3 次後變 `failed`（記 `error`）。
- 日誌：雲端執行的紀錄在 GitHub Actions 的執行紀錄（`gh run list --workflow promo-queue.yml`、`gh run view <id> --log`）；本機跑的指令寫在 `promo-vids/.postq.log`。

## 成效追蹤
- `post-due` 每次跑都會順便抓到期的快照：發文後**第 3 天**、**第 7 天**各一次（IG 數字最多延遲 48 小時，所以不早抓），存在每個平台的 `metrics.d3` / `metrics.d7`；第 7 天的為準。
- 拿得到的數字：
  - IG Reels：reach、views、saved、shares、平均觀看秒數、前 3 秒滑走率
  - IG 輪播：reach、views、saved、shares、follows、profile_visits
  - Threads：views、reposts、quotes、shares
  - TikTok：views、likes、comments、shares（僅自己可見的影片可能拿不到）
  - YouTube：views、平均看完百分比、shares、新增訂閱
  - Facebook：Reels 播放數、平均觀看秒數、按讚、留言；多圖貼文的分享、按讚、留言、點擊（FB 的 Reels 互動不在 insights 裡，分享數可能拿不到）
- 三個分數（`scores()`）：
  - `hook` 開頭留人（0–1）：IG 用 1 − 滑走率，或平均觀看秒數 ÷ 片長；YouTube 用平均看完百分比。
  - `keep` 收藏分享（每千觸及）：**主要指標**。
  - `follow` 轉追蹤（每千觸及）：IG 輪播的 follows、YouTube 的新增訂閱。
- 評等：keep 跟**同國家同平台同類型**其他貼文的中位數比，≥1.5 倍 🔥、≤0.67 倍「冷」，其他「普通」；不滿 3 篇可比時顯示「累積中」。不同平台不直接比數字。
- 看板「哪種比較好」：依格式 / hook 句型 / 劇名算平均倍數。使用者問「下一支該做哪種」時，用這裡的結果回答，並說明篇數（篇數少就說還不準）。
- 下載數：API 算不到單篇。建議在每個平台的個人檔案放不同的 App Store 活動連結（`ct=ig`、`ct=threads`…）和 Google Play 帶來源參數的連結，在 App Store Connect / Play Console 看各平台帶來的下載量。

## 金鑰與設定（使用者自己做）
- 金鑰：平台金鑰在 Supabase `promo-private/secrets.json`（雲端會自己輪替 token）；Supabase 金鑰在本機 `~/.config/nuances-promo/secrets.json` 和 GitHub repo secrets。都不進 git，**不要讀出來或貼到對話裡**。
- 第一次或要補某個平台：請使用者在終端機跑
  ```bash
  bash skills/promo-queue/scripts/setup_wizard.sh
  ```
  精靈一次設定一個國家：帶他建 Meta App（IG + Threads + Facebook 粉專）、TikTok App、Google Cloud 專案，做 OAuth，最後把金鑰傳到雲端、設定 GitHub secrets。在專案根目錄跑，需要 `gh` 已登入。每個平台都能先跳過。
- 平台限制（審核過才會公開）：
  - TikTok App 沒通過審核前，影片只有自己看得到（dashboard 會標「僅自己可見」）。
  - YouTube API 專案沒通過 Google 稽核前，上傳的影片會被設成私人。
  - IG / Threads 用開發模式的 App 發到自己的帳號，不用送審。
- IG / Threads token 60 天過期，`post-due` 會在剩不到 20 天時自動換新；TikTok / YouTube 用 refresh token。哪個平台開始一直失敗（`error` 裡有 401 / token），請使用者重跑精靈的那一步。

## Skill 檔案
- `scripts/postq.py`：排程 CLI、發文流程、雲端讀寫、看板產生、`push-secrets`（把本機金鑰傳上雲端）。
- `scripts/platforms.py`：各平台 API adapter、Supabase 上傳、token 換新。
- `scripts/setup_wizard.sh`：金鑰設定精靈（10 步）。
- 測試不想動到真的 queue：設 `POSTQ_DIR=<別的資料夾>` 會切成本機模式（不碰雲端），queue / 看板 / 日誌都寫到那裡。
- `.github/workflows/promo-queue.yml`：雲端排程。
