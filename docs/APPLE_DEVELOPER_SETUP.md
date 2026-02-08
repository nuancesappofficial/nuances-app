# 🍎 Apple Developer 註冊指南（免費版）

## 問題
EAS Build 需要 Apple Developer 帳號來生成 iOS 構建證書。

## 解決方案：註冊免費 Apple Developer 帳號

### 📝 註冊步驟（5-10 分鐘）

#### 1. 訪問註冊頁面
打開瀏覽器，訪問：
```
https://developer.apple.com/register/
```

#### 2. 登入您的 Apple ID
- 使用：`jeffenglishlearning@gmail.com`
- 輸入密碼
- 完成雙重驗證

#### 3. 同意條款
- 閱讀並同意 Apple Developer Agreement
- 點擊 "Submit"

#### 4. 完成註冊
- 填寫基本資訊（如果需要）
- 完成後會收到確認郵件

**就這樣！完全免費，無需支付 $99/年！**

---

## ⚠️ 免費帳號 vs 付費帳號

### 免費 Apple Developer 帳號（$0）✅
- ✅ 可以創建 Development Build
- ✅ 可以在您自己的設備上測試
- ✅ 適合 MVP 開發和個人測試
- ⚠️ 證書每 7 天過期（需重新安裝）
- ⚠️ 不能發布到 App Store
- ⚠️ 最多 3 台設備

### 付費 Apple Developer Program（$99/年）
- ✅ 證書有效期 1 年
- ✅ 可以發布到 App Store
- ✅ 無設備數量限制
- ✅ 獲得技術支援

**對於 MVP 開發，免費版就足夠了！**

---

## 🔄 註冊完成後

### 等待 5-10 分鐘
註冊後可能需要幾分鐘才能生效。

### 重新運行構建命令

```bash
cd "c:\Vibe coding projects\nuances-app 3.0\nuances-app"

# 重新嘗試構建
eas build --profile development --platform ios
```

這次應該會成功並詢問：
- **Generate a new Apple Distribution Certificate?** → 回答 `y`
- **Generate a new Apple Provisioning Profile?** → 回答 `y`

---

## 🎯 替代方案：先使用 Expo Go 測試 UI

如果您想先看看 UI，暫時不處理證書問題：

### 1. 啟動開發伺服器
```bash
npx expo start -c
```

### 2. 在 iPhone 上
- 下載 "Expo Go" App（App Store 免費）
- 掃描終端顯示的 QR code

### 限制：
- ⚠️ WatermelonDB 不會工作（需要 native modules）
- ⚠️ 圖片選擇器可能有問題
- ✅ 可以看到 UI 和導航

### 優點：
- ✅ 立即可用，無需等待構建
- ✅ 可以測試基本 UI 流程
- ✅ 熱重載速度快

---

## 💡 建議的步驟

### 選項 A：完整功能測試（推薦）
1. 現在去註冊 Apple Developer（5 分鐘）
2. 等待 5-10 分鐘讓註冊生效
3. 重新運行 `eas build`
4. 等待 10-15 分鐘構建完成
5. 下載安裝到 iPhone
6. ✅ 體驗完整功能（包括 WatermelonDB）

### 選項 B：快速 UI 預覽
1. 運行 `npx expo start -c`
2. 下載 Expo Go
3. 掃描 QR code
4. ✅ 立即看到 UI（但部分功能不可用）

---

## ❓ 常見問題

**Q: 註冊後多久可以使用？**
A: 通常立即可用，最多等 10-15 分鐘。

**Q: 7 天過期是什麼意思？**
A: Development Build 每 7 天需要重新從 EAS 下載安裝。對開發來說不是問題。

**Q: 我需要 Mac 嗎？**
A: 不需要！EAS Build 在雲端構建，Windows 也可以。

**Q: 可以先用 Expo Go 嗎？**
A: 可以，但資料庫功能不會工作。

---

## 🚀 註冊連結

**立即註冊（免費）：**
https://developer.apple.com/register/

註冊後回來重新運行 `eas build` 命令即可！
