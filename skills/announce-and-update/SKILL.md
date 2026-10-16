---
name: announce-and-update
description: 發送即時推播/應用內公告與同步 App 版本更新政策。當使用者要求發送公告、推播即時訊息、管理 App 最低版本需求、或執行版本政策乾跑測試（dry test）時使用。
---

# App Announcement & Update Policy Skill

本 Skill 提供 Nuances App 的「**版本更新政策同步**」與「**雙軌即時公告與推播（In-App & Push）**」操作指南，包含安全檢驗（Dry Run）與正式發布流程。

---

## 一、App 版本更新政策（Version Policy Sync）

用於通知或強制使用者更新 App。當用戶端版本或 build number 低於 Supabase 政策時，App 啟動或回前景時會自動彈出「點我更新」提示，並依平台自動切換 App Store / Google Play 連結與字串。

### 1. 檢驗版號解析（Dry Run，不影響線上）
從 `ios/Nuances.xcodeproj` 與 `android/app/build.gradle` 讀取版號並預覽 Payload：
```bash
# 檢驗 iOS
npm run sync:app-version-policy:dry

# 檢驗 Android
npm run sync:app-version-policy:android:dry
```

### 2. 正式同步發布至 Supabase
將本地最新版號寫入 Supabase `app_version_policy` 表，並設為 `minimum_supported_version`（即刻要求舊版用戶更新）：
```bash
# 同步 iOS 最低版號要求
npm run sync:app-version-policy

# 同步 Android 最低版號要求
npm run sync:app-version-policy:android
```

---

## 二、即時訊息與應用內公告（Real-Time Announcements）

透過 Supabase Realtime 與 Expo Push Notification API，支援向所有使用者或特定使用者發送即時推播與應用內彈窗。

腳本路徑：`scripts/send-message.js`

### 1. 乾跑測試（Dry Test）
僅印出即將送出的 Payload，不觸發 Edge Function：
```bash
node scripts/send-message.js --dry-run --title "公告標題" --body "公告內容..."
```

### 2. 常用發送範例

#### A. 全體廣播（應用內彈窗 + 鎖定畫面推播）
在線用戶即時跳窗，離線用戶收到手機推播並於下次開啟 App 時顯示：
```bash
node scripts/send-message.js --all --type both --title "週末學習挑戰開始！" --body "完成今日 10 張卡片複習即可獲得專屬獎章。"
```

#### B. 僅發送「應用內彈窗」（不發手機推播通知）
適合維護通知或 App 內活動提醒：
```bash
node scripts/send-message.js --all --type in_app --title "系統維護通知" --body "伺服器將於今晚 02:00 進行優化維護。" --priority high
```

#### C. 僅發送「鎖定畫面遠端推播」（App 內不彈窗）
適合提醒使用者開啟 App 複習：
```bash
node scripts/send-message.js --all --type push --title "卡片複習提醒" --body "您有 5 張卡片已達到最佳記憶間隔，立即開啟 Nuances 複習。"
```

#### D. 針對特定使用者（依 Email 或 User ID）發送
```bash
# 依據 Email 發送
node scripts/send-message.js --email user@example.com --type both --title "專屬好禮已入帳" --body "感謝您的回饋，已為您開通額外額度！"

# 依據 Supabase User ID 發送
node scripts/send-message.js --user-id "2703f72e-7254-4350-9bb0-2596d2384139" --type in_app --title "問題處理進度" --body "您回報的問題已修復完畢。"
```

#### E. 附帶跳轉連結（Deep Link / 網址）與重要性等級
```bash
node scripts/send-message.js --all --type in_app \
  --title "全新功能上線" \
  --body "點擊下方按鈕了解最新發音教練功能。" \
  --url "https://nuances.app" \
  --button "立即了解" \
  --priority high
```

---

## 三、參數參考速查表

| 參數 | 說明 | 可選值 | 預設值 |
| :--- | :--- | :--- | :--- |
| `--type` | 發送管道 | `both`, `in_app`, `push` | `both` |
| `--all` | 發送給所有註冊用戶 | 布林 flag | 預設啟用 |
| `--email` | 指定發送之用戶 Email | Email 字串 | 無 |
| `--user-id` | 指定發送之用戶 UUID | UUID 字串 | 無 |
| `--title` | 訊息標題（必填） | 字串 | 無 |
| `--body` | 訊息內文（必填） | 字串 | 無 |
| `--priority` | 優先級與彈窗顏色 | `normal` (綠), `high` (橘), `urgent` (紅) | `normal` |
| `--url` | 動作跳轉連結 | Deep link (e.g. `nuances://...`) 或網址 | 無 |
| `--button` | 跳轉按鈕文字 | 字串 | `立即查看` |
| `--dry-run` | 僅測試輸出 Payload，不實際發送 | 布林 flag | 無 |
