# Nuances App - 功能路線圖（更新版）

**日期：** 2026-02-11  
**專注領域：** Text Input + Image Input Analysis

---

## 📊 當前已實現功能

### ✅ Phase 1: 基礎功能（已完成）

- ✅ 本地資料庫（WatermelonDB）
- ✅ 新增快取項目（文字、圖片、URL）
- ✅ 快取列表展示
- ✅ 手動創建卡片
- ✅ 卡片複習（SRS 間隔重複演算法）
- ✅ 基礎 Mock AI（20+ 詞庫）
- ✅ 開發者工具（清除/植入資料）

### ✅ Phase 2: OpenAI 智能分析（已完成）

**檔案：**
- `src/services/ai/openaiService.ts`
- `src/services/ai/index.ts`
- `src/services/ai/mockAnalyzer.ts`

**功能：**
1. **智能文本分析**
   - 自動提取關鍵詞（3-5個）
   - 語義理解（不只是關鍵字匹配）
   - 學習目標導向（IELTS/Casual/Professional）

2. **高質量內容生成**
   - 中英雙語定義
   - IPA 音標
   - 上下文特定解釋
   - 智能標籤推薦
   - 使用範例

3. **優雅降級**
   - 自動檢測 API 可用性
   - 無 API 時使用 Mock
   - 透明切換機制

### ✅ Phase 3: 圖片標註 + OCR（已完成）

**檔案：**
- `src/components/ImageAnnotation.tsx`
- `src/services/ocr/ocrService.ts`

**功能：**

#### A. 圖片標註工具
```
用戶上傳圖片
↓
點擊「標註關鍵區域」
↓
用手指拖動繪製 Bounding Box
↓
可標註多個區域
↓
每個區域獨立分析
```

**UI 特點：**
- ✏️ 實時繪製預覽
- 🗑️ 單獨刪除/全部清除
- 📊 標註計數顯示
- 🎯 視覺化邊界框

#### B. 圖片文字識別（OCR）
```
用戶上傳圖片（有標註）
↓
OpenAI Vision API (GPT-4o-mini)
↓
提取標註區域的文字
↓
自動填入 contentText
↓
AI 分析並生成卡片定義
```

**優勢：**
- ✨ 高精度識別（使用 GPT-4o-mini Vision）
- ✨ 多語言支持
- ✨ 標註區域精確提取
- ✨ 零額外配置（複用 OpenAI API）

**使用場景：**
1. **餐廳菜單**
   - 拍照 → 圈出菜名 → AI 解釋料理含義

2. **書本閱讀**
   - 拍照 → 圈出生詞 → 自動生成學習卡

3. **路標告示**
   - 拍照 → 圈出關鍵字 → 學習日常用語

---

## 🚀 下一階段計劃

### Phase 4: Share Extension（規劃中）

**目標：** 從任何 App 快速分享到 Nuances

**功能：**
- 📱 iOS/Android Share Sheet 整合
- 📝 分享文字、網址、圖片
- ⚡ 輕量級 UI（<1秒載入）
- 🔄 後台自動 AI 分析

**預期效果：**
- 輸入效率提升 200%
- 學習頻率大幅增加
- 符合「無摩擦捕捉」核心理念

**技術方案：**
- 使用 `expo-share-intent`
- EAS Build 配置
- Config Plugin 設置

---

### Phase 5: 雲端同步（規劃中）

**目標：** 數據備份 + 多設備同步

**Supabase 整合：**

#### A. 用戶認證
- Email + Password
- Google / Apple 登入
- 密碼重置

#### B. 雲端備份
- 自動背景同步
- 增量更新
- 衝突解決（Last Write Wins）

#### C. 多設備同步
- 實時數據同步
- 跨設備無縫切換
- 離線優先架構

#### D. 檔案儲存
- 圖片上傳到 Supabase Storage
- CDN 加速
- 自動壓縮優化

**技術方案：**
- `@nozbe/watermelondb/sync`
- Supabase Real-time
- 軟刪除策略

---

## 🎯 功能對比表

