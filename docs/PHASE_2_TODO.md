# Nuances App - Phase 2 開發待辦清單
**日期：** 2026-02-11  
**版本：** MVP Phase 2  
**狀態：** Phase 1 ✅ 已完成（本地資料庫、UI、導航）

---

## ✅ Phase 1 完成項目（回顧）

- [x] WatermelonDB 本地資料庫設置
- [x] Schema 定義（profiles, cached_items, cards, review_history, sync_metadata）
- [x] Models 實現（Profile, CachedItem, Card, ReviewHistory, SyncMetadata）
- [x] 基礎 UI 組件（CacheListScreen, CardsListScreen）
- [x] 底部導航（Tab Navigation）
- [x] 測試數據種子腳本
- [x] 無限循環問題修復
- [x] iOS 模擬器測試環境

---

## 🎯 Phase 2: 核心功能實現

### 優先級 P0 - 必須完成（本週）

#### 1️⃣ **新增快取項目功能**（FR-1.1 部分實現）
**檔案：** `src/screens/AddCacheItemScreen.tsx`

- [ ] **1.1** 實現基本的「新增快取」UI
  - [ ] 文字輸入框（多行）
  - [ ] URL 輸入框
  - [ ] 來源 App 下拉選單
  - [ ] 用戶關鍵字輸入（FR-1.2）
  - [ ] 儲存按鈕
  
- [ ] **1.2** 實現圖片選擇功能
  - [ ] 使用 `expo-image-picker`
  - [ ] 拍照選項
  - [ ] 從相簿選擇
  
- [ ] **1.3** 實現數據儲存
  - [ ] 寫入 WatermelonDB `cached_items` 表
  - [ ] 處理圖片存儲路徑
  - [ ] 表單驗證
  
- [ ] **1.4** 導航連接
  - [ ] 在 CacheListScreen 添加「+」按鈕
  - [ ] 導航到 AddCacheItemScreen
  - [ ] 儲存後返回列表

**預計時間：** 4-6 小時

---

#### 2️⃣ **卡片複習流程**（FR-3.2 SRS 實現）
**檔案：** `src/screens/CardReviewScreen.tsx`

- [ ] **2.1** 複習 UI 設計
  - [ ] 卡片正面（目標單字 + 原句）
  - [ ] 翻轉動畫顯示定義
  - [ ] 4 個評分按鈕（Again, Hard, Good, Easy）
  - [ ] 進度條（當前複習卡片數/總數）
  
- [ ] **2.2** SRS 演算法實現
  - [ ] 創建 `src/services/srs/fsrs.ts`
  - [ ] 實現 SM-2 或 FSRS 演算法
  - [ ] 根據評分計算下次複習時間
  - [ ] 更新 `ease_factor`, `interval_days`, `repetitions`
  
- [ ] **2.3** ReviewHistory 記錄
  - [ ] 每次複習寫入 `review_history` 表
  - [ ] 記錄 rating, time_spent_seconds, reviewed_at
  
- [ ] **2.4** 導航連接
  - [ ] 從 CardsListScreen 點擊卡片進入複習
  - [ ] 或點擊「開始複習」按鈕（批次複習待複習卡片）

**預計時間：** 6-8 小時

---

#### 3️⃣ **從快取項目創建卡片**（FR-2.3 + FR-3.1）
**檔案：** `src/services/cardGenerator.ts`

- [ ] **3.1** 手動創建卡片 UI
  - [ ] 在 CacheListScreen 項目上添加「📇 創建卡片」按鈕
  - [ ] 彈出表單或導航到新畫面
  - [ ] 顯示快取項目內容
  - [ ] 讓用戶選擇/編輯目標單字
  
- [ ] **3.2** 卡片創建邏輯
  - [ ] 從 CachedItem 提取資訊
  - [ ] 創建 Card 記錄
  - [ ] 初始化 SRS 參數（ease_factor=2.5, interval_days=1, repetitions=0）
  - [ ] 更新 CachedItem 的 `converted_to_card = true`
  
- [ ] **3.3** Mock AI 分析（暫不串接真實 API）
  - [ ] 創建 `src/services/ai/mockAnalyzer.ts`
  - [ ] 根據文本提取可能的目標單字（簡單正則）
  - [ ] 提供簡單的定義（使用硬編碼詞典）

**預計時間：** 4-5 小時

---

### 優先級 P1 - 重要（下週）

#### 4️⃣ **Supabase 雲端同步基礎**（NFR-3 + BR-1）

- [ ] **4.1** Supabase 專案設置
  - [ ] 在 Supabase 創建專案
  - [ ] 創建對應的 PostgreSQL 表（profiles, cached_items, cards...）
  - [ ] 設置 Row Level Security (RLS)
  
- [ ] **4.2** 認證整合
  - [ ] 使用 Supabase Auth
  - [ ] 實現 Email/Password 登入
  - [ ] 創建 LoginScreen
  - [ ] 儲存 user_id 到本地
  
- [ ] **4.3** 基礎同步邏輯
  - [ ] 創建 `src/services/sync/syncEngine.ts`
  - [ ] 實現 Pull（從雲端下載新資料）
  - [ ] 實現 Push（上傳本地變更）
  - [ ] 使用 `updated_at` 時間戳比對
  - [ ] 簡單的「Last Write Wins」衝突策略
  
- [ ] **4.4** 背景同步觸發
  - [ ] App 啟動時自動同步
  - [ ] 網絡恢復時自動同步
  - [ ] 使用 `expo-network` 監聽網絡狀態

**預計時間：** 8-10 小時

---

