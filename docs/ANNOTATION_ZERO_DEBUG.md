# Annotation 始終顯示 0 的診斷指南

**問題：** 拖動後 annotations 計數始終是 0

---

## 🔍 可能的原因（按可能性排序）

### 1. ⭐ 標註框太小被過濾掉（最可能）

**檢查：** Console 是否顯示
```
[ImageAnnotation] Box too small, ignored: 1% x 1%
```

**原因：** 程式碼要求框的寬度和高度都要 > 2% 容器大小

**測試方法：**
```
1. 重新加載 App（Cmd + R）
2. 打開標註工具
3. 點擊「開始標註」
4. 【關鍵】畫一個大框
   - 從左上角拖到右下角
   - 至少覆蓋圖片的 30% 以上
5. 查看 Console
```

**應該看到：**
```
[ImageAnnotation] Touch start: 50 100
[ImageAnnotation] Touch move: 150 250
[ImageAnnotation] Touch move: 250 400
[ImageAnnotation] Touch end...
[ImageAnnotation] Created box: {x: 0.13, y: 0.14, width: 0.51, height: 0.43}
[ImageAnnotation] Total annotations: 1    ← 成功！
```

**如果看到 "Box too small"：**
```
[ImageAnnotation] Box too small, ignored: 1% x 2%
```
→ **這就是問題！框太小了。**

---

### 2. 容器尺寸為 0

**檢查：** 左下角調試信息顯示
```
Container: 0x0  ← 問題！
```

**原因：** 圖片容器還沒完成布局

**解決方案：**
```
1. 等待 2-3 秒讓圖片完全加載
2. 確認調試信息顯示：
   Container: 390x700  ← 正常
3. 再開始標註
```

---

### 3. 沒有觸發 Touch 事件

**檢查：** Console 是否有任何 "Touch" 相關日誌

**測試：**
```
1. 打開 Chrome DevTools（搖晃 → Debug Remote JS）
2. 清空 Console（右鍵 → Clear console）
3. 在標註工具中拖動
4. 查看 Console
```

**如果沒有任何 "Touch start" 日誌：**
→ PanResponder 沒有捕獲觸控事件

**如果有 "Touch start" 但沒有 "Touch move"：**
→ 拖動距離太短

**如果有 "Touch move" 但沒有 "Created box"：**
→ 檢查是否有錯誤信息

---

### 4. isDrawing 狀態不對

**檢查：** 左下角調試信息
```
Drawing: YES ✓  ← 正確（有綠色勾）
Drawing: NO     ← 錯誤！需要先點擊「開始標註」
```

**解決方案：**
```
1. 確保點擊了「✏️ 開始標註」按鈕
2. 按鈕應該變成綠色背景
3. 文字變成「✏️ 標註中」
4. 調試信息顯示：Drawing: YES ✓
```

---

## 🧪 標準測試流程

### 步驟 1：準備環境
```bash
# 1. 重新加載 App
在模擬器按：Cmd + R

# 2. 打開 Chrome DevTools
搖晃設備（Ctrl + Cmd + Z）→ Debug Remote JS

# 3. 清空 Console
在 Chrome DevTools Console 右鍵 → Clear console
```

### 步驟 2：執行測試
```
1. 快取 → + 新增 → 圖片
2. 選擇任何圖片（建議：清晰、簡單的圖片）
3. 標註工具自動彈出
4. 【重要】檢查左下角調試信息：
   Container: ???x???  ← 記下這個數字
   Drawing: NO
   
5. 點擊「✏️ 開始標註」
   - 按鈕變綠色
   - 文字變成「✏️ 標註中」
   - Drawing: YES ✓
   
6. 【關鍵】畫一個大框：
   ┌────────────────────┐
   │  從這裡            │
   │    ↘              │
   │                   │
   │            到這裡  │
   └────────────────────┘
   
   畫對角線，覆蓋至少 1/3 圖片
   
7. 放開手指
```

### 步驟 3：檢查結果

**Console 應該顯示（按順序）：**
```
[ImageAnnotation] Container size: 390 x 700
[ImageAnnotation] Image size: 1024 x 768
[ImageAnnotation] Touch start: 50 100
[ImageAnnotation] Touch move: 100 200
[ImageAnnotation] Touch move: 150 300
[ImageAnnotation] Touch move: 200 400
[ImageAnnotation] Touch move: 250 500
[ImageAnnotation] Touch end, container size: {width: 390, height: 700}
[ImageAnnotation] Current box: {startX: 50, startY: 100, currentX: 250, currentY: 500}
[ImageAnnotation] Created box: {id: "1707...", x: 0.13, y: 0.14, width: 0.51, height: 0.57}
[ImageAnnotation] Total annotations: 1
```

**調試信息應該顯示：**
```
Container: 390x700
Drawing: YES ✓
Annotations: 1      ← 從 0 變成 1
CurrentBox: NO      ← 放開後變回 NO
```

---

## 🐛 根據 Console 輸出診斷

### 情況 A：沒有任何 "Touch" 日誌
```
原因：PanResponder 沒有工作
解決：
1. 確認 Drawing: YES ✓
2. 嘗試點擊圖片不同區域
3. 使用滑鼠拖動（不要只點擊）
```

### 情況 B：有 "Touch start" 但沒有 "Touch move"
```
原因：拖動距離太短
解決：
1. 拖動更長的距離
2. 慢速拖動，不要太快
3. 確保按住不放再拖動
```

