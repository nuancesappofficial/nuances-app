# 🏗️ EAS Build 設置指南

## 問題：EAS Build 需要互動式創建專案

EAS Build 在首次使用時需要回答一些問題來創建專案。由於 AI 無法進行互動式操作，您需要手動執行以下步驟。

---

## 📋 完整步驟

### 步驟 1: 確認登入狀態

```bash
cd "c:\Vibe coding projects\nuances-app 3.0\nuances-app"
eas whoami
```

應該顯示：`jeffenglishlearning`

### 步驟 2: 創建 EAS 專案

```bash
eas build:configure
```

會問您：
- **Would you like to automatically create an EAS project for @jeffenglishlearning/nuances-app?**
  - 輸入：`y` (Yes)

這會在 app.json 中自動添加 `extra.eas.projectId`

### 步驟 3: 創建 iOS Development Build

```bash
eas build --profile development --platform ios
```

會問您幾個問題：
1. **Generate a new Apple Distribution Certificate?**
   - 輸入：`y` (Yes)
   
2. **Generate a new Apple Provisioning Profile?**
   - 輸入：`y` (Yes)

然後 EAS 會：
- 上傳您的代碼到雲端
- 編譯 iOS Development Build（10-15分鐘）
- 生成下載連結

### 步驟 4: 下載並安裝

構建完成後：
1. EAS 會提供一個下載連結
2. 在 iPhone 上打開該連結
3. 按照指示安裝 Development Build
4. 安裝後，應用會出現在主畫面

### 步驟 5: 連接到開發伺服器

安裝 Development Build 後：
1. 在電腦上運行：`npx expo start --dev-client`
2. 掃描 QR code 或手動輸入 URL
3. 應用會載入最新代碼

---

## 🚀 快速啟動（如果已經有 Development Build）

```bash
# 啟動開發伺服器
npx expo start --dev-client

# 在手機上打開 Development Build 應用
# 掃描 QR code 即可
```

---

## 📱 Android 版本（如果需要）

```bash
eas build --profile development --platform android
```

Android 構建通常更快（5-10分鐘）且不需要 Apple 證書。

---

## ⚠️ 注意事項

### 首次構建需要的資訊
- **Apple ID**（用於生成證書）
- **等待時間**：10-15分鐘

### 後續構建
- 只需運行 `eas build` 命令
- 證書已保存在 EAS 中
- 可以隨時重新構建

### 費用
- EAS Build 免費方案：每月 30 次構建
- 對 MVP 開發足夠使用

---

## 🔍 監控構建狀態

### 方法 1: 在終端查看
構建過程中會顯示進度條和狀態

### 方法 2: 在網頁查看
https://expo.dev/accounts/jeffenglishlearning/projects/nuances-app/builds

### 方法 3: 使用命令查看
```bash
eas build:list --platform ios
```

---

## 📊 構建完成後

您會收到：
1. **下載連結**（直接安裝到 iPhone）
2. **QR Code**（掃描安裝）
3. **構建日誌**（如果出錯）

安裝後，所有功能將完全運作：
- ✅ WatermelonDB 資料庫
- ✅ 圖片選擇器
- ✅ 資料持久化
- ✅ 離線功能
- ✅ 完整導航

---

## 💡 替代方案：使用 Expo Snack

如果暫時不想等待構建，可以在線上測試 UI：
https://snack.expo.dev/

但無法測試 WatermelonDB 功能。

---

**準備好後，在終端運行上述命令即可！** 🚀

所有代碼都已經完成並推送到 GitHub。
