# 刪除功能與圖片預覽指南

## 🎯 新增功能

### 1. 刪除功能
- ✅ **快取列表**：可以刪除單一快取項目
- ✅ **卡片列表**：可以刪除單一卡片

### 2. 圖片預覽
- ✅ **快取列表**：顯示上傳的圖片（而非 URL）
- ✅ **卡片列表**：顯示來源快取的圖片
- ✅ **標註提示**：如果有圖片標註，顯示標註數量

---

## 📱 功能說明

### 快取列表（Cache List）

#### 刪除功能
```
1. 在快取項目的右上角，點擊 🗑️ 圖標
2. 確認對話框會出現：「確定要刪除這個快取項目嗎？」
3. 點擊「刪除」確認，或「取消」放棄
4. 刪除後項目會立即從列表消失
```

**特點**：
- 🔒 軟刪除（設置 `deleted_at` 字段，不實際刪除資料）
- ⚡ 實時更新（使用 WatermelonDB observe）
- 🛡️ 二次確認（防止誤刪）

#### 圖片預覽
```
如果快取項目是圖片類型（contentType === 'image'）：
1. 顯示完整的圖片預覽（200px 高）
2. 右上角顯示標註數量徽章（如果有標註）
   例如：「✏️ 2 個標註」
3. 內容文字顯示「圖片內容」而非 URL
```

**效果對比**：

| 修改前 | 修改後 |
|-------|-------|
| 顯示：`https://example.com/image.jpg` | 顯示：完整圖片 |
| 無法看到圖片內容 | 直觀預覽圖片 |
| 不知道是否有標註 | 顯示「✏️ 2 個標註」 |

---

### 卡片列表（Cards List）

#### 刪除功能
```
1. 在卡片的右上角，點擊 🗑️ 圖標
2. 確認對話框：「確定要刪除這張卡片嗎？這個操作無法復原。」
3. 點擊「刪除」確認，或「取消」放棄
4. 卡片立即從列表消失
```

**特點**：
- 🔒 軟刪除（保留學習歷史）
- ⚠️ 不影響來源快取（如果卡片是從快取創建的）
- 📊 SRS 數據保留（可用於統計分析）

#### 圖片預覽
```
如果卡片是從圖片快取創建的：
1. 自動獲取關聯的 cachedItem
2. 顯示圖片預覽（150px 高）
3. 圖片位於目標單字下方、原句上方
```

**實現邏輯**：
```typescript
// 卡片可以關聯到快取項目
Card.cachedItemId → CachedItem.id

// 如果快取項目是圖片
if (cachedItem?.contentType === 'image' && cachedItem.imageStoragePath) {
  // 顯示圖片預覽
  <Image source={{ uri: cachedItem.imageStoragePath }} />
}
```

---

## 🔧 技術實現

### 1. 刪除功能實現

#### CacheListScreen.tsx
```typescript
const handleDelete = async (item: CachedItem) => {
  Alert.alert(
    '刪除快取',
    '確定要刪除這個快取項目嗎？',
    [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          await database.write(async () => {
            await item.update((record) => {
              record.deletedAt = new Date(); // 軟刪除
            });
          });
        },
      },
    ]
  );
};
```

**關鍵點**：
- 使用 `Alert.alert` 二次確認
- `database.write` 事務保證資料一致性
- 設置 `deletedAt` 而非實際刪除記錄

#### CardsListScreen.tsx
```typescript
const handleDelete = async (item: Card) => {
  Alert.alert(
    '刪除卡片',
    '確定要刪除這張卡片嗎？這個操作無法復原。',
    [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          await database.write(async () => {
            await item.update((record) => {
              record.deletedAt = new Date();
            });
          });
        },
      },
    ]
  );
};
```

---

### 2. 圖片預覽實現

