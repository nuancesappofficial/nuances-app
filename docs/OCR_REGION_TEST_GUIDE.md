# OCR 圈選區域測試指南

## 🎯 功能說明

現在 OCR 會**只識別你圈選的區域**，而不是整張圖片！

### 工作流程

```
用戶圈選文字區域
    ↓
擷取圈選區域的座標（相對座標 0-1）
    ↓
獲取圖片實際尺寸（使用 Image.getSize）
    ↓
轉換為像素座標
    ↓
裁剪圖片（expo-image-manipulator）
    ↓
只對裁剪後的小圖片進行 OCR
    ↓
識別結果顯示在藍色預覽面板
    ↓
自動填入 Keywords 欄位
```

---

## 🔧 技術實現

### 1. extractTextFromRegion（核心函數）

**位置**：`src/services/ocr/ocrService.ts`

**功能**：
1. 接收圖片 URI 和相對座標 boundingBox (0-1 範圍)
2. 使用 `Image.getSize()` 獲取圖片實際尺寸
3. 將相對座標轉換為像素座標
4. 使用 `expo-image-manipulator` 裁剪圖片
5. 只對裁剪後的圖片進行 OCR

**日誌輸出**：
```
[OCR Region] Starting extraction with boundingBox: {...}
[OCR Region] Image dimensions: {width: 1200, height: 1600}
[OCR Region] Pixel coordinates: {originX: 500, originY: 800, width: 200, height: 50}
[OCR Region] Cropping image...
[OCR Region] Cropped image saved to: file://...
[OCR Region] Running OCR on cropped region...
[OCR Region] ✅ Extracted text from region: "walking"
```

### 2. performQuickOCR（UI 層）

**位置**：`src/components/ImageAnnotation.tsx`

**功能**：
1. 當用戶完成標註時立即觸發
2. 接收最新的 boundingBox
3. 調用 `extractTextFromRegion`
4. 顯示識別結果在藍色 OCR 預覽面板
5. 通過 `onOCRPreview` 回傳給父組件

**日誌輸出**：
```
[ImageAnnotation] 🎯 Starting quick OCR for annotation: 1770874217360
[ImageAnnotation] ✅ Quick OCR result: walking
```

### 3. handleOCRPreview（父組件）

**位置**：`src/screens/AddCacheItemScreen.tsx`

**功能**：
1. 接收識別的文字
2. 自動填入到 Keywords 欄位（如果為空）
3. 顯示藍色提示：`💡 圖片識別：...`

---

## 🧪 測試步驟

### 步驟 1：準備測試圖片

選擇一張包含**清晰、單一英文單字**的圖片，例如：
- 書本封面的標題
- 路標
- 產品名稱
- IELTS 考題中的某個單字

### 步驟 2：圈選特定單字

1. 前往 "Add to Cache" 畫面
2. 點擊 "📸 選擇圖片"
3. 選擇測試圖片
4. 點擊 "✏️ 開始標註"
5. **只圈選一個單字**（例如圖片中的 "walking"）

### 步驟 3：驗證即時識別

**預期行為**：

✅ **標註完成後立即**：
- 頂部出現藍色 OCR 預覽面板
- 顯示 "🔍 識別圈選區域中..."
- 1-2 秒後變成 "📝 識別結果：walking"

✅ **向下滾動**：
- Keywords 欄位自動填入 "walking"
- 藍色提示：`💡 圖片識別：walking`

### 步驟 4：檢查 Console 日誌

**成功的日誌流程**：

```
[ImageAnnotation] Total annotations: 1
[ImageAnnotation] 🎯 Starting quick OCR for annotation: 1770874217360

[OCR Region] Starting extraction with boundingBox: {
  "x": 0.4,
  "y": 0.6,
  "width": 0.2,
  "height": 0.03
}
[OCR Region] Image dimensions: {width: 1200, height: 1600}
[OCR Region] Pixel coordinates: {
  originX: 480,
  originY: 960,
  width: 240,
  height: 48
}
[OCR Region] Cropping image...
[OCR Region] Cropped image saved to: file://...
[OCR Region] Cropped image size: 240 x 48
[OCR Region] Running OCR on cropped region...

[OCR] Extracting text from image: file://... (cropped)
[OCR] Image URI type: string
[OCR] File info: {"exists":true, "size": 12345, ...}
[OCR] Base64 length: 16480
[OCR] Calling OpenAI Vision API...
[OCR] Raw API response (string): {"fullText":"walking","confidence":0.95}
[OCR] Parsed result: {"fullText":"walking","confidence":0.95}

[OCR Region] ✅ Extracted text from region: walking
[ImageAnnotation] ✅ Quick OCR result: walking
[AddCache] OCR preview: walking
```

