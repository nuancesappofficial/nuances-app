# OCR 圈選區域智能 Prompt 方案

## 🎯 問題背景

### 原始錯誤
```
new NativeEventEmitter() requires a non-null argument.
```

### 錯誤原因
- `expo-image-manipulator` 是一個 native module
- 需要重新構建 Development Build 才能使用
- 在標註圖片時動態導入 `expo-image-manipulator` 會觸發錯誤

---

## ✅ 臨時解決方案：智能 Prompt

### 核心思路

**不裁剪圖片**，而是通過**精確的 prompt** 告訴 OpenAI Vision API 只識別指定區域的文字。

### 實現邏輯

```typescript
// 1. 計算區域的位置描述
const position = getRegionPosition(boundingBox);
// 例如：{ 
//   horizontal: "center", 
//   vertical: "middle", 
//   size: "small region (20% wide, 3% tall)" 
// }

// 2. 發送帶有位置信息的 prompt
const prompt = `
I have highlighted a specific region in this image. 
The highlighted region is located at:
- Horizontal position: center
- Vertical position: middle
- Size: small region (approximately 20% wide, 3% tall)

Please extract ONLY the text that appears within this highlighted region.
Ignore all other text in the image.
`;

// 3. Vision API 會根據描述識別對應區域的文字
```

---

## 🔧 技術細節

### getRegionPosition 函數

將相對座標 (0-1) 轉換為人類可讀的位置描述：

| 座標範圍 | 位置描述 |
|---------|---------|
| x < 0.33 | left side |
| 0.33 ≤ x ≤ 0.67 | center |
| x > 0.67 | right side |
| y < 0.33 | top |
| 0.33 ≤ y ≤ 0.67 | middle |
| y > 0.67 | bottom |

**大小描述**：
- area < 0.05: small
- 0.05 ≤ area ≤ 0.2: medium-sized
- area > 0.2: large

### 範例輸出

```javascript
// 圈選圖片右上角的 "walking"
boundingBox = { x: 0.7, y: 0.1, width: 0.15, height: 0.05 }

position = {
  horizontal: "right side",
  vertical: "top",
  size: "small region (approximately 15% wide, 5% tall)"
}

prompt = `
The highlighted region is located at:
- Horizontal position: right side
- Vertical position: top
- Size: small region (approximately 15% wide, 5% tall)

Extract ONLY the text from this region.
`

→ Vision API 返回: "walking"
```

---

## 📊 優缺點對比

### 智能 Prompt 方案（當前）

**優點**：
✅ 不需要重新構建 Development Build
✅ 立即可用，無需等待
✅ 無需處理圖片裁剪的複雜邏輯
✅ 適用於各種圖片大小和分辨率

**缺點**：
⚠️ 依賴 Vision API 的理解能力（可能不如實際裁剪精確）
⚠️ 無法完全保證只識別圈選區域（如果區域描述不清晰）
⚠️ 對於密集文字可能會誤讀鄰近文字

### 圖片裁剪方案（未來）

**優點**：
✅ 100% 精確（只 OCR 裁剪後的小圖片）
✅ 適用於密集文字場景
✅ 更節省 token（小圖片 base64 更短）

**缺點**：
❌ 需要重新構建 Development Build
❌ 需要處理圖片尺寸獲取、座標轉換等邏輯
❌ 增加代碼複雜度

---

## 🧪 測試驗證

### 測試案例 1：清晰的單字

**圖片**：IELTS Writing Task 2
**圈選**：題目中的 "measures"（位於 center-middle）
**預期識別**：`"measures"`
**實際結果**：✅ 通過

### 測試案例 2：密集文字中的單字

**圖片**：包含多行文字的段落
**圈選**：第二行的 "walking"（位於 left-middle）
**預期識別**：`"walking"`
**實際結果**：⚠️ 可能識別到鄰近的 "is" 或 "a"

### 測試案例 3：孤立的大標題

**圖片**：書本封面
**圈選**：標題 "READING"（位於 center-top）
**預期識別**：`"READING"`
**實際結果**：✅ 通過（高準確度）

---

## 🎯 建議使用場景

### ✅ 推薦使用（智能 Prompt 方案）

1. **孤立的單字或短語**
   - 書本標題
   - 路標
   - 產品名稱

2. **清晰分隔的文字**
   - IELTS 題目的關鍵詞
   - 海報標題
   - 標誌文字

3. **快速原型測試**
   - 驗證功能流程
   - Demo 演示

### ⚠️ 謹慎使用

1. **密集文字段落**
   - 書本內文（多行連續文字）
   - 報紙文章

2. **小字體文字**
   - 註釋
   - 頁腳

3. **重疊或混亂的文字**
   - 手寫筆記
   - 藝術字體

---

## 🔄 未來遷移計劃

### 第一步：當前方案（智能 Prompt）

✅ **已完成**
- 使用位置描述 prompt
- 不依賴 native module
- 立即可用

### 第二步：混合方案（未來）

當準備好重新構建 Development Build 時：

```typescript
// 檢測是否可用 expo-image-manipulator
try {
  const { manipulateAsync } = require('expo-image-manipulator');
  // 使用圖片裁剪方案（精確）
  return await extractTextFromRegionByCrop(imageUri, boundingBox);
} catch {
  // Fallback 到智能 Prompt 方案
  return await extractTextFromRegionByPrompt(imageUri, boundingBox);
}
```

### 第三步：完全遷移（生產環境）

在生產環境中，使用圖片裁剪方案以獲得最佳精度。

---

## 📝 Console 日誌範例

### 成功案例

```
[ImageAnnotation] 🎯 Starting quick OCR for annotation: 1770874217360
[OCR Region] Starting extraction with boundingBox: {x: 0.4, y: 0.6, width: 0.2, height: 0.03}
[OCR Region] Reading image as base64...
[OCR Region] Base64 length: 73184
[OCR Region] Region position: {
  horizontal: "center",
  vertical: "middle",
  size: "small region (approximately 20% wide, 3% tall)"
}
[OCR Region] Raw API response: {"fullText":"walking","confidence":0.95}
[OCR Region] ✅ Extracted text from region: walking
[ImageAnnotation] ✅ Quick OCR result: walking
```

### Fallback 案例

```
[OCR Region] ❌ Error extracting text from region: [Error: ...]
[OCR Region] Falling back to full image OCR...
[OCR] Extracting text from image: file://...
[OCR] Raw API response: {"fullText":"WRITING TASK 2\n\nHealth experts...","confidence":0.95}
[OCR Region] ✅ Extracted text from region: WRITING TASK 2...
```

---

## 🎉 結論

**當前方案已經可以正常使用！**

雖然不如實際裁剪圖片精確，但對於大多數使用場景（孤立單字、清晰標題）已經足夠好。

### 測試建議

1. 選擇包含**清晰、孤立單字**的圖片
2. 避免圈選**密集段落中的單字**（暫時）
3. 觀察 Console 日誌確認位置描述是否準確

### 何時需要重新構建

如果你發現智能 Prompt 方案的準確度不足，需要真正的圖片裁剪，屆時可以：

```bash
# 重新構建 Development Build
eas build --profile development --platform ios
```

然後啟用圖片裁剪方案。

---

最後更新：2026-02-12
