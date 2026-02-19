# 剪貼簿功能 UX 改進

## 📋 更新內容

### 改進前
- 用戶需要點擊 Cache 列表的 `+` 按鈕進入 AddCacheItemScreen
- 選擇 Content Type 為 `TEXT`
- 才會看到「📋 從剪貼簿快速貼上」按鈕
- 點擊後儲存並返回

**問題**：步驟繁瑣，需要 3-4 次點擊才能完成

### 改進後
- 進入 Cache 列表畫面時，自動檢測剪貼簿
- 如果有文字內容，自動彈出 Alert 詢問
- 用戶點擊「儲存」即可直接儲存到 Cache
- 只需 1 次點擊完成

**優勢**：
- ✅ 減少操作步驟（4 步 → 1 步）
- ✅ 更直覺的 UX
- ✅ 符合「無摩擦捕獲」理念
- ✅ 用戶可以選擇「取消」不被打擾

---

## 🔧 技術實作

### 修改檔案

#### 1. `src/screens/CacheListScreen.tsx`（新增功能）

**新增引入**：
```typescript
import { useFocusEffect } from '@react-navigation/native';
import { hasClipboardText, pasteTextFromClipboard } from '@services/clipboard/clipboardService';
```

**新增邏輯**：
- 使用 `useFocusEffect` Hook（每次進入畫面觸發）
- 檢查剪貼簿是否有文字
- 彈出 Alert 詢問用戶
- 用戶確認後直接儲存

**防重複機制**：
- 使用 `useRef` 追蹤是否已詢問過
- 避免在同一 session 反覆彈出 Alert
- 用戶取消後重置標記，下次進入可再詢問

**延遲執行**：
- 延遲 500ms 執行檢測
- 避免畫面剛載入就彈出 Alert，提供更好的視覺體驗

#### 2. `src/screens/AddCacheItemScreen.tsx`（移除舊功能）

**移除內容**：
- ❌ 剪貼簿相關 import
- ❌ `hasClipboard` state
- ❌ `useEffect` 檢查剪貼簿
- ❌ `handlePasteFromClipboard` 函數
- ❌ UI 中的剪貼簿按鈕
- ❌ `clipboardButton` 樣式

**保留功能**：
- ✅ 手動輸入文字
- ✅ URL 輸入
- ✅ 圖片選擇與 OCR

---

## 📱 使用者體驗流程

### 情境 1：有剪貼簿內容
1. 用戶從其他 App（Safari、Notes 等）複製文字
2. 打開 Nuances App，進入 Cache 列表
3. **自動彈出 Alert**：「📋 發現剪貼簿內容 - 要將剪貼簿的文字快速儲存到 Cache 嗎？」
4. 用戶選擇：
   - **「儲存」**：直接儲存到 Cache，顯示成功提示
   - **「取消」**：關閉 Alert，不儲存

### 情境 2：無剪貼簿內容
1. 用戶打開 Nuances App，進入 Cache 列表
2. **不彈出 Alert**（靜默檢測）
3. 用戶可以正常瀏覽 Cache 列表或手動添加內容

### 情境 3：用戶取消後又複製新內容
1. 用戶第一次進入時點擊「取消」
2. 標記重置，離開畫面
3. 用戶複製新的內容
4. 再次進入 Cache 列表
5. **再次彈出 Alert**（允許重新詢問）

---

## 🎯 設計考量

### 為什麼在 CacheListScreen 而非 App.tsx？

**優點**：
1. **業務邏輯相關性**：Cache 列表是儲存內容的主要入口
2. **降低打擾頻率**：用戶不會在每次打開 App 就被詢問
3. **上下文相關**：用戶進入 Cache 頁面時，詢問是否儲存更合理

**App.tsx 的缺點**：
- 用戶可能正在瀏覽卡片或複習，不想被打斷
- 打擾頻率過高，影響體驗

### 為什麼使用 useFocusEffect？

- `useEffect`：只在組件掛載時執行一次
- `useFocusEffect`：每次畫面獲得焦點時執行
- **更適合檢測剪貼簿**：用戶可能在 App 內切換頁面後再複製內容

### 為什麼延遲 500ms？

- 避免畫面剛載入就彈出 Alert
- 給予用戶短暫的視覺緩衝時間
- 提供更流暢的轉場體驗

### 為什麼保留「取消」選項？

- **尊重用戶意願**：可能剪貼簿內容不想儲存
- **避免誤操作**：用戶可能複製了敏感資訊
- **符合 iOS 設計規範**：不強制用戶執行操作

---

## 🧪 測試建議

### 測試 1：基本流程
1. 複製一段文字（從 Safari 或 Notes）
2. 打開 Nuances App，進入 Cache 列表
3. 應該看到 Alert 彈出
4. 點擊「儲存」
5. 確認 Cache 列表中出現該文字

### 測試 2：取消操作
1. 複製一段文字
2. 打開 Nuances App，進入 Cache 列表
3. 點擊 Alert 的「取消」
4. Alert 關閉，Cache 列表正常顯示

### 測試 3：無剪貼簿內容
1. 清空剪貼簿（複製空白或刪除複製歷史）
2. 打開 Nuances App，進入 Cache 列表
3. 不應該彈出 Alert

### 測試 4：多次進入
1. 複製文字後進入 Cache 列表，點擊「取消」
2. 離開 Cache 列表（切換到其他 Tab）
3. 再次進入 Cache 列表
4. 應該再次彈出 Alert（重新詢問）

### 測試 5：同一 Session 不重複詢問
1. 複製文字後進入 Cache 列表，點擊「儲存」
2. 離開 Cache 列表
3. **不複製新內容**的情況下再次進入
4. 不應該彈出 Alert（已處理過）

---

## 📊 效能考量

- **檢測成本低**：`hasClipboardText()` 只檢查是否有文字，不讀取內容
- **符合 iOS 隱私規範**：iOS 14+ 會在讀取剪貼簿時顯示提示，但我們只在用戶確認後才讀取
- **延遲執行**：避免阻塞 UI 渲染

---

## 🔮 未來改進建議

1. **Toast 通知取代 Alert**
   - 更輕量的提示方式
   - 不阻塞用戶操作

2. **可配置選項**
   - 讓用戶在設定中開啟/關閉自動檢測

3. **剪貼簿預覽**
   - Alert 中顯示前 50 字元預覽
   - 用戶更清楚要儲存的內容

4. **智能過濾**
   - 過濾掉太短的內容（< 10 字元）
   - 避免誤觸複製的單字或數字

---

## ✅ 驗證清單

- [x] CacheListScreen 添加自動檢測邏輯
- [x] AddCacheItemScreen 移除舊的剪貼簿按鈕
- [x] 使用 useFocusEffect 而非 useEffect
- [x] 添加防重複機制
- [x] 延遲執行提升體驗
- [x] 提供「取消」選項
- [x] Linter 檢查通過

---

**更新時間**: 2026-02-16  
**影響範圍**: Feature C (剪貼簿快速貼上)  
**向下兼容**: ✅ 是  
**Breaking Changes**: ❌ 無
