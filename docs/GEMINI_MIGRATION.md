# OpenAI → Gemini API 遷移文檔

**遷移日期：** 2026-02-15  
**狀態：** ✅ 完成  
**優先級：** P0（核心功能變更）

---

## 🎯 遷移目標

將所有 AI 功能從 OpenAI GPT API 遷移到 **Google Gemini 1.5 Flash API**，以享受更高的免費配額和更快的響應速度。

---

## ✅ 完成的變更

### 1️⃣ **環境變數更新**

**檔案：** `.env`

```diff
- # OpenAI API
- EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-...

+ # Google Gemini API
+ # 免費方案限制：Flash-Lite (RPD: 1,000, RPM: 15) | Flash (RPD: 250, RPM: 10)
+ EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
```

**操作步驟：**
1. 前往 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 登入 Google 帳號並建立 API Key
3. 將 Key 貼到 `.env` 檔案中的 `EXPO_PUBLIC_GEMINI_API_KEY`

---

### 2️⃣ **新建 Gemini 服務層**

**檔案：** `src/services/ai/geminiService.ts`（新建）

**核心功能：**
- ✅ `callGemini()` - 統一的 Gemini API 調用函數
- ✅ `analyzeText()` - 文本關鍵字提取（3-5 個關鍵詞）
- ✅ `generateCardContent()` - 單字卡片內容生成（定義、解釋、音標、標籤）
- ✅ `analyzeAndGenerateCard()` - 完整分析流程
- ✅ `isGeminiConfigured()` - 檢查 API Key 是否配置

**重要特性：**
- 使用 `gemini-1.5-flash` 模型（免費方案配額最高：RPD 1,500, RPM 15）
- 自動格式轉換（OpenAI 格式 → Gemini 格式）
- 支援三種學習目標：`ielts` / `casual` / `professional`
- 自動重試機制（最多 3 次，指數退避）
- JSON 清理邏輯（移除 markdown 代碼塊）

---

### 3️⃣ **更新主要服務文件**

#### **A. `src/services/ai/index.ts`**
```diff
- import { isOpenAIConfigured, analyzeAndGenerateCard as openaiAnalyze } from './openaiService';
+ import { isGeminiConfigured, analyzeAndGenerateCard as geminiAnalyze } from './geminiService';

- const useRealAPI = isOpenAIConfigured();
+ const useRealAPI = isGeminiConfigured();

- console.log(`🤖 Using ${useRealAPI ? 'OpenAI API' : 'Mock AI'} for analysis`);
+ console.log(`🤖 Using ${useRealAPI ? 'Gemini API' : 'Mock AI'} for analysis`);
```

**變更內容：**
- ✅ 所有 `openaiService` import 改為 `geminiService`
- ✅ 所有 `isOpenAIConfigured()` 改為 `isGeminiConfigured()`
- ✅ 日誌訊息更新為 "Gemini API"

---

#### **B. `src/services/ai/analysis.ts`**
```diff
- const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
+ const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

- const response = await fetch('https://api.openai.com/v1/chat/completions', {
+ const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
-     'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
-     model: 'gpt-3.5-turbo',
-     messages: [...],
+     contents: [{
+       role: 'user',
+       parts: [{ text: prompt }]
+     }],
+     generationConfig: { ... },
    }),
  });
```

**變更內容：**
- ✅ API endpoint 改為 Gemini
- ✅ 請求格式改為 Gemini 格式（`contents` 代替 `messages`）
- ✅ 移除 Authorization header（Gemini 使用 URL 參數傳遞 Key）

---

#### **C. `src/services/ocr/ocrService.ts`**
```diff
- import { isOpenAIConfigured, callOpenAI } from '../ai/openaiService';
+ import { isGeminiConfigured, callGemini } from '../ai/geminiService';

export async function analyzeTextWithAI(payload: ContextPayload): Promise<AIAnalysisResult> {
-   if (!isOpenAIConfigured()) {
-     console.log('[OCR] OpenAI not configured, using mock analysis');
+   if (!isGeminiConfigured()) {
+     console.log('[OCR] Gemini not configured, using mock analysis');
      ...
    }

-   const response = await callOpenAI([...], { ... });
+   const response = await callGemini([...], { ... });
}
```

