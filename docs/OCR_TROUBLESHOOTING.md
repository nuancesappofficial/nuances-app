# OCR 功能故障排除指南

**問題：** Image OCR 沒有正常運作

---

## 🔍 診斷步驟

### 1. 檢查 Console 日誌

**在 Chrome DevTools 中查看：**
```
1. 在 Expo App 中搖晃設備
2. 選擇「Debug Remote JS」
3. Chrome 打開 http://localhost:8081/debugger-ui
4. 按 F12 打開 Console
```

**應該看到的日誌：**
```
[CreateCard] Performing OCR on image
[CreateCard] Image path: file:///path/to/image.jpg
[CreateCard] Extracting text from 2 annotations  (或 full image)
[OCR] Extracting text from image: file:///...
[OCR] Extraction complete: {fullText: "...", confidence: 0.95}
[CreateCard] Extracted text from image: ...
```

---

## ❌ 常見錯誤及解決方案

### 錯誤 1：「OpenAI not configured」
**症狀：** Console 顯示 `[OCR] OpenAI not configured, using mock OCR`

**原因：** OpenAI API Key 未配置或讀取失敗

**解決方案：**
```bash
# 1. 檢查 .env 文件
cat .env | grep OPENAI

# 應該顯示：
# EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-...

# 2. 確保不是 "your_openai_api_key"
# 3. 重啟 Expo
pkill -f "expo start"
npx expo start --clear
```

---

### 錯誤 2：「Invalid API Key」或「Incorrect API provided」
**症狀：** OCR 調用失敗，錯誤信息顯示 API Key 無效

**原因：** API Key 格式錯誤或已過期

**解決方案：**
```bash
# 1. 檢查 Key 格式（不應有空格、引號）
cat .env | grep OPENAI

# 正確格式：
EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-abc123...

# 錯誤格式：
EXPO_PUBLIC_OPENAI_API_KEY = "sk-proj-..."  ❌
EXPO_PUBLIC_OPENAI_API_KEY='sk-proj-...'    ❌

# 2. 驗證 Key 有效性
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"

# 3. 如果失效，到 OpenAI 網站重新生成
# https://platform.openai.com/api-keys
```

---

### 錯誤 3：「Error reading file」或「File not found」
**症狀：** 無法讀取圖片文件

**原因：** 圖片路徑無效或權限問題

**解決方案：**
1. **檢查圖片是否成功上傳：**
   - 在 AddCacheItemScreen 上傳後
   - 確認圖片預覽正常顯示
   - Console 應顯示完整路徑

2. **檢查權限：**
   - iOS: 確認相機和相簿權限已授予
   - 設定 → Nuances → 權限

3. **測試路徑：**
   ```javascript
   // 在 Console 中檢查
   console.log('Image URI:', cachedItem.imageStoragePath);
   // 應該是：file:///var/mobile/...
   ```

---

### 錯誤 4：「Model does not support vision」
**症狀：** OpenAI API 返回模型不支持 vision 的錯誤

**原因：** 使用了不支持 vision 的模型

**解決方案：**
確保使用 `gpt-4o-mini` 或 `gpt-4o`（支持 vision）

檢查 `src/services/ocr/ocrService.ts`：
```typescript
const response = await callOpenAI(
  [...],
  {
    model: 'gpt-4o-mini', // ← 確保是這個
    temperature: 0.3,
  }
);
```

---

### 錯誤 5：「JSON parse error」
**症狀：** OCR 返回的不是有效 JSON

**原因：** OpenAI 返回格式不符合預期

**解決方案：**
1. **檢查 Console 日誌：**
   ```
   [OCR] Raw response: ...
   ```

2. **可能的情況：**
   - 圖片中沒有文字 → 返回空結果
   - API 返回錯誤信息而非 JSON

