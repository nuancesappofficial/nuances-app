# Gemini API 快速設定指南

## 📝 步驟 1: 取得 API Key

1. 前往 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 使用 Google 帳號登入
3. 點擊 **"Create API Key"**
4. 選擇或建立一個 Google Cloud Project
5. 複製生成的 API Key（格式：`AIzaSy...`）

## ⚙️ 步驟 2: 配置環境變數

在專案根目錄的 `.env` 文件中貼上您的 API Key：

```env
# Google Gemini API (免費方案: 1,500 RPD, 15 RPM)
EXPO_PUBLIC_GEMINI_API_KEY=AIzaSy_your_actual_api_key_here
```

## 🧪 步驟 3: 測試 API

在專案根目錄執行測試腳本：

```bash
node scripts/test-gemini.js
```

**預期輸出：**
```
🧪 開始測試 Gemini API...

✅ API Key 已配置
   Key 前綴: AIzaSy...

📝 測試 1: 文本關鍵字提取
✅ 成功！提取的關鍵字: ["ephemeral", "paradox", "digital"]

📝 測試 2: 單字卡片內容生成
✅ 成功！卡片內容：
   定義: 短暫的、瞬息的 (lasting for a very short time)
   音標: /ɪˈfem.ər.əl/

📝 測試 3: 連續請求測試
✅ 成功！5/5 個請求成功

🎉 所有測試通過！Gemini API 運作正常
```

## 🚀 步驟 4: 重新啟動 App

```bash
# 停止當前的開發伺服器（Ctrl+C）
# 重新啟動
npm start
```

**重要：** Expo 會在啟動時載入 `.env` 文件，修改後必須重啟。

## 📱 步驟 5: 驗證 App 功能

1. **掃描圖片測試：**
   - 點擊「新增卡片」
   - 選擇「從圖片」
   - 掃描一段英文文字
   - 查看是否顯示「✨ 使用 Google Gemini AI 分析」

2. **查看關鍵字：**
   - AI 應該自動提取 3-5 個關鍵詞
   - 點擊「分析完整內容」查看詳細解釋

3. **生成單字卡：**
   - 選擇一個關鍵字
   - 查看 AI 生成的定義、音標、標籤

## ❓ 常見問題

### Q1: 顯示「使用基礎 AI」而非「Gemini AI」？

**原因：** API Key 未正確載入

**解決方式：**
1. 確認 `.env` 文件中的 Key 名稱是 `EXPO_PUBLIC_GEMINI_API_KEY`
2. 確認 Key 前綴是 `AIzaSy`（不是 OpenAI 的 `sk-`）
3. 重新啟動開發伺服器（`npm start`）

### Q2: 出現「429 Too Many Requests」錯誤？

**原因：** 超過免費配額限制

**免費方案限制：**
- 每日請求數 (RPD): 1,500
- 每分鐘請求數 (RPM): 15

**解決方式：**
- 等待配額重置（每日午夜 Pacific Time）
- 減少測試頻率
- App 會自動回退到 Mock AI

### Q3: API 響應很慢？

**原因：** Gemini Flash 模型通常很快（< 2 秒），可能是網路問題

**解決方式：**
- 檢查網路連接
- 使用行動數據測試
- 查看 Console 日誌確認是否有錯誤

### Q4: JSON 解析錯誤？

**原因：** Gemini 有時會回傳 markdown 格式的 JSON

**已處理：** 程式碼已包含自動清理邏輯，移除 ` ```json ` 標記

**如仍有問題：**
- 查看 Console 中的原始響應
- 提供錯誤訊息給開發者

## 📊 配額監控

前往 [Google Cloud Console](https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas) 查看當前用量。

## 🔗 相關資源

- [Gemini API 官方文檔](https://ai.google.dev/gemini-api/docs)
- [免費配額說明](https://ai.google.dev/pricing)
- [API 限制與最佳實踐](https://ai.google.dev/gemini-api/docs/quota)

---

**完成！** 現在您的 Nuances App 已經整合 Google Gemini AI，享受免費、快速、高品質的 AI 分析功能！🎉
