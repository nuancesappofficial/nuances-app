# 🚀 iOS Development Build 完整操作指南

## ✅ 您已完成
- [x] 註冊 Apple Developer 帳號
- [x] EAS 專案配置
- [x] 所有代碼準備完成

## 📋 接下來的步驟（需要您在終端手動操作）

### 步驟 1: 在終端運行構建命令

打開 PowerShell/終端，確保在正確的目錄：

```bash
cd "c:\Vibe coding projects\nuances-app 3.0\nuances-app"
```

然後運行：

```bash
eas build --profile development --platform ios
```

---

### 步驟 2: 回答問題

構建過程中會問您幾個問題，按照以下回答：

#### 問題 1: 登入 Apple 帳號
```
? Do you want to log in to your Apple account?
回答：y (Yes)
```

#### 問題 2: 輸入 Apple ID
```
? Apple ID: 
回答：jeffenglishlearning@gmail.com
```

#### 問題 3: 輸入密碼
```
? Password:
回答：[輸入您的 Apple ID 密碼]
```

#### 問題 4: 雙重驗證碼
```
? Please enter the 6 digit code:
回答：[輸入您 iPhone 收到的 6 位數驗證碼]
```

#### 問題 5: 生成證書
```
? Generate a new Apple Distribution Certificate?
回答：y (Yes)
```

#### 問題 6: 生成配置文件
```
? Generate a new Apple Provisioning Profile?
回答：y (Yes)
```

---

### 步驟 3: 等待構建完成（10-15 分鐘）

構建開始後，您會看到：

```
✔ Build started, it may take a few minutes to complete.
Build details: https://expo.dev/accounts/jeffenglishlearning/projects/nuances-app/builds/...
```

#### 進度顯示：
- 📦 Uploading project files
- 🔨 Installing dependencies  
- 🏗️ Building iOS app
- ✅ Build completed

**您可以：**
- 關閉終端視窗（構建在雲端進行）
- 訪問上面的連結查看進度
- 或者保持終端開啟等待

---

### 步驟 4: 下載安裝到 iPhone

#### 構建完成後，終端會顯示：

```
✔ Build finished
🚀 Install and run the app on your device:
   https://expo.dev/artifacts/eas/...
```

#### 在 iPhone 上：

1. **打開 Safari 瀏覽器**
2. **訪問上面的下載連結**
3. **點擊 "Install"**（安裝）
4. **如果出現 "Untrusted Developer"**：
   - 前往：設定 → 一般 → VPN與裝置管理
   - 點擊您的開發者證書
   - 點擊 "信任"

5. **應用圖示出現在主畫面** ✅

---

### 步驟 5: 連接開發伺服器

#### 在電腦上運行：

```bash
npx expo start --dev-client
```

終端會顯示 QR code。

#### 在 iPhone 上：

1. **打開剛安裝的 Nuances App**
2. **應該會自動連接**，或者：
3. **手動輸入 URL**：`exp://YOUR_PC_IP:8081`
4. **或掃描 QR code**

---

### 步驟 6: 開始測試！🎉

現在您可以測試所有功能：

#### 快取管理
- ✅ 添加文字內容
- ✅ 添加 URL
- ✅ 選擇/拍攝圖片
- ✅ 標註圖片（繪製邊界框）
- ✅ 添加關鍵字

#### 學習系統
- ✅ 生成學習卡片
- ✅ 查看卡片列表
- ✅ 過濾待複習卡片
- ✅ 複習卡片（翻卡動畫）
- ✅ 4 級評分系統
- ✅ SRS 自動排程

#### 資料持久化
- ✅ 本地儲存（WatermelonDB）
- ✅ 離線運作
- ✅ 完整功能

---

## 🎯 快速回顧命令

```bash
# 1. 構建 iOS Development Build（第一次）
eas build --profile development --platform ios

# 2. 啟動開發伺服器
npx expo start --dev-client

# 3. 清除快取重啟（如果需要）
npx expo start --dev-client -c
```

---

## ⚠️ 常見問題

### Q: 構建失敗了怎麼辦？
A: 查看錯誤訊息，通常是證書問題。可以重新運行 `eas build` 命令。

### Q: 手機上顯示 "Unable to connect"？
A: 確保手機和電腦在同一個 WiFi 網路。

### Q: 7 天後證書過期？
A: 重新運行 `eas build` 命令，下載新的安裝包即可。

### Q: 想修改代碼後測試？
A: 保持 `npx expo start --dev-client` 運行，修改代碼會自動熱重載。

### Q: Android 版本呢？
A: 運行 `eas build --profile development --platform android`（更快更簡單）

---

## 📱 準備好了嗎？

**現在在終端運行：**

```bash
eas build --profile development --platform ios
```

**然後按照上面的步驟回答問題即可！** 🚀

---

## 💡 提示

- 整個過程大約需要 15-20 分鐘
- 構建是在雲端進行，不佔用您的電腦資源
- 可以在 https://expo.dev 查看構建進度
- 第一次構建較慢，之後會更快

**祝您測試順利！** 🎉