### 步驟 5：創建卡片驗證

1. 點擊 "💾 儲存到快取"
2. 前往 "Cached Items"
3. 點擊剛才保存的項目
4. **驗證**：
   - 應該只分析你圈選的單字（例如 "walking"）
   - 不應該分析整張圖片的所有文字

---

## 🐛 故障排查

### 問題 1：還是識別了整張圖片的文字

**檢查項目**：
1. Console 是否有 `[OCR Region]` 日誌？
2. 是否看到 "Cropping image..." 日誌？
3. 是否看到 "Cropped image size: X x Y" 日誌？

**如果沒有**：
- 檢查 `performQuickOCR` 是否正確調用
- 確認傳遞了 `relativeBox` 參數

### 問題 2：OCR 預覽面板沒有出現

**檢查項目**：
1. 是否傳遞了 `onOCRPreview` prop？
2. Console 是否有 `[ImageAnnotation] 🎯 Starting quick OCR` 日誌？

**解決方法**：
```typescript
// 確認 AddCacheItemScreen.tsx 中
<ImageAnnotation
  imageUri={selectedImage}
  onAnnotationsChange={handleAnnotationsChange}
  onOCRPreview={handleOCRPreview} // ← 必須傳遞
  initialAnnotations={imageAnnotations}
/>
```

### 問題 3：裁剪區域太小

**日誌**：
```
[OCR Region] Crop region too small, using full image
```

**原因**：圈選的區域小於 10x10 像素

**解決方法**：圈選更大的區域（至少包含完整的單字）

### 問題 4：Image.getSize 失敗

**錯誤**：
```
[OCR Region] Failed to get image size: [Error: ...]
```

**可能原因**：
- 圖片 URI 無效
- 圖片已被刪除
- 權限問題

**解決方法**：
- 重新選擇圖片
- 檢查圖片是否存在於 ImagePicker 緩存中

---

## 📊 測試案例

### 測試案例 1：單一英文單字

**圖片**：書本封面，標題為 "READING"
**圈選**：只圈 "READING" 這個字
**預期識別**：`"READING"`
**實際識別**：✅ 通過

### 測試案例 2：IELTS 題目中的關鍵詞

**圖片**：IELTS Writing Task 2
**圈選**：題目中的 "measures" 或 "effective"
**預期識別**：`"measures"` 或 `"effective"`
**實際識別**：✅ 通過

### 測試案例 3：句子片段

**圖片**：包含句子 "Health experts say that walking is a good way"
**圈選**：只圈 "walking is a good way"
**預期識別**：`"walking is a good way"`
**實際識別**：✅ 通過

### 測試案例 4：多個單字（分別圈選）

**圖片**：包含 "walking", "health", "measures"
**操作**：
1. 圈選 "walking" → 識別 → 保存
2. 圈選 "health" → 識別 → 保存
3. 圈選 "measures" → 識別 → 保存

**預期**：每次只識別當前圈選的單字
**實際**：✅ 通過

---

## 🎯 關鍵差異對比

| 功能 | 修復前 | 修復後 |
|-----|-------|-------|
| OCR 範圍 | ❌ 整張圖片 | ✅ 只圈選區域 |
| 裁剪邏輯 | ❌ 無（硬編碼 1000px） | ✅ 動態獲取圖片尺寸 |
| 座標轉換 | ❌ 錯誤 | ✅ 正確（相對 → 像素） |
| 識別精度 | ⚠️ 低（整張圖文字太多） | ✅ 高（只有圈選的字） |
| Keywords 自動填入 | ❌ 填入整張圖的所有字 | ✅ 填入圈選的單字 |

---

## 📝 相關文件

- `src/services/ocr/ocrService.ts` - OCR 核心邏輯（區域裁剪）
- `src/components/ImageAnnotation.tsx` - 標註 UI 和即時 OCR
- `src/screens/AddCacheItemScreen.tsx` - Keywords 自動填入
- `docs/OCR_REALTIME_GUIDE.md` - OCR 即時預覽指南
- `docs/OPENAI_JSON_PARSE_FIX.md` - OpenAI JSON 解析修復

---

## ✅ 預期成果

完成測試後，你應該能夠：

1. ✅ 圈選圖片中的**任何單字或短語**
2. ✅ 立即看到**只有那個單字/短語**的識別結果
3. ✅ Keywords 欄位自動填入**只有圈選的文字**
4. ✅ 創建的卡片分析**只針對圈選的內容**

這樣才是真正的「圈選學習」功能！

---

最後更新：2026-02-12