#### 5️⃣ **圖片註解功能**（FR-1.3）

- [ ] **5.1** 圖片標註 UI
  - [ ] 使用 `react-native-image-marker` 或自定義 Canvas
  - [ ] 實現繪製邊界框（bounding box）
  - [ ] 支援多個框選區域
  - [ ] 儲存標註座標
  
- [ ] **5.2** 數據結構
  - [ ] 將標註座標儲存到 `image_annotations` JSON 欄位
  - [ ] 格式：`[{x, y, width, height, label}]`

**預計時間：** 6-8 小時

---

### 優先級 P2 - 可選（第三週）

#### 6️⃣ **AI 服務整合**（FR-2.1 + FR-4.1）

- [ ] **6.1** OpenAI API 整合
  - [ ] 設置 OpenAI API key
  - [ ] 實現文本分析 endpoint
  - [ ] 自動提取關鍵詞和定義
  - [ ] 處理 rate limiting 和錯誤
  
- [ ] **6.2** Azure Speech Service（發音功能）
  - [ ] 設置 Azure Speech SDK
  - [ ] 實現 TTS（Text-to-Speech）
  - [ ] 實現發音評估 API
  - [ ] 錄音和比對功能

**預計時間：** 10-12 小時

---

#### 7️⃣ **Share Extension（iOS）**（FR-1.1 完整實現）

⚠️ **注意：這需要 EAS Build 雲端編譯**

- [ ] **7.1** 使用 `expo-share-intent` plugin
  - [ ] 安裝並配置 `app.config.ts`
  - [ ] 按照官方文檔設置（不要讓 AI 猜測）
  
- [ ] **7.2** Share Extension UI
  - [ ] 創建輕量級的分享介面
  - [ ] 關鍵字輸入框
  - [ ] 儲存按鈕
  
- [ ] **7.3** 數據寫入
  - [ ] 將分享內容寫入 WatermelonDB
  - [ ] 或寫入 App Group Shared Container
  - [ ] 主 App 啟動時讀取並處理
  
- [ ] **7.4** EAS Build 測試
  - [ ] 執行 `eas build --platform ios`
  - [ ] 在實機測試 Share Sheet

**預計時間：** 12-15 小時（包含測試和調試）

---

## 📦 Phase 3 預覽（未來規劃）

- [ ] **發音教練完整功能**（FR-4.2, FR-4.3）
  - [ ] 波形視覺化比對
  - [ ] Articulatory Feedback（口型、舌位建議）
  - [ ] 音調圖（pitch graph）

- [ ] **進階搜尋和過濾**（FR-3.3）
  - [ ] 按標籤、來源、難度過濾
  - [ ] 全文搜尋
  - [ ] 資料庫視圖（Table View）

- [ ] **訂閱和付費功能**（BR-1, BR-2）
  - [ ] 免費版限制（10 個快取項目，24 小時過期）
  - [ ] Pro 版解鎖
  - [ ] App Store In-App Purchase 整合

- [ ] **Android 支援**
  - [ ] Android Share Intent
  - [ ] Platform-specific UI 調整

---

## 🛠 技術準備工作

### 環境變數設置（.env）

```env
# Supabase（Phase 2 需要）
EXPO_PUBLIC_SUPABASE_URL=your-project-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# OpenAI（Phase 2 可選）
EXPO_PUBLIC_OPENAI_API_KEY=your-openai-key

# Azure Speech（Phase 3）
EXPO_PUBLIC_AZURE_SPEECH_KEY=your-azure-key
EXPO_PUBLIC_AZURE_SPEECH_REGION=your-region
```

### 需要安裝的新依賴

```bash
# Phase 2 - 核心功能
npm install @supabase/supabase-js
npm install expo-network

# Phase 2 - 圖片功能（已安裝）
# expo-image-picker (已在 package.json)

# Phase 3 - 發音功能
npm install expo-av
npm install react-native-fs

# Phase 3 - Share Extension
npm install expo-share-intent
```

---

## 📊 時間估算總結

| 階段 | 任務 | 預計時間 |
|------|------|----------|
| P0 Week 1 | 新增快取 + 複習流程 + 卡片創建 | 14-19 小時 |
| P1 Week 2 | Supabase 同步 + 圖片註解 | 14-18 小時 |
| P2 Week 3 | AI 整合 + Share Extension | 22-27 小時 |
| **總計** | **Phase 2 完整實現** | **50-64 小時** |

---

## 🎯 下一步行動

### 立即開始（今天）：

1. **完成 AddCacheItemScreen.tsx 基礎 UI**
   - 讓用戶能手動新增文字快取項目
   - 這是最快能看到效果的功能

2. **實現簡單的卡片創建流程**
   - 從快取項目點擊按鈕 → 創建卡片
   - 不需要 AI，手動輸入即可

3. **完成卡片複習流程的 UI**
   - 翻卡動畫
   - 評分按鈕
   - 先不連接 SRS 演算法，簡單記錄即可

### 本週目標：

✅ 用戶能夠完整體驗從「新增內容 → 創建卡片 → 複習卡片」的完整流程

---

## 📝 備註

- **遵循 .cursorrules**：每次修改 WatermelonDB models 必須更新 schema version
- **優先本地功能**：先確保離線狀態下所有功能正常
- **增量開發**：每個功能完成後立即測試，不要累積未測試的代碼
- **參考 Tech Stack 文檔**：Share Extension 配置嚴格按照 `expo-share-intent` README
- **Mock 優先**：AI 功能先用 Mock 數據，確保流程正確後再串接真實 API

---

**下一步：開始實現 P0 任務！** 🚀
