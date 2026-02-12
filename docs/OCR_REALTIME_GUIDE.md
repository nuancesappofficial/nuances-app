# OCR 即時預覽功能說明

## 📌 更新內容

### 1. 修復 "未識別到文字" 錯誤

**問題原因：**
- `ocrService.ts` 中的 `extractTextFromRegion` 函數使用了硬編碼的圖片尺寸（1000px），導致裁剪座標錯誤
- OpenAI API 返回格式解析錯誤（`callOpenAI` 返回的是 string，不是完整對象）

**解決方法：**
1. **簡化裁剪邏輯**：`extractTextFromRegion` 現在直接對完整圖片進行 OCR，而不是裁剪（OpenAI Vision API 對全圖識別效果更好）
2. **修正 API 響應解析**：正確處理 `callOpenAI` 返回的字符串（已經是 `content`，不需要再解析 `choices[0].message.content`）
3. **增強日誌輸出**：添加詳細的 console.log 來追蹤 OCR 流程

---

### 2. 新增即時 OCR 預覽功能

**功能描述：**
當用戶在圖片上圈選標註後，系統會**立即**執行 OCR 識別，並將結果：
1. 顯示在標註工具的預覽面板中
2. 自動填入到 "Keywords" 欄位（如果欄位為空）

**實現邏輯：**

#### 1. ImageAnnotation 組件

```typescript
// 新增 Props
interface Props {
  imageUri: string;
  onAnnotationsChange: (boxes: BoundingBox[]) => void;
  initialAnnotations?: BoundingBox[];
  onOCRPreview?: (text: string) => void; // 新增：OCR 預覽回調
}

// 新增 State
const [ocrPreviewText, setOCRPreviewText] = useState<string>('');
const [isOCRProcessing, setIsOCRProcessing] = useState(false);

// 新增函數：快速 OCR
const performQuickOCR = async (uri: string) => {
  setIsOCRProcessing(true);
  setOCRPreviewText('🔍 識別中...');
  
  try {
    const { extractTextFromImage } = await import('../../services/ocr');
    const result = await extractTextFromImage(uri);
    
    setOCRPreviewText(result.fullText || '未識別到文字');
    
    if (onOCRPreview && result.fullText) {
      onOCRPreview(result.fullText);
    }
  } catch (error) {
    console.error('[ImageAnnotation] Quick OCR failed:', error);
    setOCRPreviewText('識別失敗');
  } finally {
    setIsOCRProcessing(false);
  }
};
```

#### 2. 觸發時機

在 `PanResponder.onPanResponderRelease` 中，當用戶完成標註時：

```typescript
if (relativeBox.width > 0.01 && relativeBox.height > 0.01) {
  const newAnnotations = [...annotations, relativeBox];
  setAnnotations(newAnnotations);
  
  setTimeout(async () => {
    onAnnotationsChange(newAnnotations);
    
    // 立即觸發 OCR 預覽
    if (onOCRPreview) {
      await performQuickOCR(imageUri);
    }
  }, 0);
}
```

#### 3. UI 顯示

```tsx
{/* OCR 預覽面板 */}
{ocrPreviewText && (
  <View style={styles.ocrPreview}>
    {isOCRProcessing ? (
      <Text style={styles.ocrPreviewText}>🔍 識別中...</Text>
    ) : (
      <>
        <Text style={styles.ocrPreviewLabel}>📝 識別結果：</Text>
        <Text style={styles.ocrPreviewText} numberOfLines={2}>
          {ocrPreviewText}
        </Text>
      </>
    )}
  </View>
)}
```

#### 4. AddCacheItemScreen 整合

```typescript
// 新增 State
const [ocrPreviewText, setOCRPreviewText] = React.useState('');

// OCR 預覽回調
const handleOCRPreview = React.useCallback((text: string) => {
  console.log('[AddCache] OCR preview:', text);
  setOCRPreviewText(text);
  
  // 自動填入到 keywords 欄位
  if (text && !keywords) {
    setKeywords(text.substring(0, 100)); // 限制長度
  }
}, [keywords]);

// 傳遞給 ImageAnnotation
<ImageAnnotation
  imageUri={selectedImage}
  onAnnotationsChange={handleAnnotationsChange}
  onOCRPreview={handleOCRPreview} // 新增
  initialAnnotations={imageAnnotations}
/>
```

---

## 🧪 測試步驟

### 步驟 1：重新啟動 Expo
```bash
# 停止所有 Expo 進程
pkill -f expo
lsof -ti:8081 | xargs kill -9

# 清除緩存並重啟
CI=false npx expo start --clear
```

### 步驟 2：測試即時 OCR

