# 🛠️ 手動構建指南（Xcode GUI）

由於 Xcode 命令行工具遇到模擬器識別問題，請按以下步驟手動構建：

## ✅ 步驟 1：打開 Xcode

Xcode 專案已自動打開，或手動執行：
```bash
open /Users/users/vibe_coding_projects/nuances-app/ios/Nuances.xcworkspace
```

⚠️ **重要**：必須打開 `.xcworkspace` 檔案，不是 `.xcodeproj`！

---

## ✅ 步驟 2：選擇目標設備

1. 在 Xcode 頂部工具欄，找到「Nuances」旁邊的設備選擇器
2. 點擊下拉選單
3. 選擇任一 iPhone 模擬器（推薦 iPhone 17 Pro）

---

## ✅ 步驟 3：構建並運行

點擊左上角的 **▶️ Play 按鈕**（或按 `Cmd + R`）

---

## ⏳ 等待構建完成

第一次構建需要 **5-10 分鐘**，你會看到：
- Xcode 頂部顯示「Building...」
- 進度條逐漸前進
- 最後顯示「Build Succeeded」

---

## ✅ 驗證 ML Kit 是否安裝成功

構建成功後，應用會自動打開在模擬器中。檢查：

1. **打開終端查看日誌**：
   ```bash
   npx react-native log-ios
   ```

2. **上傳測試圖片**（例如你之前的 IELTS Writing Task 圖片）

3. **查找這些日誌**：
   ```
   [OCR] Starting ML Kit text recognition (LOCAL)...
   [OCR] ML Kit raw result: { blockCount: X, hasText: true }
   [OCR] ✅ Success: Found X text blocks in XXXms
   ```

4. **確認圖片上顯示綠色文字框**（ML Kit 自動識別的結果）

---

## 🎯 成功標誌

✅ 應用打開無崩潰  
✅ 上傳圖片後自動顯示文字框  
✅ 點擊文字框變橙色  
✅ 關鍵字自動填入  
✅ 控制台沒有 "Cannot find native module" 錯誤  

---

## ⚠️ 如果構建失敗

### 錯誤 1：Signing 問題
**錯誤訊息**：`Signing for "Nuances" requires a development team...`

**解決方案**：
1. 點擊左側的「Nuances」專案
2. 選擇「Nuances」target
3. 在「Signing & Capabilities」標籤
4. 勾選「Automatically manage signing」
5. 選擇你的 Apple ID 團隊（或用 Personal Team）

### 錯誤 2：Pod 依賴問題
**錯誤訊息**：`The sandbox is not in sync with the Podfile.lock`

**解決方案**：
```bash
cd ios
pod install
# 然後回到 Xcode 重新構建
```

### 錯誤 3：Clean Build Folder
如果遇到其他奇怪錯誤：
1. Xcode 選單：Product → Clean Build Folder（`Cmd + Shift + K`）
2. 重新構建

---

## 📋 已完成的準備工作

✅ ML Kit 依賴已安裝（`@react-native-ml-kit/text-recognition`）  
✅ CocoaPods 已配置（111 pods）  
✅ iOS 部署目標已更新（15.5）  
✅ 代碼已遷移到純文字策略  

**現在只需要 Xcode 完成最後的編譯！**

---

## 💡 構建完成後的測試

1. 上傳你的 IELTS Writing Task 圖片
2. 應該會看到：
   - 自動識別出所有文字（< 1 秒）
   - 綠色文字框覆蓋在圖片上
   - 識別結果：「WRITING TASK 2」、「You should spend...」等等
3. 點擊任意文字框
4. 查看 AI 分析結果

---

**問題診斷**：如果 OCR 仍然失敗，請分享 Xcode 控制台的完整錯誤訊息。
