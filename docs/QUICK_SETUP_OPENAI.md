# OpenAI GPT-4 快速設置指南

⏱️ **5 分鐘內完成**

---

## 🚀 選項 A：使用 OpenAI（推薦）

### 步驟 1：獲取 API Key

1. 前往 https://platform.openai.com/api-keys
2. 登入/註冊
3. 點擊「Create new secret key」
4. 複製 API Key（`sk-...`開頭）

### 步驟 2：配置

```bash
# 編輯 .env 文件
nano .env

# 添加這一行（替換為你的 API Key）
EXPO_PUBLIC_OPENAI_API_KEY=sk-your-actual-key-here

# 保存並退出（Ctrl + X → Y → Enter）
```

### 步驟 3：重啟

```bash
# 停止當前開發伺服器（如果正在運行）
# 按 Ctrl + C

# 重新啟動
npx expo start --clear
```

### 步驟 4：測試

1. 在模擬器中重新載入（Cmd + R）
2. 前往快取頁面
3. 點擊「創建卡片」
4. 看到「✨ 使用 OpenAI GPT-4 分析」 → 成功！

---

## 💡 選項 B：使用基礎 AI（免費）

**不需要任何設置！**

- App 會自動使用內建的 Mock AI
- 基本功能完整可用
- 看到「💡 使用基礎 AI」提示

---

## 💰 費用參考

- 創建 100 張卡片 ≈ **1 元台幣**
- 創建 1000 張卡片 ≈ **9 元台幣**

非常經濟！ 💸

---

## ❓ 疑難排解

### 問題：看到「使用基礎 AI」但我已設置 API Key

**解決：**
```bash
# 1. 確認 .env 文件中的 Key 正確
cat .env | grep OPENAI

# 2. 確認沒有多餘空格
# 正確：EXPO_PUBLIC_OPENAI_API_KEY=sk-xxx
# 錯誤：EXPO_PUBLIC_OPENAI_API_KEY= sk-xxx

# 3. 重啟開發伺服器
npx expo start --clear

# 4. 在模擬器中重新載入（Cmd + R）
```

### 問題：API 調用失敗

**自動處理：**
- App 會自動回退到基礎 AI
- 功能繼續正常工作
- 無需擔心！

---

## ✅ 驗證清單

- [ ] 獲取了 OpenAI API Key
- [ ] 編輯了 `.env` 文件
- [ ] 重啟了開發伺服器
- [ ] 在 App 中看到「OpenAI GPT-4」提示
- [ ] 測試創建卡片，內容質量高
- [ ] 享受智能學習！ 🎉

---

**完成設置後，請告訴我！我會繼續實現下一個功能（Share Extension）🚀**