1. **選擇圖片**：在 "Add to Cache" 畫面，點擊 "📸 選擇圖片"
2. **開始標註**：點擊 "✏️ 開始標註" 按鈕
3. **圈選文字**：用手指在圖片上圈出包含文字的區域
4. **觀察預覽**：
   - 標註完成後，頂部應該立即出現 **藍色 OCR 預覽面板**
   - 顯示 "🔍 識別中..." → "📝 識別結果：[文字]"
5. **檢查自動填入**：
   - 向下滾動到 "Keywords" 欄位
   - 如果欄位為空，應該自動填入識別的文字
   - 藍色提示框顯示 "💡 圖片識別：..."

### 步驟 3：檢查 Console 日誌

應該看到以下日誌流程：

```
[ImageAnnotation] Total annotations: 1
[ImageAnnotation] Quick OCR result: [識別的文字]
[AddCache] OCR preview: [識別的文字]
[AddCache] Annotations updated: 1

[OCR] Extracting text from image: file://...
[OCR] Image URI type: string
[OCR] File info: {"exists":true,"size":123456,...}
[OCR] Reading image as base64...
[OCR] Base64 length: 98765
[OCR] Calling OpenAI Vision API...
[OCR] Raw API response (string): {"fullText":"...","confidence":0.95}
[OCR] Parsed result: {"fullText":"...","confidence":0.95}
```

### 步驟 4：創建卡片

1. **保存到快取**：點擊 "💾 儲存到快取"
2. **前往快取列表**：回到主畫面，點擊 "Cached Items"
3. **創建卡片**：點擊剛才保存的項目
4. **驗證 OCR**：
   - 應該顯示 "🔍 分析中..."
   - **不應該**出現 "未識別到文字" 錯誤
   - 成功生成卡片並顯示 Keywords

---

## 🐛 常見錯誤排查

### 錯誤 1：OCR 預覽面板沒有出現

**檢查項目：**
1. Console 是否有 `[ImageAnnotation] Quick OCR result:` 日誌？
2. 是否正確傳遞了 `onOCRPreview` prop？
3. `ocrPreviewText` state 是否有值？

**解決方法：**
```typescript
// 在 ImageAnnotation 的 performQuickOCR 中添加日誌
console.log('[OCR Preview] Text:', result.fullText);
console.log('[OCR Preview] State update:', ocrPreviewText);
```

### 錯誤 2：Keywords 沒有自動填入

**原因：** `keywords` state 已有值，條件判斷 `if (text && !keywords)` 未通過

**解決方法：** 手動清空 Keywords 欄位後再次標註

### 錯誤 3：仍然顯示 "未識別到文字"

**檢查項目：**
1. `.env` 中的 API Key 是否正確？
2. Console 是否有 OpenAI API 錯誤（401, 429, 500）？
3. 圖片是否包含清晰的文字？

**診斷指令：**
```bash
# 檢查 API Key
cat .env | grep OPENAI

# 查看完整日誌
# 在 Expo 終端中查找 [OCR] 前綴的日誌
```

---

## 📊 功能流程圖

```
用戶圈選標註
    ↓
onPanResponderRelease
    ↓
創建 newAnnotations
    ↓
setTimeout (避免 React 更新衝突)
    ↓
onAnnotationsChange(newAnnotations) → 更新父組件
    ↓
performQuickOCR(imageUri) → 執行 OCR
    ↓
extractTextFromImage(imageUri) → 調用 OpenAI Vision API
    ↓
setOCRPreviewText(result.fullText) → 更新 UI
    ↓
onOCRPreview(result.fullText) → 通知父組件
    ↓
setKeywords(text) → 自動填入 Keywords
```

---

## 🎯 技術亮點

1. **即時反饋**：用戶圈選後立即看到識別結果，無需等到創建卡片階段
2. **自動填入**：識別文字自動填入 Keywords，減少用戶手動輸入
3. **容錯處理**：識別失敗時顯示友好提示，不中斷用戶流程
4. **性能優化**：使用 `useCallback` 避免不必要的函數重建
5. **調試友好**：詳細的 Console 日誌，便於排查問題

---

## 🔄 後續優化方向

1. **區域裁剪 OCR**：未來可以實現真正的區域裁剪（需要獲取圖片實際尺寸）
2. **多語言支持**：在 OCR Prompt 中添加語言檢測
3. **批量標註**：支持同時圈選多個區域，統一識別
4. **離線 OCR**：整合 `expo-ml-kit` 或 `react-native-vision-camera` 實現離線識別
5. **編輯識別結果**：允許用戶手動修正識別錯誤

---

## 📝 相關文件

- `src/components/ImageAnnotation.tsx` - 標註 UI 和即時 OCR
- `src/screens/AddCacheItemScreen.tsx` - 整合 OCR 預覽和自動填入
- `src/services/ocr/ocrService.ts` - OCR 核心邏輯
- `src/services/ai/openaiService.ts` - OpenAI API 調用
- `docs/OCR_TROUBLESHOOTING.md` - OCR 故障排除指南

---

最後更新：2026-02-12
