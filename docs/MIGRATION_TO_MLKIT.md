# 遷移到 Tech Stack v1.5.0 (Pure Text Strategy)

**日期**: 2026-02-12  
**版本**: 從 OpenAI Vision → Google ML Kit  
**策略**: Image as Container（圖片永不上傳）

---

## 📋 變更摘要

### 核心原則改變

**舊策略（OpenAI Vision）**:
- 用戶手動圈選區域 → 裁切圖片 → 上傳 base64 到 OpenAI Vision API
- 成本：~$0.01/次
- 需要網路連接

**新策略（Tech Stack v1.5.0）**:
- 自動 OCR（本地 ML Kit）→ 顯示可點擊文字框 → 用戶點擊 → 純文字傳送 AI
- 成本：OCR $0 + 分析 ~$0.0001/次
- OCR 無需網路（離線可用）

---

## 🔧 修改的檔案

### 1. **新增依賴**
```bash
npm install @react-native-ml-kit/text-recognition
```

### 2. **完全重寫**: `src/services/ocr/ocrService.ts`

**移除的功能**:
- ❌ `expo-image-manipulator`（圖片裁切）
- ❌ `expo-file-system`（base64 編碼）
- ❌ `fixCoordinates`（座標修正函數）
- ❌ OpenAI Vision API 圖片上傳

**新增的功能**:
- ✅ `extractTextFromImage()` - 使用 ML Kit 本地 OCR
- ✅ `buildContextPayload()` - 智能上下文構建（Tech Stack 第 146-150 行）
- ✅ `analyzeTextWithAI()` - 純文字分析（不上傳圖片）

**API 變化**:
```typescript
// 舊 API
extractTextFromRegion(imageUri, boundingBox, containerSize) → string

// 新 API
extractTextFromImage(imageUri) → { blocks, fullText, processingTime }
buildContextPayload(blocks, selectedIndex) → { target_text, context_text, original_sentence }
analyzeTextWithAI(payload) → { keyword, definition, example, tags }
```

---

### 3. **新建組件**: `src/components/ImageOCRViewer.tsx`

**替代**: `ImageAnnotation.tsx`（舊組件保留但不再使用）

**UX 變化**:
- ❌ 移除：手動拖動圈選（PanResponder）
- ✅ 新增：自動 OCR → 顯示 SVG 覆蓋層 → 點擊選擇

**視覺反饋**:
- 未選中文字框：綠色半透明（`rgba(76, 175, 80, 0.2)`）
- 選中文字框：橙色高亮（`rgba(255, 152, 0, 0.35)`）

---

### 4. **重構**: `src/screens/AddCacheItemScreen.tsx`

**狀態管理變化**:
```typescript
// 舊狀態
const [imageAnnotations, setImageAnnotations] = useState<BoundingBox[]>([]);

// 新狀態
const [ocrBlocks, setOCRBlocks] = useState<OCRBlock[]>([]);
const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);
const [aiAnalysisResult, setAIAnalysisResult] = useState<any>(null);
```

**回調函數變化**:
```typescript
// 舊回調
handleAnnotationsChange(annotations: BoundingBox[])
handleOCRPreview(text: string)

// 新回調
handleTextBlockSelect(block: OCRBlock, index: number)
  → 自動填入關鍵字
  → 自動觸發 AI 分析
  → 顯示分析結果
```

**Modal 變化**:
```typescript
// 舊 Modal
<ImageAnnotation 
  onAnnotationsChange={...} 
  onOCRPreview={...} 
/>

// 新 Modal
<ImageOCRViewer 
  onTextBlockSelect={handleTextBlockSelect}
  initialSelectedIndex={selectedBlockIndex}
/>
```

---

## 🗄️ 資料庫兼容性

### WatermelonDB Schema

**保持兼容**: 使用相同的 `imageAnnotations` 欄位儲存 OCR blocks

```typescript
// 新數據格式（OCRBlock[]）
item.imageAnnotations = ocrBlocks as any; // @json 裝飾器自動序列化
```

