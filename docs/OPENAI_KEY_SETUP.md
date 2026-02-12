# OpenAI API Key 配置指南

**重要：** OCR 圖片識別和智能文本分析需要 OpenAI API Key 才能運作。

---

## 🔑 獲取 OpenAI API Key

### 步驟 1：註冊/登入 OpenAI
1. 前往 https://platform.openai.com/
2. 點擊右上角「Sign up」註冊（或「Log in」登入）
3. 完成註冊流程

### 步驟 2：創建 API Key
1. 登入後，點擊左側選單「API keys」
2. 點擊「+ Create new secret key」
3. 輸入名稱（例如：`Nuances App`）
4. 點擊「Create secret key」
5. **⚠️ 重要：** 立即複製並保存 API Key
   - 格式：`sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - ⚠️ 只會顯示一次！請妥善保存

---

## 📝 配置步驟（Mac）

### 方法 1：使用終端機（推薦）

```bash
# 1. 進入專案目錄
cd /Users/users/vibe_coding_projects/nuances-app

# 2. 複製範例文件
cp .env.example .env

# 3. 使用 nano 編輯器打開 .env 文件
nano .env

# 4. 找到這一行：
# EXPO_PUBLIC_OPENAI_API_KEY=your_openai_api_key

# 5. 將 "your_openai_api_key" 替換成您的實際 Key：
# EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 6. 保存並退出
# 按 Ctrl+O (保存)
# 按 Enter (確認)
# 按 Ctrl+X (退出)
```

### 方法 2：使用 Cursor/VS Code

```bash
# 1. 在 Cursor 中打開專案
# 2. 找到根目錄的 .env.example 文件
# 3. 複製一份，重命名為 .env
# 4. 打開 .env 文件
# 5. 修改這一行：

EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ↑ 替換成您的實際 Key
```

---

## 📂 文件位置

```
nuances-app/
├── .env.example        ← 範例文件（不要修改）
├── .env               ← 實際配置文件（您要編輯的）
└── src/
    └── services/
        └── ai/
            └── openaiService.ts  ← 使用 API Key 的文件
```

---

## ✅ 完整的 .env 文件範例

```env
# Supabase Configuration (可暫時忽略)
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Azure AI Speech Services (可暫時忽略)
EXPO_PUBLIC_AZURE_SPEECH_KEY=your_azure_speech_key
EXPO_PUBLIC_AZURE_SPEECH_REGION=your_azure_region

# OpenAI API (必填！)
EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ↑ 請替換成您的實際 OpenAI API Key

# Environment
NODE_ENV=development
```

---

## 🧪 驗證配置

### 方法 1：檢查文件內容

```bash
# 在終端機執行
cat .env | grep OPENAI

# 應該顯示：
# EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-xxxxxxxx...
```

### 方法 2：在 App 中測試

```
1. 重啟 Expo 開發服務器
   - 終端機按 Ctrl+C 停止
   - 再次執行：npx expo start

2. 在 App 中測試 AI 功能
   - 新增快取 → 輸入文字 → 創建卡片
   - 或上傳圖片 → 標註 → 創建卡片

3. 查看分析狀態
   - 應該顯示：「🤖 OpenAI GPT-4 分析中...」
   - 如果顯示「🤖 基礎 AI」，表示 Key 未配置
```

---

## ❌ 常見錯誤

### 錯誤 1：「基礎 AI」而非「OpenAI GPT-4」
**原因：** API Key 未配置或無效

**解決方案：**
```bash
# 1. 確認 .env 文件存在
ls -la | grep .env

# 2. 檢查 Key 格式
cat .env | grep OPENAI
# 必須是：EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-...
# 不能有空格、引號或其他符號

# 3. 重啟 Expo
# Ctrl+C 停止，再 npx expo start
```

---

### 錯誤 2：「Invalid API Key」
**原因：** API Key 錯誤或已失效

**解決方案：**
1. 回到 https://platform.openai.com/api-keys
2. 檢查 Key 狀態
3. 如果失效，創建新的 Key
4. 更新 .env 文件
5. 重啟 Expo

---

### 錯誤 3：「Insufficient credits」
**原因：** OpenAI 帳戶餘額不足

**解決方案：**
1. 前往 https://platform.openai.com/settings/organization/billing
2. 添加付款方式
3. 充值餘額（建議 $5-10 USD）

---

## 💰 費用說明

### GPT-4o-mini 定價（2026）
- **輸入：** $0.15 / 1M tokens
- **輸出：** $0.60 / 1M tokens
- **Vision (圖片)：** 約 $0.002 / 圖片

### 預估使用量（每月 100 次操作）
| 功能 | 頻率 | 預估成本 |
|------|------|---------|
| 文本分析 | 50 次 | ~$0.08 |
| 卡片生成 | 50 次 | ~$0.05 |
| OCR 圖片識別 | 30 次 | ~$0.06 |
| **總計** | | **~$0.19** |

💡 **結論：** 個人使用非常便宜，約 $5 USD 可用數月。

---

## 🔒 安全注意事項

### ✅ 應該做的事
- ✅ 將 `.env` 加入 `.gitignore`（已完成）
- ✅ 不要將 API Key 提交到 Git
- ✅ 不要在程式碼中硬編碼 Key
- ✅ 定期輪換 API Key

### ❌ 不應該做的事
- ❌ 不要分享 API Key 給他人
- ❌ 不要在公開的程式碼倉庫中提交 `.env`
- ❌ 不要截圖包含 API Key 的內容

---

## 🆘 需要幫助？

### 檢查清單
- [ ] `.env` 文件已創建
- [ ] OpenAI API Key 已填入
- [ ] Key 格式正確（`sk-proj-...`）
- [ ] 已重啟 Expo 開發服務器
- [ ] OpenAI 帳戶有餘額
- [ ] 網絡連接正常

### 仍然有問題？
```bash
# 1. 查看完整的 .env 內容
cat .env

# 2. 測試 API 連接
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"

# 3. 查看 App 的 Console 日誌
# Expo App → 搖晃設備 → Debug Remote JS
# Chrome DevTools → Console
```

---

## 📚 相關文檔

- OpenAI API 文檔：https://platform.openai.com/docs
- API Key 管理：https://platform.openai.com/api-keys
- 使用量追蹤：https://platform.openai.com/usage
- 定價：https://openai.com/api/pricing/

---

**最後更新：** 2026-02-11  
**當前使用模型：** GPT-4o-mini
