# 📱 在 iPhone 上同時運行（Expo Go 預覽模式）

## 🎯 兩種運行模式

### 1. Android 模擬器 = 完整功能 ✅
- WatermelonDB 資料庫
- 所有功能正常運作
- 真實的應用體驗

### 2. iPhone Expo Go = UI 預覽 📱
- 只能看 UI 設計
- 資料庫功能禁用
- Mock 資料顯示

---

## 🚀 快速設置（5 分鐘）

### 步驟 1: 創建 Expo Go 兼容版本

我已經為您創建了一個兼容版本。現在切換到這個版本：

```bash
# 在專案目錄
cd "c:\Vibe coding projects\nuances-app 3.0\nuances-app"

# 備份原始 App.tsx
Copy-Item App.tsx App.original.tsx

# 使用 Expo Go 兼容版本
Copy-Item App.expo-go.tsx App.tsx -Force
```

### 步驟 2: 重啟 Expo（如果還在運行）

如果 Expo 還在運行，按 `Ctrl+C` 停止，然後：

```bash
npx expo start -c
```

### 步驟 3: 在 iPhone 上連接

#### 方法 A: 使用瀏覽器的 QR Code

1. 在電腦瀏覽器打開：`http://localhost:8081`
2. 在 iPhone 的 Expo Go 中掃描 QR code

#### 方法 B: 手動輸入 URL

1. 找到電腦 IP：
   ```powershell
   ipconfig
   # 找到 IPv4 Address，例如：192.168.1.100
   ```

2. 在 Expo Go 中輸入：
   ```
   exp://192.168.1.100:8081
   ```

---

## 📱 iPhone 上會看到什麼

### ✅ 可以看到：
- Loading 畫面
- 導航系統（快取/卡片標籤）
- UI 佈局和設計
- 空狀態提示
- 添加畫面（但無法儲存）

### ❌ 無法使用：
- 實際儲存資料
- 查看已儲存的項目
- 完整的資料流程

### 💡 會顯示提示：
```
📱 Expo Go Preview Mode
(UI only - database disabled)
```

---

## 🎮 同時運行兩個版本

### 設置：

**終端 1 - Android（完整功能）**：
```bash
npx expo start --dev-client --android
```

**終端 2 - iOS Expo Go（UI 預覽）**：
```bash
# 先切換到 Expo Go 版本（見步驟 1）
npx expo start
# 然後在 iPhone 掃描 QR code
```

---

## ⚠️ 重要提示

### Expo Go 版本的限制：
- 無法測試資料庫功能
- 無法測試資料持久化
- 無法測試完整學習流程

### 如果需要 iPhone 完整功能：
需要創建 iOS Development Build（需要 Apple Developer Program $99/年）

---

## 🔄 恢復完整版本

測試完 UI 後，恢復原始版本：

```bash
# 恢復原始 App.tsx
Copy-Item App.original.tsx App.tsx -Force

# 重啟 Expo
npx expo start --dev-client -c
```

---

## 📊 功能對比

| 功能 | Android 模擬器 | iPhone Expo Go |
|------|--------------|----------------|
| UI 預覽 | ✅ | ✅ |
| 導航系統 | ✅ | ✅ |
| 資料庫 | ✅ | ❌ |
| 儲存資料 | ✅ | ❌ |
| 學習流程 | ✅ | ❌ |
| 圖片選擇 | ✅ | ⚠️ 部分 |

---

## 💡 使用場景

### 用 iPhone Expo Go 來：
- ✅ 檢查 UI 在 iOS 上的外觀
- ✅ 測試導航流程
- ✅ 展示給他人看設計

### 用 Android 模擬器來：
- ✅ 測試完整功能
- ✅ 開發和調試
- ✅ 驗證業務邏輯

---

## 🎯 下一步

**現在運行步驟 1-3，就能在 iPhone 上看到 UI 了！**

有任何問題隨時告訴我！📱
