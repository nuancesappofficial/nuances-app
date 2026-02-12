# OpenAI GPT-4 整合文檔

**實現日期：** 2026-02-11  
**狀態：** ✅ 完成  
**優先級：** P1（增強功能）

---

## 🎯 功能概述

整合 OpenAI GPT-4 API 實現智能文本分析和卡片內容生成，大幅提升學習體驗。

---

## ✅ 已實現功能

### 1️⃣ **智能 AI 服務架構**

**檔案結構：**
```
src/services/ai/
├── index.ts           # 智能路由（自動選擇 API 或 Mock）
├── openaiService.ts   # OpenAI API 整合
└── mockAnalyzer.ts    # Mock AI（後備方案）
```

**特色：**
- ✅ 自動檢測 API Key 配置
- ✅ 有 Key → 使用 OpenAI GPT-4
- ✅ 無 Key → 回退到 Mock AI
- ✅ API 失敗 → 自動回退
- ✅ 無縫切換，用戶無感知

---

### 2️⃣ **OpenAI API 功能**

**檔案：** `src/services/ai/openaiService.ts`

#### **核心功能**

**A. 文本分析（analyzeText）**
```typescript
analyzeText(
  text: string,
  userKeywords?: string,
  learningGoal?: 'ielts' | 'casual' | 'professional'
)
```

**功能：**
- 提取 3-5 個關鍵詞
- 根據學習目標調整選詞策略：
  - `ielts`: 學術詞彙（IELTS Band 6-9）
  - `casual`: 口語、俚語、日常表達
  - `professional`: 商業、專業術語
- 優先考慮用戶提供的關鍵字
- 返回最重要的建議單字

**Prompt 工程：**
```
Role: 英語教學專家
Task: 提取關鍵詞
Context: 學習目標（IELTS/Casual/Professional）
Format: JSON only
```

---

**B. 卡片內容生成（generateCardContent）**
```typescript
generateCardContent(
  targetWord: string,
  originalSentence: string,
  learningGoal?: 'ielts' | 'casual' | 'professional'
)
```

**生成內容：**
- ✅ **定義**（雙語）
  - 繁體中文定義
  - 英文解釋（括號內）
  - 格式：`中文定義 (English definition)`

- ✅ **情境解釋**（繁體中文）
  - 2-3 句詳細說明
  - 使用情境
  - 語義細微差別（nuances）
  - 使用技巧

- ✅ **音標**
  - IPA 國際音標
  - 例如：`/ɪˈfem.ər.əl/`

- ✅ **標籤**
  - 自動推薦相關標籤
  - 例如：IELTS, Band 7, Advanced, Literature

**Prompt 特點：**
- 上下文感知（基於原句）
- 學習目標導向
- 雙語輸出
- JSON 格式化

---

**C. 完整分析（analyzeAndGenerateCard）**
```typescript
analyzeAndGenerateCard(
  text: string,
  userKeywords?: string,
  learningGoal?: 'ielts' | 'casual' | 'professional'
)
```

**流程：**
1. 分析文本 → 提取關鍵詞
2. 選擇最佳單字
3. 生成完整卡片內容
4. 返回所有資訊

**優點：**
- 一次調用完成所有分析
- 節省 API 調用次數
- 上下文一致性

---

### 3️⃣ **錯誤處理與重試**

**重試邏輯：**
- 最多重試 3 次
- 指數退避（1s, 2s, 3s）
- 失敗後自動回退到 Mock AI

**錯誤類型處理：**
```typescript
try {
  // OpenAI API 調用
} catch (error) {
  // 1. 記錄錯誤
  // 2. 如果是 API 調用，回退到 Mock
  // 3. 如果是 Mock，向用戶提示
}
```

**API 錯誤處理：**
- Rate limit exceeded → 重試
- Invalid API key → 回退到 Mock
- Network error → 重試 → 回退
- Timeout → 重試 → 回退

---

### 4️⃣ **UI 整合**

**CreateCardScreen 更新：**

**A. API 狀態指示器**
- ✨ 使用 OpenAI GPT-4 分析（綠色邊框）
- 💡 使用基礎 AI（灰色邊框 + 提示設置 API Key）

**B. 載入提示**
- 真實 API：「🤖 OpenAI GPT-4 分析中...」
- Mock AI：「🤖 AI 分析中...」

**C. 智能選詞**
- 點擊建議關鍵字 → 自動調用 API 重新生成內容
- 實時響應
- 載入動畫

---

## 🔧 配置指南

### 步驟 1：獲取 OpenAI API Key