**變更內容：**
- ✅ OCR 文本分析改用 Gemini API
- ✅ 保留完整的錯誤處理和 Mock 回退機制

---

## 📊 API 配額對比

| 維度 | OpenAI (gpt-3.5-turbo) | Gemini 1.5 Flash | Gemini 1.5 Flash-Lite |
|------|------------------------|-------------------|------------------------|
| **RPM (每分鐘請求)** | 3-5 (免費) | 15 | 15 |
| **RPD (每日請求)** | ~100 (免費) | 1,500 | 1,500 |
| **TPM (每分鐘 Token)** | ~40,000 | 1,000,000 | 1,000,000 |
| **上下文長度** | 4K tokens | 1M tokens | 1M tokens |
| **成本** | $0.50/1M tokens | **免費** | **免費** |

**結論：** Gemini 免費方案的配額是 OpenAI 免費方案的 **15 倍**，且響應速度更快。

---

## 🚀 使用方式

### 開發測試

1. **配置 API Key：**
   ```bash
   # .env
   EXPO_PUBLIC_GEMINI_API_KEY=AIzaSy...
   ```

2. **重新啟動開發伺服器：**
   ```bash
   npm start
   ```

3. **測試 AI 功能：**
   - 掃描圖片 → 選擇文字 → 查看 AI 關鍵字選詞
   - 製作單字卡 → 確認 AI 生成的定義、解釋、音標

---

### 生產部署

**EAS Build：**
```bash
# 設定環境變數（Secrets）
eas secret:create --scope project --name EXPO_PUBLIC_GEMINI_API_KEY --value "AIzaSy..."

# 重新建置
eas build --platform all
```

---

## ⚠️ 注意事項

### 1. **配額限制**
- 免費方案：每天 1,500 次請求（Flash/Flash-Lite）
- 如果超過限制，API 會回傳 `429 Too Many Requests`
- App 會自動回退到 Mock AI，不會崩潰

### 2. **響應格式差異**
- Gemini 的 JSON 響應有時會包含 markdown 代碼塊（已處理）
- 自動清理邏輯：`cleanedResponse.replace(/^```(?:json)?\n?/, '')`

### 3. **兼容性**
- 所有原有的 OpenAI 功能邏輯保持不變
- `openaiService.ts` 檔案保留（可刪除或重命名為 `.bak`）

---

## 🧪 測試清單

- ✅ 文字掃描 → AI 關鍵字提取
- ✅ 單字卡生成 → AI 定義、解釋、音標
- ✅ 學習目標切換（IELTS / Casual / Professional）
- ✅ API Key 未配置 → 自動回退到 Mock AI
- ✅ API 失敗 → 自動重試 3 次
- ✅ 配額超限 (429) → 回退到 Mock AI

---

## 📚 相關文件

- [Gemini API 官方文檔](https://ai.google.dev/gemini-api/docs)
- [Gemini API 免費配額說明](https://ai.google.dev/pricing)
- [OpenAI → Gemini 遷移指南](https://ai.google.dev/gemini-api/docs/migrate-from-openai)

---

## 🔄 回滾方式（如需）

如需回滾到 OpenAI：

1. **還原 `.env`：**
   ```bash
   EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-...
   ```

2. **還原服務文件：**
   ```bash
   git checkout HEAD -- src/services/ai/index.ts
   git checkout HEAD -- src/services/ai/analysis.ts
   git checkout HEAD -- src/services/ocr/ocrService.ts
   ```

3. **刪除 Gemini 服務：**
   ```bash
   rm src/services/ai/geminiService.ts
   ```

---

**總結：** 所有 AI 功能已成功從 OpenAI 遷移到 Gemini API，享受更高配額、更快速度、零成本！🎉