3. **臨時修復：**
   編輯 `src/services/ocr/ocrService.ts`：
   ```typescript
   try {
     const result = JSON.parse(response);
     return {
       fullText: result.fullText || '',
       confidence: result.confidence || 0.9,
     };
   } catch (parseError) {
     console.warn('[OCR] JSON parse failed, using raw response');
     // 直接使用原始響應作為文本
     return {
       fullText: response,
       confidence: 0.7,
     };
   }
   ```

---

### 錯誤 6：「Network request failed」
**症狀：** 無法連接 OpenAI API

**原因：** 網絡問題或防火牆阻擋

**解決方案：**
1. **檢查網絡連接：**
   ```bash
   curl https://api.openai.com/v1/models
   ```

2. **檢查代理設置：**
   - 如果使用 VPN，嘗試關閉
   - 如果在企業網絡，檢查防火牆

3. **增加超時時間：**
   編輯 `src/services/ai/openaiService.ts`：
   ```typescript
   const response = await fetch(OPENAI_API_URL, {
     method: 'POST',
     headers: {...},
     body: {...},
     signal: AbortSignal.timeout(30000), // 30秒超時
   });
   ```

---

## 🧪 測試 OCR 功能

### 測試步驟 1：簡單文本圖片

```
1. 創建一個包含清晰英文文字的圖片
   - 使用 Keynote/PowerPoint 製作
   - 黑色文字，白色背景
   - 大字體（至少 24pt）
   - 內容：「Hello World」

2. 上傳到 App
   - 快取 → 新增 → 圖片
   - 上傳剛才的圖片

3. 不標註，直接保存

4. 創建卡片
   - 應該自動識別 "Hello World"

5. 檢查 Console
   - 應該看到完整的 OCR 流程日誌
```

### 測試步驟 2：標註測試

```
1. 使用包含多個單字的圖片（菜單、海報等）

2. 上傳後開啟標註工具

3. 圈出一個單字（例如："Coffee"）

4. 保存 → 創建卡片

5. 應該只識別圈出的單字

6. 檢查 Console：
   [CreateCard] Extracting text from 1 annotations
   [OCR] Extraction complete: {fullText: "Coffee", ...}
```

---

## 📊 預期行為

### 成功的 OCR 流程：

```
用戶上傳圖片
    ↓
(可選) 標註關鍵區域
    ↓
點擊「創建卡片」
    ↓
顯示：「🤖 OpenAI GPT-4 分析中...」
    ↓
OCR 提取文字（3-5秒）
    ↓
AI 分析並生成定義
    ↓
顯示生成的卡片內容
```

### Console 日誌範例：

```
[CreateCard] Performing OCR on image
[CreateCard] Image path: file:///var/mobile/.../image.jpg
[CreateCard] Extracting text from full image
[OCR] Extracting text from image: file:///...
[OCR] Extraction complete: {
  "fullText": "Coffee Menu\nEspresso $3.50\nLatte $4.50",
  "confidence": 0.95
}
[CreateCard] Extracted text from image: Coffee Menu Espresso $3.50 Latte $4.50
[AI] Analyzing text: Coffee Menu Espresso...
[AI] Generated definition for: Espresso
```

---

## 🔧 手動測試 API

如果懷疑 OCR 功能有問題，可以直接測試 OpenAI Vision API：

```bash
# 1. 準備圖片（轉 base64）
base64 /path/to/your/image.jpg > image_base64.txt

# 2. 測試 API（替換 YOUR_API_KEY）
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Extract all text from this image"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64,'"$(cat image_base64.txt)"'"
            }
          }
        ]
      }
    ],
    "max_tokens": 1000
  }'
```

---

## 📝 需要提供的信息

如果以上方法都無法解決，請提供：

1. **完整的 Console 日誌**（包含錯誤）
2. **測試圖片**（如果可能）
3. **.env 文件內容**（隱藏 API Key 後幾位）
4. **App 版本和設備信息**
5. **OCR 是在有標註還是無標註的情況下失敗？**

---

**最後更新：** 2026-02-11  
**相關文檔：** `OPENAI_KEY_SETUP.md`, `IMAGE_ANNOTATION_GUIDE.md`
