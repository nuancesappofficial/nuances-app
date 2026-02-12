# Development Build 設置指南

## 🎯 為什麼需要 Development Build？

**問題**：`expo-image-manipulator` 是 native module，在 Expo Go 中不可用

**解決方案**：構建 Development Build，包含所有 native modules

---

## 📋 前置需求

### ✅ 已完成
- [x] EAS CLI 已安裝 (`eas-cli/16.32.0`)
- [x] `eas.json` 已配置
- [x] `expo-image-manipulator` 已在 `package.json` 中

### ⚠️ 需要的賬號
- Expo 賬號（免費）
- Apple Developer 賬號（iOS 構建，可選）

---

## 🚀 構建步驟

### 步驟 1：登入 Expo

```bash
cd /Users/users/vibe_coding_projects/nuances-app
eas login
```

**提示**：
- 輸入你的 Expo 賬號和密碼
- 如果沒有賬號，先註冊：https://expo.dev/signup

---

### 步驟 2：配置專案

```bash
eas build:configure
```

**這會做什麼**：
- 檢查 `eas.json` 配置
- 創建或更新專案設置
- 設置 bundle identifier（iOS）或 package name（Android）

---

### 步驟 3：啟動 iOS Development Build

```bash
eas build --profile development --platform ios
```

**選項說明**：
- `--profile development`：使用 development 配置（包含 dev client）
- `--platform ios`：只構建 iOS（也可以用 `android`）

**預期流程**：
1. EAS 會詢問一些配置問題（通常按 Enter 使用默認值）
2. 開始上傳代碼到 EAS 服務器
3. 在雲端構建（約 10-20 分鐘）
4. 構建完成後，提供下載連結

---

### 步驟 4：下載並安裝

#### 選項 A：直接在模擬器安裝（推薦）

構建完成後，EAS 會顯示：

```
✔ Build finished
Install URL: https://expo.dev/artifacts/eas/...

Run this command to install:
eas build:run -p ios
```

執行：
```bash
eas build:run -p ios
```

這會自動：
1. 下載 .app 文件
2. 安裝到正在運行的模擬器

---

#### 選項 B：手動下載安裝

1. **下載 .tar.gz 文件**
   - 從 EAS 網站下載：https://expo.dev/accounts/[your-username]/projects/nuances-app/builds
   - 或使用命令：`eas build:download --platform ios --latest`

2. **解壓縮**
   ```bash
   tar -xzf build-xxx.tar.gz
   ```

3. **安裝到模擬器**
   ```bash
   # 找到模擬器 ID
   xcrun simctl list devices | grep Booted
   
   # 安裝 app
   xcrun simctl install [simulator-id] path/to/YourApp.app
   ```

---

### 步驟 5：運行 Development Build

1. **在模擬器中打開 app**
   - 找到 "nuances-app" 圖標
   - 點擊啟動

2. **連接到開發服務器**
   ```bash
   # 在專案目錄中
   npx expo start --dev-client
   ```

3. **在 app 中掃描 QR code 或輸入 URL**
   - App 會連接到你的開發服務器
   - 可以即時重新載入代碼

---

## 🔄 開發流程

### 日常開發

```bash
# 1. 啟動開發服務器
npx expo start --dev-client

# 2. 在 Development Build app 中打開
# 3. 修改代碼，app 會自動重新載入
```

### 何時需要重新構建？

**需要重新構建**：
- ✅ 添加新的 native module
- ✅ 修改 `app.json` 或 `app.config.ts` 中的 native 配置
- ✅ 更新 Expo SDK 版本

**不需要重新構建**：
- ❌ 修改 JavaScript/TypeScript 代碼
- ❌ 修改樣式
- ❌ 添加純 JS 庫

---

## 📊 構建狀態監控

### 查看構建進度

1. **命令行**
   - 構建啟動後，會顯示實時進度

2. **網頁儀表板**
   - https://expo.dev/accounts/[your-username]/projects/nuances-app/builds
   - 可以看到詳細的構建日誌

3. **EAS CLI 命令**
   ```bash
   # 查看最新構建
   eas build:list --platform ios --limit 5
   
   # 查看特定構建
   eas build:view [build-id]
   ```

---

## ⏱️ 預期時間

| 步驟 | 時間 |
|-----|------|
| 登入 Expo | 1 分鐘 |
| 配置專案 | 2 分鐘 |
| 上傳代碼 | 1-2 分鐘 |
| 雲端構建 | 10-20 分鐘 |
| 下載安裝 | 2-3 分鐘 |
| **總計** | **15-30 分鐘** |

---

## 🐛 常見問題

### 問題 1：構建失敗 - "Bundle identifier already exists"

**原因**：Bundle ID 已被其他 app 使用

**解決**：
1. 打開 `app.json`
2. 修改 `ios.bundleIdentifier`：
   ```json
   {
     "ios": {
       "bundleIdentifier": "com.yourname.nuances-app-dev"
     }
   }
   ```
3. 重新構建

---

### 問題 2：無法安裝到模擬器

**錯誤**：`Failed to install the app on simulator`

**解決**：
1. 確保模擬器正在運行
2. 重啟模擬器
3. 使用 Xcode 手動安裝：
   - 打開 Xcode
   - Window → Devices and Simulators
   - 拖動 .app 文件到模擬器

---

### 問題 3：Development Build 啟動後白屏

**原因**：沒有連接到開發服務器

**解決**：
1. 確保開發服務器正在運行：`npx expo start --dev-client`
2. 在 app 中輸入開發服務器 URL
3. 或搖晃設備/模擬器，選擇 "Enter URL manually"

---

### 問題 4：構建時間太長

**正常現象**：首次構建通常需要 15-20 分鐘

**加速方法**：
1. 升級到 EAS 付費計劃（更快的構建機器）
2. 使用 `--local` flag 在本地構建（需要 Xcode）

---

## 💰 成本

### Expo EAS 免費計劃
- ✅ 每月 30 次構建
- ✅ 足夠開發使用
- ⚠️ 構建速度較慢（使用 m-medium 資源）

### 如果需要更多
- **Hobby 計劃**：$29/月（100 次構建）
- **Production 計劃**：$99/月（無限構建）

---

## 🎯 驗證 Native Module 可用

構建完成並安裝後，測試 `expo-image-manipulator`：

```bash
# 在開發服務器 Console 中應該看到：
[OCR Region] Cropping to pixels: {"originX":600,"originY":1040,"width":180,"height":40}
[OCR Region] ✅ Extracted text: causes
```

**不應該看到**：
```
❌ ERROR: Cannot find native module 'ExpoImageManipulator'
```

---

## 📝 下一步

1. **立即開始構建**
   ```bash
   eas login
   eas build --profile development --platform ios
   ```

2. **等待構建完成**（10-20 分鐘）

3. **安裝到模擬器**
   ```bash
   eas build:run -p ios
   ```

4. **測試圖片裁剪**
   - 選擇圖片
   - 圈選單字
   - 驗證 OCR 只識別圈選區域

---

## 🔗 相關資源

- [EAS Build 官方文檔](https://docs.expo.dev/build/introduction/)
- [Development Builds 指南](https://docs.expo.dev/develop/development-builds/introduction/)
- [EAS 儀表板](https://expo.dev/)
- [Expo 論壇](https://forums.expo.dev/)

---

最後更新：2026-02-12
