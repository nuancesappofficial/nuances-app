# 🔧 Expo Go 連接問題排除指南

## 問題：Expo Go App 沒有掃描或輸入 URL 功能

### 解決方案 1: 使用瀏覽器連結（最簡單）✅

#### 步驟 1: 獲取連結

在 Expo 運行的終端中，找到類似這樣的連結：
```
exp://192.168.x.x:8081
```

或者在終端運行：
```bash
# 獲取您的電腦 IP
ipconfig
# 找到 IPv4 Address，例如：192.168.1.100
```

#### 步驟 2: 在 iPhone 創建連結

方法 A - 使用 Safari：
1. 在 iPhone 的 Safari 打開：`exp://您的IP:8081`
2. 例如：`exp://192.168.1.100:8081`
3. 會自動打開 Expo Go

方法 B - 使用備忘錄：
1. 在 iPhone 備忘錄輸入：`exp://192.168.1.100:8081`
2. 點擊連結
3. 選擇用 Expo Go 打開

方法 C - 發送給自己：
1. 在電腦用 Email/訊息發送給自己：`exp://192.168.1.100:8081`
2. 在 iPhone 打開並點擊連結

---

### 解決方案 2: 使用 Tunnel 模式（最可靠）✅

這個方法不需要在同一 WiFi，通過雲端連接！

#### 步驟 1: 停止當前 Expo

按 `Ctrl+C` 停止當前運行的 Expo

#### 步驟 2: 使用 Tunnel 模式啟動

```bash
npx expo start --tunnel
```

#### 步驟 3: 等待生成 URL

會顯示類似：
```
› Metro waiting on exp://u-abcd1234.anonymous.nuances-app.exp.direct:443
```

這個 URL 可以在任何網路使用！

#### 步驟 4: 訪問網頁

在電腦瀏覽器打開：`http://localhost:8081`

會看到一個大的 QR code 和一個連結。

#### 步驟 5: 複製連結到 iPhone

1. 複製瀏覽器上顯示的 `exp://` 開頭的連結
2. 用任何方式發送到 iPhone（Email、訊息、備忘錄）
3. 在 iPhone 點擊連結
4. 選擇用 Expo Go 打開

---

### 解決方案 3: 檢查 Expo Go App 版本

#### 更新 Expo Go

1. 在 iPhone App Store 搜索 "Expo Go"
2. 如果有更新，點擊"更新"
3. 最新版本應該有掃描功能

#### 正確的 Expo Go 界面應該是：

打開 Expo Go 後，應該看到：
- **頂部有搜索框**
- **"Scan QR code" 按鈕**（相機圖標）
- **"Enter URL manually" 選項**
- **最近的專案列表**

如果沒看到這些，可能是：
- App 版本過舊
- 地區限制
- 安裝了錯誤的 App

---

### 解決方案 4: 使用 Expo 的 Web 界面

#### 在 Expo Go App 中

1. 確保 Expo 正在運行（`npx expo start --tunnel`）
2. 在 Expo Go App 底部，找到 "Projects" 或 "Home" 標籤
3. 應該會自動顯示附近的專案
4. 點擊 "nuances-app" 就會連接

---

## 🎯 推薦步驟（按順序嘗試）

### 1. 最簡單：Tunnel 模式 + 連結

```bash
# 停止當前 Expo
# Ctrl+C

# 啟動 tunnel 模式
npx expo start --tunnel

# 等待顯示 exp:// 連結
# 複製連結發送到 iPhone
# 在 iPhone 點擊連結
```

### 2. 如果 Tunnel 慢：直接連結

```bash
# 找到電腦 IP
ipconfig
# 例如：192.168.1.100

# 在 iPhone Safari 輸入：
# exp://192.168.1.100:8081
```

### 3. 如果還不行：更新 Expo Go

在 App Store 更新到最新版本

---

## ⚠️ 常見問題

### Q: Tunnel 模式很慢？
A: 第一次會慢，因為要通過 Expo 雲端。等待 2-3 分鐘。

### Q: 點擊連結沒反應？
A: 確保：
- Expo Go 已安裝
- 連結格式正確（`exp://` 開頭）
- Expo 伺服器正在運行

### Q: 顯示 "Could not connect"？
A: 
- 檢查電腦 IP 是否正確
- 確認 Expo 正在運行
- 嘗試 tunnel 模式

---

## 📱 快速測試

在 iPhone 的 Safari 地址欄直接輸入：
```
exp://localhost:8081
```

如果這個不行，改用您電腦的實際 IP。

---

**現在嘗試 Tunnel 模式！** 這是最可靠的方法！🚀

```bash
npx expo start --tunnel
```

然後告訴我看到什麼連結！
