# Share Extension 快速設定指南

## 🚀 快速啟動步驟

### 1. 安裝依賴（已完成 ✅）
```bash
npm install
```

### 2. 預先建構（生成原生檔案）
```bash
npx expo prebuild --clean
```

### 3. 手動配置 Xcode（必須執行）

#### 步驟 A: 新增 Share Extension Target
1. 打開 `ios/nuancesapp.xcworkspace`（⚠️ 不是 .xcodeproj）
2. 在左側導航欄選擇專案根節點
3. 點擊底部的 `+` 按鈕（或 File → New → Target）
4. 選擇 `Share Extension`
5. 設定：
   - **Product Name**: `NuancesShareExtension`
   - **Bundle Identifier**: `com.jeffenglishlearning.nuances.NuancesShareExtension`
   - **Language**: Swift
   - 取消勾選 "Include UI Extension"

#### 步驟 B: 替換生成的檔案
1. 刪除 Xcode 自動生成的 `ShareViewController.swift`
2. 將以下檔案拖入 Extension 目錄：
   - `ios/NuancesShareExtension/ShareViewController.swift`
   - `ios/NuancesShareExtension/Info.plist`
3. 確認檔案在 Xcode 左側導航欄的 `NuancesShareExtension` 群組下

#### 步驟 C: 設定 App Groups
**主 App Target (nuancesapp)**:
1. 選擇 Target → `nuancesapp`
2. 點擊 `Signing & Capabilities` 標籤
3. 點擊 `+ Capability`，搜尋並添加 `App Groups`
4. 勾選 `group.com.jeffenglishlearning.nuances`

**Extension Target (NuancesShareExtension)**:
1. 選擇 Target → `NuancesShareExtension`
2. 重複步驟 2-4

#### 步驟 D: 驗證 Info.plist（Extension）
確認 `NuancesShareExtension/Info.plist` 包含：
```xml
<key>NSExtension</key>
<dict>
    <key>NSExtensionAttributes</key>
    <dict>
        <key>NSExtensionActivationRule</key>
        <dict>
            <key>NSExtensionActivationSupportsText</key>
            <true/>
            <key>NSExtensionActivationSupportsImageWithMaxCount</key>
            <integer>3</integer>
        </dict>
    </dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.share-services</string>
    <key>NSExtensionPrincipalClass</key>
    <string>ShareViewController</string>
</dict>
```

### 4. 建構並執行

#### 本地模擬器測試
```bash
npx expo run:ios
```

#### EAS Build（推薦用於真機測試）
```bash
eas build --profile development --platform ios
```

---

## 🧪 測試流程

### Feature A: 純文字分享
1. 打開 Safari
2. 反白任意文字
3. 點擊「分享」按鈕
4. 選擇「Nuances」
5. 點擊「Save」
6. 回到 Nuances App
7. 進入 Cache 列表 → 應該看到剛才分享的文字

### Feature B: 圖片分享
1. 打開相簿
2. 選擇 1~3 張圖片
3. 點擊「分享」按鈕
4. 選擇「Nuances」
5. 點擊「Save」
6. 回到 Nuances App
7. 進入 Cache 列表 → 應該看到圖片縮圖

### Feature C: 剪貼簿貼上
1. 複製任意文字（長按 → 拷貝）
2. 打開 Nuances App
3. 進入 Cache 列表 → 點擊右上角 `+`
4. 確認 Content Type 為 `TEXT`
5. 應該看到「📋 從剪貼簿快速貼上」按鈕
6. 點擊按鈕 → 文字自動儲存並返回列表

---

## 🐛 常見問題排查

### 問題 1: 分享選單找不到 Nuances
**原因**: Extension 未正確配置或未啟用 App Groups  
**解決**:
1. 確認 Xcode 中有 `NuancesShareExtension` Target
2. 確認兩個 Target 都啟用了 `group.com.jeffenglishlearning.nuances`
3. 重新建構專案

### 問題 2: 分享後 App 沒有顯示內容
**原因**: 主 App 未讀取共享資料  
**解決**:
1. 確認 `App.tsx` 中有 `useShareExtension(userId)` 呼叫
2. 檢查 Console 輸出是否有錯誤
3. 嘗試關閉 App 後重新打開（觸發 `AppState` 監聽）

### 問題 3: 圖片分享閃退
**原因**: 記憶體超過 120MB  
**解決**:
1. 確認使用 Plugin 生成的 `ShareViewController.swift`（已包含壓縮邏輯）
2. 不要在 JS 層處理圖片

### 問題 4: 資料庫遷移失敗
**原因**: Schema 版本不一致  
**解決**:
```bash
# 清除 App 資料並重新安裝
npx expo run:ios --device
# 或在模擬器中刪除 App 後重新安裝
```

---

## 📊 驗證清單

執行自動測試腳本：
```bash
node scripts/test-share-extension.js
```

應該看到：
```
✅ All checks passed!
```

---

## 📞 需要協助？

1. 檢查 `docs/SHARE_EXTENSION_IMPLEMENTATION.md` 完整實作報告
2. 查看 Console 輸出錯誤訊息
3. 確認所有步驟都已正確執行

---

**設定完成後，你就可以從任何 App 分享文字和圖片到 Nuances 開始學習了！📚✨**