#### CacheListScreen.tsx
```typescript
{/* 圖片預覽 */}
{item.contentType === 'image' && item.imageStoragePath && (
  <View style={styles.imagePreviewContainer}>
    <Image
      source={{ uri: item.imageStoragePath }}
      style={styles.previewImage}
      resizeMode="cover"
    />
    {/* 標註數量徽章 */}
    {item.imageAnnotations && JSON.parse(item.imageAnnotations).length > 0 && (
      <View style={styles.annotationBadge}>
        <Text style={styles.annotationBadgeText}>
          ✏️ {JSON.parse(item.imageAnnotations).length} 個標註
        </Text>
      </View>
    )}
  </View>
)}

{/* 內容文字 */}
<Text style={styles.contentText} numberOfLines={3}>
  {item.contentText || (item.contentType === 'image' ? '圖片內容' : item.contentUrl) || 'No content'}
</Text>
```

**關鍵點**：
- 條件渲染：只在 `contentType === 'image'` 時顯示
- 檢查 `imageStoragePath` 是否存在
- 解析 `imageAnnotations`（存儲為 JSON 字符串）
- `resizeMode="cover"` 確保圖片填滿容器

---

#### CardsListScreen.tsx
```typescript
const renderItem = ({ item }: { item: Card }) => {
  const [cachedItem, setCachedItem] = useState<CachedItem | null>(null);

  // 獲取關聯的 cachedItem
  useEffect(() => {
    const fetchCachedItem = async () => {
      if (item.cachedItemId) {
        const cached = await database
          .get<CachedItem>('cached_items')
          .find(item.cachedItemId);
        setCachedItem(cached);
      }
    };
    fetchCachedItem();
  }, [item.cachedItemId]);

  return (
    // ...
    {/* 圖片預覽 */}
    {cachedItem?.contentType === 'image' && cachedItem.imageStoragePath && (
      <View style={styles.imagePreviewContainer}>
        <Image
          source={{ uri: cachedItem.imageStoragePath }}
          style={styles.previewImage}
          resizeMode="cover"
        />
      </View>
    )}
    // ...
  );
};
```

**關鍵點**：
- 使用 `useEffect` 異步獲取 `cachedItem`
- 儲存在 local state（`setCachedItem`）
- 只在 `cachedItem` 存在且為圖片類型時顯示
- 卡片預覽尺寸較小（150px vs 200px）

---

## 🎨 UI 設計

### 快取列表

```
┌─────────────────────────────────────┐
│ IMAGE  📱 Camera          🗑️      │ ← Header (刪除按鈕)
├─────────────────────────────────────┤
│ [圖片預覽 200px]                     │ ← 圖片預覽
│         ✏️ 2 個標註                  │ ← 標註徽章（右上角）
├─────────────────────────────────────┤
│ 圖片內容                             │ ← 內容文字
│ 🔑 walking                          │ ← 關鍵詞
├─────────────────────────────────────┤
│ 2026-02-12  ✓ AI Analyzed          │
│                    📇 創建卡片       │ ← Footer
└─────────────────────────────────────┘
```

### 卡片列表

```
┌─────────────────────────────────────┐
│ walking       待複習  🗑️           │ ← Header (刪除按鈕)
├─────────────────────────────────────┤
│ [圖片預覽 150px]                     │ ← 圖片預覽（如果有）
├─────────────────────────────────────┤
│ Health experts say that walking...  │ ← 原句
│ 行走；步行 (the act of moving...)    │ ← 定義
├─────────────────────────────────────┤
│ 複習次數: 3 | 間隔: 7天              │
│ 上次: 2026-02-05                    │
├─────────────────────────────────────┤
│ IELTS  Band 7  Academic             │ ← Tags
└─────────────────────────────────────┘
```

---

## 🧪 測試步驟

### 測試 1：快取刪除功能

1. **前往快取列表**
   - 點擊 "My Cache" Tab

2. **選擇項目刪除**
   - 點擊任一快取項目右上角的 🗑️ 圖標

3. **確認對話框**
   - 驗證是否出現確認對話框
   - 點擊「取消」→ 項目應該保留
   - 再次點擊 🗑️，點擊「刪除」→ 項目應該消失

4. **驗證刪除**
   - 項目應立即從列表消失
   - 刷新列表，確認項目不會再出現

---

### 測試 2：卡片刪除功能

1. **前往卡片列表**
   - 點擊 "My Cards" Tab

2. **選擇卡片刪除**
   - 點擊任一卡片右上角的 🗑️ 圖標