**向後兼容**: 舊的 `BoundingBox[]` 數據仍可讀取，但不會有新的手動標註

---

## 🚀 部署步驟

### 1. 清除舊構建
```bash
rm -rf ios/build android/build
rm -rf node_modules/.cache
```

### 2. 重新構建（必須！ML Kit 是 Native Module）
```bash
# 推薦：本地構建（快速）
npx expo run:ios

# 或：雲端構建（慢但穩定）
eas build --profile development --platform ios
```

### 3. 測試流程
1. 上傳圖片 → 自動 OCR（應在 < 1 秒完成）
2. 點擊任何綠色文字框 → 變橙色
3. 檢查控制台：`[OCR] ML Kit raw result`（不應有 base64 或 ImageManipulator 日誌）
4. 確認 AI 分析彈窗顯示
5. 保存並檢查快取列表

---

## ⚠️ Breaking Changes

### 對用戶的影響

**舊 UX**:
1. 上傳圖片
2. 點擊「標註關鍵區域」
3. 手動拖動圈選
4. 等待 OCR（需要網路）
5. 保存

**新 UX**:
1. 上傳圖片
2. **自動顯示所有文字框**（無需手動標註）
3. 點擊想學習的文字
4. **立即看到 AI 分析**
5. 保存

**使用者教育**:
- 提示文字已更新為「識別文字」而非「標註關鍵區域」
- Modal 標題改為「選擇要學習的文字」

---

## 🐛 已知問題

### 1. ML Kit 座標系統差異

**問題**: 不同平台（iOS/Android）的 `frame` 結構可能不同

**解決方案**: 
```typescript
const frame = block.frame || block.boundingBox || {};
const x = frame.x !== undefined ? frame.x : (frame.left || 0);
```

### 2. OCR 準確度

**問題**: ML Kit 準確度（~85%）低於 OpenAI Vision（~95%）

**權衡**: 
- ✅ 免費無限次使用
- ✅ 離線可用
- ✅ 隱私保護
- ⚠️ 複雜手寫或低品質圖片可能識別較差

---

## 📊 成本對比

### 假設每月 1000 次使用

| 方案 | OCR 成本 | AI 分析成本 | 總成本 |
|------|---------|------------|--------|
| **舊方案**（OpenAI Vision）| $10 | $5 | **$15** |
| **新方案**（ML Kit + GPT-4o-mini）| $0 | $0.30 | **$0.30** |

**節省**: **98%** 💰

---

## 🔒 隱私改進

### 舊方案
- ❌ 圖片上傳到 OpenAI 服務器
- ❌ 需要 GDPR 合規聲明
- ❌ 用戶隱私疑慮

### 新方案
- ✅ 圖片 100% 本地處理
- ✅ 只上傳純文字（已去識別化）
- ✅ 符合 Apple 隱私政策

---

## 📚 參考資料

- [Tech Stack v1.5.0 PDF](../Nuances%20tech%20stack%20doc.pdf)
- [@react-native-ml-kit/text-recognition](https://www.npmjs.com/package/@react-native-ml-kit/text-recognition)
- [Google ML Kit 文檔](https://developers.google.com/ml-kit/vision/text-recognition/v2)

---

## ✅ 驗收清單

- [x] 安裝 `@react-native-ml-kit/text-recognition`
- [x] 重寫 `ocrService.ts`（移除圖片上傳）
- [x] 創建 `ImageOCRViewer.tsx`（點擊式 UI）
- [x] 更新 `AddCacheItemScreen.tsx`（整合新流程）
- [x] 所有 TypeScript 錯誤已修復
- [ ] **執行 `npx expo run:ios` 重新構建**
- [ ] 測試完整 OCR → AI 分析流程
- [ ] 確認控制台無圖片上傳日誌
- [ ] 確認離線 OCR 功能正常

---

**最後更新**: 2026-02-12  
**遷移完成**: 待重新構建後驗證