### 情況 C：有 "Touch move" 但顯示 "Box too small"
```
原因：框的尺寸 < 2% 容器大小
解決：
1. 畫更大的框
2. 檢查 Console 顯示的百分比
3. 目標：至少 10% x 10% 或更大

例如：
Container: 390x700
需要：width > 7.8px, height > 14px
建議：width > 100px, height > 100px (約 25%)
```

### 情況 D：有 "Created box" 但 annotations 還是 0
```
原因：state 更新失敗或父組件問題
解決：
1. 檢查是否有其他錯誤信息
2. 重新加載 App
3. 查看下一節「深度診斷」
```

---

## 🔬 深度診斷

### 測試 1：手動降低閾值

**暫時修改程式碼測試：**

編輯 `src/components/ImageAnnotation.tsx` 第 106 行：
```typescript
// 原始（嚴格）
if (relativeBox.width > 0.02 && relativeBox.height > 0.02) {

// 改為（寬鬆）- 僅用於測試！
if (relativeBox.width > 0.001 && relativeBox.height > 0.001) {
```

重新加載 App 並測試。如果現在能保存，說明確實是框太小的問題。

**記得測試完改回來！**

---

### 測試 2：檢查 onAnnotationsChange 是否被調用

在 `AddCacheItemScreen.tsx` 第 329-333 行添加更多日誌：

```typescript
<ImageAnnotation
  imageUri={selectedImage}
  onAnnotationsChange={(annotations) => {
    console.log('[AddCache] ★★★ Annotations changed!');
    console.log('[AddCache] New count:', annotations.length);
    console.log('[AddCache] Data:', JSON.stringify(annotations, null, 2));
    setImageAnnotations(annotations);
  }}
  initialAnnotations={imageAnnotations}
/>
```

如果看到這些日誌，說明數據傳遞正常。

---

### 測試 3：檢查 state 初始化

在 `AddCacheItemScreen.tsx` 第 33 行後添加：
```typescript
const [imageAnnotations, setImageAnnotations] = React.useState<BoundingBox[]>([]);

// 添加這行監控 state 變化
React.useEffect(() => {
  console.log('[AddCache] imageAnnotations state changed:', imageAnnotations.length);
}, [imageAnnotations]);
```

每次 state 更新都會輸出日誌。

---

## 📊 標準測試案例

### 案例 1：畫小框（應該被過濾）
```
動作：在圖片中心畫 20x20 像素的小框
預期 Console：
[ImageAnnotation] Box too small, ignored: 5% x 3%

預期結果：annotations 保持 0 ✓
```

### 案例 2：畫中框（應該成功）
```
動作：畫 100x100 像素的框（約圖片 1/4）
預期 Console：
[ImageAnnotation] Created box: {width: 0.26, height: 0.14, ...}
[ImageAnnotation] Total annotations: 1

預期結果：annotations 變成 1 ✓
調試信息顯示：Annotations: 1
```

### 案例 3：畫大框（應該成功）
```
動作：從左上角拖到右下角
預期 Console：
[ImageAnnotation] Created box: {width: 0.8, height: 0.9, ...}
[ImageAnnotation] Total annotations: 1

預期結果：annotations 變成 1 ✓
畫面上顯示綠色大框
```

---

## ✅ 成功標準

### Console 輸出：
```
✓ 有 "Touch start" 日誌
✓ 有多個 "Touch move" 日誌
✓ 有 "Touch end" 日誌
✓ 有 "Created box" 日誌
✓ 有 "Total annotations: 1" 日誌
✗ 沒有 "Box too small" 日誌
```

### 調試信息：
```
Container: 390x700  ✓ (不是 0x0)
Drawing: YES ✓      ✓ (有綠色勾)
Annotations: 1      ✓ (不是 0)
CurrentBox: NO      ✓ (放開後)
```

### 畫面顯示：
```
✓ 拖動時看到藍色虛線框
✓ 放開後看到綠色實線框
✓ 框上方有「#1」標籤
✓ 框右上角有紅色「✕」刪除按鈕
✓ 工具列顯示「1 個標註」
```

---

## 🎯 立即測試清單

請按照這個清單一步步測試並報告結果：

```
□ 1. 重新加載 App（Cmd + R）
□ 2. 打開 Chrome DevTools
□ 3. 清空 Console
□ 4. 打開標註工具
□ 5. 檢查調試信息：Container 不是 0x0
□ 6. 點擊「開始標註」
□ 7. 確認 Drawing: YES ✓
□ 8. 畫一個大框（對角線，覆蓋 1/3 圖片）
□ 9. 查看 Console 輸出
□ 10. 複製完整的 Console 日誌給我
```

---

## 📝 報告格式

請提供以下信息：

**1. 調試信息（標註前）**
```
Container: ???x???
Drawing: ???
Annotations: ???
```

**2. Console 輸出（完整複製）**
```
[貼上從開始標註到放開的所有日誌]
```

**3. 調試信息（標註後）**
```
Container: ???x???
Drawing: ???
Annotations: ???  ← 這個數字是多少？
```

**4. 拖動描述**
```
- 拖動了多遠？（大概）
- 從哪裡到哪裡？
- 有看到藍色虛線框嗎？
```

有了這些信息，我就能準確定位問題！🔍