| 功能 | 當前狀態 | + OpenAI | + OCR 標註 | + Share Ext | + Supabase |
|------|---------|----------|-----------|-------------|------------|
| **文字輸入** | ✅ 手動 | ✅ AI 分析 | ✅ OCR 識別 | 分享輸入 | 雲端備份 |
| **圖片輸入** | ✅ 基礎 | ✅ Vision | ✅ 標註工具 | 圖片分享 | 圖片同步 |
| **關鍵詞提取** | Mock (20詞) | ✅ GPT-4 無限 | ✅ 區域分析 | 自動提取 | 自動提取 |
| **定義生成** | 硬編碼 | ✅ 上下文化 | ✅ 圖片上下文 | 智能生成 | 智能生成 |
| **音標生成** | ❌ | ✅ IPA | ✅ | ✅ | ✅ |
| **智能標籤** | ❌ | ✅ 自動推薦 | ✅ | ✅ | ✅ |
| **多設備同步** | ❌ | ❌ | ❌ | ❌ | ✅ 雲端同步 |
| **數據備份** | ❌ | ❌ | ❌ | ❌ | ✅ 自動備份 |
| **輸入速度** | 較慢 | 較慢 | 快（拍照） | 超快 (<5秒) | 快 |

---

## 🗓️ 實施時間表（建議）

### Week 1-2: Share Extension
- [ ] 配置 `expo-share-intent`
- [ ] iOS Share Sheet 測試
- [ ] Android 整合
- [ ] 輕量級 UI 設計
- [ ] EAS Build 測試

### Week 3-4: Supabase 雲端同步
- [ ] Supabase 專案設置
- [ ] 用戶認證系統
- [ ] 數據庫 Schema 對應
- [ ] 同步邏輯實現
- [ ] 衝突解決測試

### Week 5: 檔案儲存
- [ ] Supabase Storage 配置
- [ ] 圖片上傳/下載
- [ ] 自動壓縮優化
- [ ] CDN 設置

### Week 6: 測試 & 優化
- [ ] 完整流程測試
- [ ] 性能優化
- [ ] 錯誤處理完善
- [ ] 用戶體驗調優

---

## 💰 成本估算（每月 100 活躍用戶）

### OpenAI GPT-4o-mini
| 操作 | 頻率 | 成本 |
|------|------|------|
| 文本分析 | 300 次 | ~$0.15 |
| 卡片生成 | 200 次 | ~$0.10 |
| OCR 圖片識別 | 100 次 | ~$0.20 |
| **小計** | | **$0.45** |

### Supabase（免費層）
- ✅ 500 MB 資料庫
- ✅ 1 GB 檔案儲存
- ✅ 50K 月活躍用戶
- **成本：** $0（在免費額度內）

### 總計
- **月成本：** ~$0.45 USD
- **用戶均攤：** $0.0045/用戶

---

## 🎯 核心價值主張

### 當前優勢（已實現）
1. ✅ **智能分析** - GPT-4 驅動的上下文理解
2. ✅ **圖片學習** - OCR + 標註工具
3. ✅ **精確控制** - 用戶決定學什麼
4. ✅ **離線優先** - 本地資料庫，快速響應

### 下一步增強（規劃中）
5. 🚀 **無摩擦輸入** - Share Extension
6. 🚀 **隨處可學** - 多設備同步
7. 🚀 **數據安全** - 雲端備份

---

## 📌 移除的功能

以下功能已從路線圖中移除，以專注於核心體驗：

### ❌ 語音模組
- 語音輸入（STT）
- 文字轉語音（TTS）
- 發音評估（Pronunciation Assessment）
- Azure Speech Service 整合

**原因：** 當前專注於 **Text Input** 和 **Image Input** 分析，語音功能可能在未來版本考慮。

---

## 🔑 關鍵實現文件

### 已實現
- ✅ `src/services/ai/openaiService.ts` - OpenAI 整合
- ✅ `src/services/ai/index.ts` - 智能 AI 服務層
- ✅ `src/services/ocr/ocrService.ts` - OCR 圖片識別
- ✅ `src/components/ImageAnnotation.tsx` - 圖片標註工具
- ✅ `src/screens/AddCacheItemScreen.tsx` - 圖片上傳 + 標註
- ✅ `src/screens/CreateCardScreen.tsx` - OCR + AI 分析整合

### 待實現
- ⏳ `src/services/sync/supabaseSync.ts`
- ⏳ `src/services/share/shareHandler.ts`
- ⏳ `ios/ShareExtension/` - iOS 原生擴展
- ⏳ `android/app/src/main/java/.../ShareActivity.java`

---

**最後更新：** 2026-02-11  
**當前焦點：** Share Extension 實現（下一階段）