1. 訪問 [OpenAI Platform](https://platform.openai.com/)
2. 註冊/登入帳號
3. 前往 [API Keys](https://platform.openai.com/api-keys)
4. 點擊「Create new secret key」
5. 複製 API Key（以 `sk-` 開頭）

**⚠️ 重要：**
- 立即保存 API Key（只顯示一次）
- 不要分享給任何人
- 不要提交到 Git

---

### 步驟 2：配置 .env 文件

```bash
# 複製 .env.example
cp .env.example .env

# 編輯 .env 文件
nano .env
```

**添加 API Key：**
```env
# OpenAI API
EXPO_PUBLIC_OPENAI_API_KEY=sk-your-actual-api-key-here
```

---

### 步驟 3：重啟開發伺服器

```bash
# 停止當前伺服器
# Ctrl + C

# 清除快取並重新啟動
npx expo start --clear
```

---

### 步驟 4：驗證配置

1. 打開 App
2. 前往快取列表
3. 點擊「創建卡片」
4. 看到「✨ 使用 OpenAI GPT-4 分析」→ 配置成功！
5. 看到「💡 使用基礎 AI」→ API Key 未配置或無效

---

## 💰 費用估算

### OpenAI GPT-4 定價（2026 年）

**模型：gpt-4o-mini**（推薦）
- Input: $0.15 / 1M tokens
- Output: $0.60 / 1M tokens

**單次分析估算：**
- Input tokens: ~200
- Output tokens: ~400
- 單次成本: ~$0.00027（約 0.008 TWD）

**實際使用：**
- 創建 100 張卡片 ≈ $0.03 USD（約 1 TWD）
- 創建 1000 張卡片 ≈ $0.30 USD（約 9 TWD）

**非常經濟！** 💸

---

## 📊 真實 API vs Mock AI 比較

| 功能 | Mock AI | OpenAI GPT-4 |
|------|---------|--------------|
| **關鍵詞提取** | ✅ 基礎（長度過濾） | ✅ 智能（語義理解） |
| **詞庫大小** | 20+ 詞 | 無限 |
| **定義準確性** | ⚠️ 有限 | ✅ 高準確 |
| **上下文理解** | ❌ 無 | ✅ 深度理解 |
| **多語言支援** | ❌ 僅英文 | ✅ 100+ 語言 |
| **音標生成** | ❌ 不支援 | ✅ 自動生成 |
| **情境解釋** | ⚠️ 通用模板 | ✅ 上下文特定 |
| **學習目標** | ❌ 不支援 | ✅ IELTS/Casual/Pro |
| **成本** | 免費 | ~$0.0003/次 |
| **速度** | 0.5秒 | 2-5秒 |
| **離線** | ✅ | ❌ |

---

## 🎯 Prompt 工程詳解

### A. 文本分析 Prompt

**System Message：**
```
You are an expert English language teacher specialized in vocabulary acquisition. 
Always respond with valid JSON only.
```

**User Prompt 結構：**
```
1. Task Definition（任務定義）
2. Learning Goal Context（學習目標）
3. User Keywords Priority（用戶關鍵字優先）
4. Original Text（原始文本）
5. Output Format（JSON 格式）
```

**範例：**
```
Analyze the following English text and extract 3-5 key vocabulary words 
that a language learner should focus on.

Focus on academic vocabulary suitable for IELTS exam (band 6-9). 
Prioritize formal, academic words.

User has expressed interest in: "ephemeral, fleeting". 
Prioritize these if they appear in the text.

Text: "The ephemeral nature of cherry blossoms reminds us to appreciate 
fleeting moments of beauty in our lives."

Return ONLY a JSON object with this structure:
{
  "keywords": ["ephemeral", "fleeting", "appreciate"],
  "suggestedWord": "ephemeral"
}
```

---

### B. 卡片內容生成 Prompt

**System Message：**
```
You are an expert English language teacher creating vocabulary cards. 
Always provide accurate, context-specific definitions in Traditional Chinese and English. 
Always respond with valid JSON only.
```

**User Prompt 結構：**
```
1. Task（創建卡片）
2. Target Word（目標單字）
3. Context Sentence（原句）
4. Learning Goal（學習目標）
5. Output Requirements（輸出要求）
6. JSON Format（格式）
```

**範例：**
```
Create a comprehensive vocabulary card for the word "ephemeral" 
as it appears in this sentence:

"The ephemeral nature of cherry blossoms reminds us to appreciate fleeting moments."

This word is being learned for IELTS exam preparation. 
Include band level if applicable.

Provide the following information in JSON format:
{
  "definition": "短暫的；轉瞬即逝的 (lasting for a very short time)",
  "contextualExplanation": "用來描述持續時間很短、很快就會消失的事物...",
  "phoneticTranscription": "/ɪˈfem.ər.əl/",
  "tags": ["IELTS", "Band 7", "Advanced", "Literature"]
}
```

---

## 🧪 測試場景

### 測試案例 1：基本流程（有 API Key）

1. **設置 API Key**
2. **創建卡片**
   - 選擇快取項目
   - 看到「OpenAI GPT-4 分析中...」
   - 等待 2-5 秒
   - 自動填入高質量內容
3. **驗證結果**
   - 定義準確（中英雙語）
   - 解釋詳細（2-3 句）
   - 音標正確
   - 標籤相關

---

### 測試案例 2：回退機制（無 API Key）

1. **不設置 API Key**
2. **創建卡片**
   - 看到「使用基礎 AI」提示
   - 立即完成（0.5 秒）
   - 使用 Mock AI 結果
3. **功能正常**
   - 仍可創建卡片
   - 基本功能完整
   - 鼓勵用戶配置 API

---

### 測試案例 3：API 失敗處理

1. **設置無效 API Key**
2. **創建卡片**
   - 嘗試調用 OpenAI
   - 失敗後自動回退
   - 顯示 Mock 結果
3. **用戶體驗**
   - 無錯誤提示
   - 無感知切換
   - 功能繼續工作

---

### 測試案例 4：不同學習目標

**準備測試文本：**
- IELTS: "The ephemeral nature of cherry blossoms..."
- Casual: "I'm totally bummed about missing the concert."
- Professional: "We need to optimize our ROI and streamline the workflow."

**驗證：**
- 關鍵詞選擇不同
- 定義風格不同
- 標籤相關性

---

## 📈 使用數據監控

### 添加日誌

**已實現：**
```typescript
console.log(`🤖 Using ${useRealAPI ? 'OpenAI API' : 'Mock AI'}`);
console.log('✅ OpenAI analysis completed');
console.log('⚠️ OpenAI API not configured, using Mock AI');
console.log('⚠️ OpenAI failed, falling back to Mock AI');
```

**建議添加：**
- API 調用次數統計
- 成本追蹤
- 成功/失敗率
- 平均響應時間

---

## 🔒 安全考慮

### API Key 安全

✅ **已實現：**
- 存儲在 `.env` 文件（不提交到 Git）
- 使用 `EXPO_PUBLIC_` 前綴
- 僅在客戶端使用

⚠️ **注意事項：**
- Expo 會將環境變數打包到 App 中
- 有一定的暴露風險
- 建議個人使用，不要分享給他人

🔐 **生產環境建議：**
- 使用後端代理（未來實現）
- Supabase Edge Functions 調用 OpenAI
- API Key 僅存儲在伺服器端

---

## 🚀 未來優化

### 短期（1-2 週）

1. **用戶 Profile 整合**
   - 從 Profile 讀取 `learning_goal`
   - 自動應用到所有分析
   - 無需手動選擇

2. **批次分析**
   - 一次分析多個單字
   - 節省 API 調用
   - 提高效率

3. **快取機制**
   - 本地快取分析結果
   - 避免重複調用
   - 降低成本

---

### 中期（1 個月）

4. **進階 Prompt**
   - 添加例句生成
   - 同義詞/反義詞
   - 詞語搭配（collocations）
   - 常見錯誤

5. **多語言支援**
   - 支援中文→英文
   - 日文→英文
   - 韓文→英文

6. **圖片 OCR + AI**
   - 使用 Google ML Kit OCR 提取文字
   - 然後用 OpenAI 分析
   - 完整的圖片學習流程

---

### 長期（3 個月）

7. **後端代理**
   - Supabase Edge Functions
   - API Key 安全存儲
   - 用量控制和限額

8. **AI 語音教練**
   - OpenAI Whisper（語音轉文字）
   - GPT-4（發音反饋生成）
   - TTS（語音合成）

9. **個性化學習**
   - 分析用戶學習歷史
   - 推薦適合的詞彙
   - 動態難度調整

---

## 📊 成果總結

**已完成：**
- ✅ OpenAI GPT-4 完整整合
- ✅ 智能回退機制
- ✅ Prompt 工程優化
- ✅ 學習目標支援
- ✅ 錯誤處理和重試
- ✅ UI 狀態指示
- ✅ 文檔完整

**可立即使用：**
1. 設置 OpenAI API Key
2. 重啟 App
3. 創建卡片時看到「OpenAI GPT-4」提示
4. 體驗高質量的 AI 生成內容

**無 API Key 也可用：**
- 自動回退到 Mock AI
- 基本功能完整
- 鼓勵用戶升級

🎉 **OpenAI 整合完成！**

---

## 📝 快速開始檢查清單

- [ ] 獲取 OpenAI API Key
- [ ] 編輯 `.env` 文件
- [ ] 添加 `EXPO_PUBLIC_OPENAI_API_KEY=sk-...`
- [ ] 重啟開發伺服器（`npx expo start --clear`）
- [ ] 在模擬器中重新載入 App（Cmd + R）
- [ ] 創建卡片測試
- [ ] 看到「✨ 使用 OpenAI GPT-4 分析」
- [ ] 驗證生成的內容質量
- [ ] 享受智能學習體驗！ 🚀
