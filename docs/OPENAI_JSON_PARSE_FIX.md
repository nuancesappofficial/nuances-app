# OpenAI JSON 解析錯誤修復

## 📌 問題描述

### 錯誤現象
```
ERROR  Error generating card content with OpenAI: [SyntaxError: JSON Parse error: Unexpected character: `]
ERROR  Analysis error: [SyntaxError: JSON Parse error: Unexpected character: `]
```

### 出現時機
- OCR 識別**完全正常**，成功提取了圖片文字
- 錯誤發生在 **OpenAI 分析階段**（`analyzeText` 或 `generateCardContent`）
- 特別是當 OCR 文字較長時（例如整個 IELTS Writing Task）

### 根本原因

1. **Markdown 格式包裹**：OpenAI 有時返回帶有 markdown 格式的 JSON：
   ```
   ```json
   {"keywords": [...], "suggestedWord": "..."}
   ```
   ```
   這導致 `JSON.parse()` 失敗

2. **文字過長**：OCR 提取的完整文本（例如 450+ 字符）可能超出 prompt 的有效處理範圍，導致 OpenAI 返回格式不正確

---

## ✅ 修復方案

### 1. 清理 Markdown 格式

在 `analyzeText` 和 `generateCardContent` 中，添加響應清理邏輯：

```typescript
// 清理響應：移除可能的 markdown 格式
let cleanedResponse = response.trim();

// 移除 markdown code block 標記
if (cleanedResponse.startsWith('```')) {
  cleanedResponse = cleanedResponse.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
}

console.log('[OpenAI] Cleaned response:', cleanedResponse);

const result = JSON.parse(cleanedResponse);
```

### 2. 限制輸入文字長度

在 prompt 中截斷過長的文本：

```typescript
// analyzeText
Text: "${text.substring(0, 500)}${text.length > 500 ? '...' : ''}"

// generateCardContent
"${originalSentence.substring(0, 300)}${originalSentence.length > 300 ? '...' : ''}"
```

### 3. 強化 System Prompt

明確要求 OpenAI 返回純 JSON，不要 markdown：

```typescript
{
  role: 'system',
  content: 'You are an expert English language teacher. Always respond with valid JSON only, without markdown formatting or backticks.',
}
```

### 4. 改進錯誤日誌

添加原始響應輸出，便於調試：

```typescript
catch (error) {
  console.error('Error generating card content with OpenAI:', error);
  console.error('[OpenAI] Raw response was:', response?.substring(0, 500));
  throw error;
}
```

---

## 🧪 測試驗證

### 測試場景 1：短文本（正常場景）
✅ **輸入**：`"Opening project..."`
✅ **預期**：成功提取 keywords 並生成卡片

### 測試場景 2：長文本（IELTS Task）
✅ **輸入**：`"WRITING TASK 2\n\nYou should spend about 40 minutes..."`（450+ 字符）
✅ **預期**：自動截斷為前 500 字符，成功分析
✅ **修復前**：JSON Parse error
✅ **修復後**：正常生成卡片

### 測試場景 3：Markdown 格式響應
✅ **OpenAI 返回**：` ```json\n{"keywords": ...}\n``` `
✅ **預期**：自動清理 markdown 標記，成功解析
✅ **修復前**：JSON Parse error
✅ **修復後**：正常解析

---

## 📊 日誌對比

### 修復前（失敗）
```
LOG  🤖 Using OpenAI API for analysis
ERROR  Error generating card content with OpenAI: [SyntaxError: JSON Parse error: Unexpected character: `]
LOG  ⚠️ OpenAI failed, falling back to Mock AI
```

### 修復後（成功）
```
LOG  🤖 Using OpenAI API for analysis
LOG  [OpenAI] Cleaned response for analyzeText: {"keywords":["walking","health","measures"],"suggestedWord":"measures"}
LOG  [OpenAI] Cleaned response for generateCardContent: {"definition":"措施；方法 (steps or actions taken to achieve a goal)",...}
LOG  ✅ OpenAI analysis completed
```

---

## 🎯 修復文件列表

- ✅ `src/services/ai/openaiService.ts`
  - `analyzeText()` 函數
  - `generateCardContent()` 函數

---

## 🔍 未來優化方向

### 1. 智能文本摘要
對於超長文本（500+ 字符），在發送給 OpenAI 前先進行智能摘要：
- 提取前 3 句
- 移除重複內容
- 保留關鍵信息

### 2. Retry 機制
當 JSON 解析失敗時，自動重試並調整 prompt：
```typescript
if (JSON.parse 失敗) {
  retry with prompt: "Return ONLY raw JSON, no formatting"
}
```

### 3. Response Validation
在解析前驗證響應格式：
```typescript
function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}
```

### 4. Fallback to Mock AI
當 OpenAI 連續失敗 3 次時，自動切換到 Mock AI 並通知用戶

---

## 📝 相關文件

- `src/services/ai/openaiService.ts` - OpenAI API 調用核心
- `src/services/ai/mockAI.ts` - Mock AI fallback
- `src/screens/CreateCardScreen.tsx` - 調用 AI 分析的入口
- `docs/OCR_REALTIME_GUIDE.md` - OCR 即時預覽指南

---

## 🎉 結論

**OCR 功能完全正常！** 問題只出現在 OpenAI 文本分析階段的 JSON 解析。

通過以下修復：
1. ✅ 清理 Markdown 格式
2. ✅ 限制輸入文字長度
3. ✅ 強化 System Prompt
4. ✅ 改進錯誤日誌

現在系統可以穩定處理各種長度的 OCR 文本，並正確生成學習卡片。

---

最後更新：2026-02-12
