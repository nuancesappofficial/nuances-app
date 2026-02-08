# 🚀 Android Studio 運行 Nuances App 指南

## 步驟 1: 創建虛擬設備（第一次需要）

### 1.1 打開 Android Studio
- 如果是第一次打開，會顯示歡迎畫面
- 點擊 **"More Actions"** 或 **"..."** 按鈕
- 選擇 **"Virtual Device Manager"** 或 **"AVD Manager"**

### 1.2 創建新設備
1. 點擊 **"Create Device"**
2. 選擇設備：
   - Category: **Phone**
   - 選擇 **Pixel 7** 或 **Pixel 5**
   - 點擊 **Next**

3. 選擇系統映像：
   - 選擇 **Tiramisu (API 33)** 或 **UpsideDownCake (API 34)**
   - 如果沒有下載，點擊旁邊的 **Download** 連結
   - 等待下載完成（約 1GB，需要 5-10 分鐘）
   - 下載完成後點擊 **Next**

4. 確認配置：
   - AVD Name: 保持預設或改成 **Nuances_Pixel_7**
   - 點擊 **Finish**

---

## 步驟 2: 啟動模擬器

### 在 AVD Manager 中
- 找到您剛創建的虛擬設備
- 點擊右側的 **綠色播放按鈕 ▶️**
- 等待模擬器啟動（第一次需要 2-5 分鐘）
- 看到 Android 主畫面就成功了！

**保持模擬器運行**，不要關閉！

---

## 步驟 3: 運行 Nuances App

### 3.1 在新的 PowerShell 或 Terminal 中

```bash
# 切換到專案目錄
cd "c:\Vibe coding projects\nuances-app 3.0\nuances-app"

# 啟動 Expo 開發伺服器
npx expo start --dev-client
```

### 3.2 等待 Metro Bundler 啟動

終端會顯示：
```
› Metro waiting on exp://192.168.x.x:8081

› Press a │ open Android
› Press w │ open web
...
```

### 3.3 按 'a' 鍵

在終端按 **'a'** 鍵，Expo 會：
1. ✅ 檢測到模擬器正在運行
2. ✅ 自動安裝應用到模擬器
3. ✅ 啟動應用

**第一次安裝需要 2-3 分鐘**（下載 Development Client）

---

## 步驟 4: 看到應用運行！🎉

### 預期畫面：

1. **Loading 畫面**
   ```
   Loading Nuances...
   ```

2. **主畫面**
   - 底部導航欄：快取 | 卡片
   - 「快取」標籤顯示空列表
   - 右下角有綠色的 **+** 按鈕

3. **測試功能**
   - 點擊 **+** 按鈕
   - 選擇內容類型
   - 輸入測試資料
   - 儲存
   - 查看列表更新

---

## 🎮 常用操作

### 重新載入應用
- 在模擬器中按 **R** 兩次（快速雙擊）
- 或在終端按 **R**

### 打開開發選單
- 在模擬器中按 **Ctrl + M** (Windows)
- 或按 **Cmd + M** (Mac)

### 清除快取重啟
```bash
npx expo start --dev-client -c
```

---

## ⚠️ 常見問題

### Q: 按 'a' 後沒反應？
**A:** 確保模擬器已完全啟動（看到 Android 主畫面）

### Q: 顯示 "adb not found"？
**A:** 需要設置環境變數：
```powershell
$androidHome = "$env:LOCALAPPDATA\Android\Sdk"
[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', $androidHome, 'User')
$env:ANDROID_HOME = $androidHome

# 添加 adb 到 PATH
$currentPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
[System.Environment]::SetEnvironmentVariable('Path', "$currentPath;$androidHome\platform-tools", 'User')
```

然後重新打開終端。

### Q: 模擬器很慢？
**A:** 在 BIOS 中啟用虛擬化（VT-x 或 AMD-V）

### Q: 應用安裝失敗？
**A:** 
```bash
# 清除並重試
npx expo start --dev-client -c
# 按 'a'
```

---

## 🎯 快速檢查清單

- [ ] Android Studio 已安裝
- [ ] 虛擬設備已創建
- [ ] 模擬器正在運行（看到 Android 主畫面）
- [ ] 終端運行 `npx expo start --dev-client`
- [ ] 按了 'a' 鍵
- [ ] 等待應用安裝
- [ ] ✅ 看到 Nuances 應用！

---

## 📊 完整流程時間估計

| 步驟 | 時間 |
|------|------|
| 創建虛擬設備 | 2 分鐘 |
| 下載系統映像（第一次） | 5-10 分鐘 |
| 啟動模擬器（第一次） | 2-5 分鐘 |
| 啟動 Expo | 1 分鐘 |
| 安裝應用（第一次） | 2-3 分鐘 |
| **總計（第一次）** | **12-21 分鐘** |
| **之後每次** | **3-5 分鐘** |

---

**現在開始吧！打開 Android Studio 創建虛擬設備！** 🚀
