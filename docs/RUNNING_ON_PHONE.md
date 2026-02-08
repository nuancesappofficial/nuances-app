# 🚀 在手機上運行 Nuances App - 終極簡化指南

由於 Windows 開發環境的複雜性，這裡提供最簡單有效的方法。

## 方法：重新安裝依賴並啟動

### 步驟 1: 清理並重新安裝

在專案目錄 `nuances-app` 中運行：

```bash
# 刪除 node_modules 和 lock 文件
rmdir /s /q node_modules
del package-lock.json

# 重新安裝（使用 legacy-peer-deps）
npm install --legacy-peer-deps

# 安裝 babel preset
npm install --save-dev babel-preset-expo --legacy-peer-deps
```

### 步驟 2: 啟動開發伺服器

```bash
# 清除快取並啟動
npx expo start -c
```

### 步驟 3: 連接手機

1. **安裝 Expo Go**
   - iOS: App Store 搜尋 "Expo Go"
   - Android: Google Play 搜尋 "Expo Go"

2. **選擇連接方式**
   
   在終端應該會看到選項：
   - 按 `s` 選擇連接類型（建議選 **tunnel**）
   - 掃描 QR code

3. **手動輸入（如果沒有 QR code）**
   
   找到您的 IP：
   ```bash
   ipconfig
   # 找到 IPv4 地址，例如：192.168.1.100
   ```
   
   在 Expo Go 輸入：
   ```
   exp://192.168.1.100:8081
   ```

---

## 備選方案：使用 Expo Go 掃描專案

如果上述方法還是有問題，可以：

### 選項 A：發布到 Expo 並掃描

```bash
# 登入 Expo（需要註冊帳號）
npx expo login

# 發布專案
npx expo publish
```

發布後會得到一個 QR code，用 Expo Go 掃描即可。

### 選項 B：直接從 GitHub Clone 到另一台 Mac/Linux 電腦

如果您有 Mac 或 Linux 電腦：

```bash
git clone https://github.com/jeffenglishlearning-collab/nuances-app.git
cd nuances-app
npm install --legacy-peer-deps
npx expo start
```

Mac/Linux 環境下 Expo 更穩定。

---

## 當前代碼狀態

✅ **已完成並推送到 GitHub：**
- 完整的基礎架構（WatermelonDB + Supabase）
- 快取列表 UI
- 手動添加內容功能
- 關鍵字注入功能

✅ **可以測試的功能：**
1. 查看空狀態界面
2. 點擊 + 按鈕添加項目
3. 選擇內容類型（TEXT/URL/IMAGE/VIDEO）
4. 輸入內容和可選關鍵字
5. 保存後查看列表

---

## 故障排除

### 如果終端沒有 QR code

1. **檢查是否有錯誤訊息**
   - 如果看到 "Waiting on http://localhost:8081"，說明還在啟動中
   - 等待 30-60 秒

2. **嘗試 tunnel 模式**
   ```bash
   npx expo start --tunnel
   ```

3. **檢查防火牆**
   - Windows Defender 可能阻擋端口
   - 允許 Node.js 通過防火牆

### 如果手機連不上

1. **確保在同一 WiFi**（LAN 模式）
2. **使用 tunnel 模式**（可跨網路）
3. **檢查 PC IP 是否正確**

---

## 需要的文件清單

確保以下文件存在：
- ✅ `babel.config.js` - Babel 配置
- ✅ `package.json` - 依賴列表
- ✅ `App.tsx` - 主應用
- ✅ `src/screens/CacheListScreen.tsx` - 快取列表
- ✅ `src/screens/AddCacheItemScreen.tsx` - 添加功能

所有文件都已推送到 GitHub。

---

## 下一步

完成手機測試後，告訴我您想要：
1. 繼續添加 AI 分析功能
2. 實現 Share Extension（從其他 App 分享）
3. 添加卡片學習系統
4. 實現發音評估功能

**所有代碼都在 GitHub 上：**
https://github.com/jeffenglishlearning-collab/nuances-app