3. **確認對話框**
   - 驗證對話框內容：「這個操作無法復原」
   - 測試取消和刪除按鈕

4. **驗證刪除**
   - 卡片數量減少（Header 顯示）
   - 如果刪除的是「待複習」卡片，「開始複習」按鈕可能消失

---

### 測試 3：圖片預覽（快取列表）

1. **創建圖片快取**
   - 點擊 "+ 添加"
   - 選擇圖片
   - 圈選標註（例如圈 2 個單字）
   - 保存到快取

2. **驗證圖片預覽**
   - 快取列表應顯示完整圖片預覽
   - 右上角應顯示「✏️ 2 個標註」
   - 內容文字顯示「圖片內容」

3. **對比 URL 類型**
   - 創建一個 URL 類型的快取
   - 驗證不顯示圖片預覽
   - 內容文字顯示 URL 本身

---

### 測試 4：圖片預覽（卡片列表）

1. **從圖片快取創建卡片**
   - 使用上面創建的圖片快取
   - 點擊「📇 創建卡片」
   - OCR 識別 → 生成卡片

2. **驗證卡片圖片預覽**
   - 前往 "My Cards"
   - 找到剛創建的卡片
   - 應該顯示圖片預覽（150px 高）

3. **驗證圖片來源**
   - 圖片應該與快取中的一致
   - 圖片顯示在目標單字下方

4. **對比非圖片卡片**
   - 查看從文字創建的卡片
   - 驗證不顯示圖片預覽

---

## 📊 功能對比表

| 功能 | 快取列表 | 卡片列表 |
|-----|---------|---------|
| 刪除按鈕 | ✅ 右上角 🗑️ | ✅ 右上角 🗑️ |
| 刪除確認 | ✅ 二次確認 | ✅ 二次確認 |
| 軟刪除 | ✅ `deleted_at` | ✅ `deleted_at` |
| 圖片預覽 | ✅ 200px 高 | ✅ 150px 高 |
| 標註徽章 | ✅ 顯示數量 | ❌ 不顯示 |
| 預覽來源 | 直接從 `imageStoragePath` | 從關聯的 `cachedItem` |

---

## 🐛 已知問題與注意事項

### 1. 刪除是軟刪除
- **行為**：記錄不會從資料庫實際刪除
- **原因**：保留歷史資料，便於未來恢復或統計
- **查詢**：所有查詢都包含 `Q.where('deleted_at', null)` 過濾

### 2. 卡片刪除不影響快取
- **行為**：刪除卡片後，來源快取項目仍然存在
- **原因**：快取和卡片是獨立的資料
- **使用場景**：如果想重新創建卡片，快取仍然可用

### 3. 圖片加載延遲
- **行為**：卡片列表的圖片可能稍有延遲
- **原因**：需要異步查詢 `cachedItem`
- **優化**：可以考慮在卡片創建時直接存儲圖片路徑

### 4. 圖片 URI 權限
- **行為**：圖片存儲在 ImagePicker 緩存中
- **注意**：App 重啟後可能需要重新訪問
- **未來**：考慮遷移到永久存儲（FileSystem.documentDirectory）

---

## 🔄 未來優化方向

### 1. 批量刪除
```typescript
// 長按進入選擇模式
// 選擇多個項目
// 批量刪除
```

### 2. 撤銷刪除
```typescript
// 刪除後顯示 Toast："已刪除，點擊撤銷"
// 5 秒內可以恢復
// 超時後才真正軟刪除
```

### 3. 圖片優化
```typescript
// 壓縮圖片減少存儲空間
// 生成縮略圖（thumbnail）用於列表預覽
// 全尺寸用於詳情頁
```

### 4. 刪除統計
```typescript
// 在設置中顯示刪除統計
// "已刪除 X 個快取，Y 個卡片"
// 提供「永久刪除」選項
```

---

## 📝 相關文件

- `src/screens/CacheListScreen.tsx` - 快取列表（刪除 + 圖片預覽）
- `src/screens/CardsListScreen.tsx` - 卡片列表（刪除 + 圖片預覽）
- `src/database/models/CachedItem.ts` - 快取資料模型
- `src/database/models/Card.ts` - 卡片資料模型

---

最後更新：2026-02-12
