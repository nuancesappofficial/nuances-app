# 標註功能調試指南

**問題：** Drawing: YES，但拖動時看不到藍色虛線框

---

## 🔍 現在請執行以下測試

### 1. 重新加載 App
```
在模擬器中按：Cmd + R
等待 App 重新載入
```

### 2. 打開 Chrome DevTools
```
1. 在模擬器中搖晃設備（Ctrl + Cmd + Z）
2. 點擊「Debug Remote JS」
3. Chrome 會自動打開
4. 按 F12 打開 Console
```

### 3. 測試標註功能
```
1. 快取 → + 新增 → 圖片
2. 選擇任何圖片
3. 標註工具彈出
4. 點擊「✏️ 開始標註」
5. 在圖片上拖動手指
```

---

## 📊 檢查 Console 輸出

### 應該看到的日誌：

```
[ImageAnnotation] Container size: 390 x 700
[ImageAnnotation] Image size: 1024 x 768
[ImageAnnotation] Touch start: 100 200
[ImageAnnotation] Touch move: 150 250
[ImageAnnotation] Touch move: 200 300
[ImageAnnotation] Touch end, container size: {width: 390, height: 700}
[ImageAnnotation] Current box: {startX: 100, startY: 200, currentX: 200, currentY: 300}
[ImageAnnotation] Created box: {id: "...", x: 0.26, y: 0.29, width: 0.26, height: 0.14}
[ImageAnnotation] Total annotations: 1
```

### 如果沒有 "Touch start" 日誌：
**問題：** 觸控事件沒有被捕獲

**可能原因：**
1. PanResponder 沒有正確附加
2. 覆蓋層被其他元素阻擋
3. iOS 模擬器觸控問題

---

## 🎯 調試檢查清單

### 左下角調試信息應該顯示：

```
Container: 390x700      ✅ 不是 0x0
Drawing: YES ✓          ✅ 有綠色勾
Annotations: 0          ✅ 初始為 0
CurrentBox: NO          ← 拖動前
```

### 拖動時應該變成：

```
Container: 390x700
Drawing: YES ✓
Annotations: 0
CurrentBox: YES         ✅ 變成 YES
Size: 120x80           ✅ 顯示當前框大小
```

### 如果 CurrentBox 始終是 NO：
**這表示 currentBox state 沒有更新**

---

## 🔧 故障排查步驟

### 步驟 1：檢查觸控是否被捕獲

在 Console 中輸入並執行：
```javascript
// 這會強制觸發一個測試事件
console.log('Test touch');
```

如果能看到輸出，說明 Console 連接正常。

### 步驟 2：測試簡單觸控

**不要拖動，只是點擊一下圖片**

應該看到：
```
[ImageAnnotation] Touch start: X Y
```

如果沒有，說明 PanResponder 沒有工作。

### 步驟 3：檢查 isDrawing 狀態

在點擊「開始標註」後，調試信息應該顯示：
```
Drawing: YES ✓  ← 有綠色勾
```

如果沒有綠色勾，說明按鈕沒有正確更新 state。

---

## 🐛 已知問題和解決方案

### 問題 1：iOS 模擬器觸控延遲
**症狀：** 拖動很慢或沒反應

**解決方案：**
```
1. 關閉所有其他 App
2. 重啟模擬器
3. 降低模擬器解析度（Window → Physical Size → 50%）
```

### 問題 2：覆蓋層被阻擋
**症狀：** 點擊沒反應

**測試方法：**
```
1. 嘗試點擊圖片的不同區域
2. 特別是中間區域
3. 避開頂部和底部邊緣
```

### 問題 3：PanResponder 衝突
**症狀：** 其他手勢優先

**解決方案：**
```
已在程式碼中修復：
- onStartShouldSetPanResponder: () => isDrawing
- 只在 Drawing: YES 時捕獲觸控
```

---

## 🧪 替代測試方法

### 方法 1：使用滑鼠拖動（Mac）

```
1. 在模擬器中，用滑鼠點擊並拖動
2. 應該和手指一樣工作
3. 檢查是否看到藍色虛線框
```

### 方法 2：測試其他手勢

```
1. 嘗試快速滑動
2. 嘗試慢速拖動
3. 嘗試畫小框和大框
```

---

## 📝 報告格式

如果問題持續，請提供：

**1. Console 完整日誌（複製貼上）**
```
從開啟標註工具到拖動的所有日誌
```

**2. 調試信息截圖**
```
左下角的調試信息
- 拖動前
- 拖動中
- 拖動後
```

**3. 操作描述**
```
- 點擊「開始標註」了嗎？
- 拖動了多遠？（大概範圍）
- 有任何視覺反饋嗎？
```

---

## ✅ 成功標準

### 最終應該看到：

**Console：**
```
[ImageAnnotation] Touch start: 100 200
[ImageAnnotation] Touch move: 150 250
[ImageAnnotation] Touch move: 200 300
...（更多 move 事件）
[ImageAnnotation] Touch end...
[ImageAnnotation] Total annotations: 1
```

**畫面：**
- 拖動時：藍色虛線框跟隨
- 放開後：綠色實線框固定
- 調試信息：CurrentBox: YES, Size: XXxYY

**調試信息：**
```
Container: 390x700
Drawing: YES ✓
Annotations: 1  ← 從 0 變成 1
CurrentBox: NO  ← 放開後變回 NO
```

---

**準備好了嗎？**

1. ✅ 重新加載 App（Cmd + R）
2. ✅ 打開 Chrome DevTools（搖晃 → Debug Remote JS）
3. ✅ 開始測試標註功能
4. ✅ 觀察 Console 輸出
5. ✅ 報告結果！

我在等您的測試結果！🔍
