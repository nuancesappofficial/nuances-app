# Supabase 設置指南

## 步驟 1: 創建 Supabase 專案

1. 前往 [Supabase Dashboard](https://supabase.com/dashboard)
2. 點擊 "New Project"
3. 填寫專案資訊：
   - Name: `nuances-app`
   - Database Password: 設置一個強密碼（保存好）
   - Region: 選擇最近的區域（例如：Southeast Asia (Singapore)）
4. 點擊 "Create new project" 並等待部署完成

## 步驟 2: 執行 SQL Schema

1. 在 Supabase Dashboard 左側選單中，點擊 "SQL Editor"
2. 點擊 "New Query"
3. 複製 `src/services/supabase/schema.sql` 的全部內容
4. 貼上並點擊 "Run" 執行
5. 確認所有表格和政策都創建成功

## 步驟 3: 創建 Storage Buckets

### 創建 cached-images bucket
1. 左側選單點擊 "Storage"
2. 點擊 "Create a new bucket"
3. 設置：
   - Name: `cached-images`
   - Public: **取消勾選**（保持私有）
4. 點擊 "Create bucket"
5. 點擊剛創建的 bucket，進入 "Policies" 標籤
6. 添加以下 RLS 政策：

```sql
-- Allow users to upload their own images
CREATE POLICY "Users can upload their own images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'cached-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to view their own images
CREATE POLICY "Users can view their own images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'cached-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own images
CREATE POLICY "Users can delete their own images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'cached-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### 創建 audio-files bucket
重複上述步驟，但將名稱改為 `audio-files`，並使用類似的 RLS 政策（替換 bucket_id）。

## 步驟 4: 配置環境變量

1. 在 Supabase Dashboard，點擊左下角的齒輪圖示（Settings）
2. 選擇 "API"
3. 複製以下資訊：
   - Project URL
   - anon public key

4. 在專案根目錄創建 `.env` 文件（複製 `.env.example`）：

```bash
cp .env.example .env
```

5. 填入 Supabase 資訊：

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## 步驟 5: 測試連接

在 `App.tsx` 中添加測試代碼：

```typescript
import { supabase } from './src/services/supabase/client';

// 測試連接
useEffect(() => {
  const testConnection = async () => {
    const { data, error } = await supabase.from('profiles').select('count');
    if (error) {
      console.error('Supabase connection error:', error);
    } else {
      console.log('Supabase connected successfully!');
    }
  };
  testConnection();
}, []);
```

## 步驟 6: 設置 Edge Functions（可選，暫時跳過）

Edge Functions 用於 AI 分析和背景任務。MVP 階段可以先在客戶端調用 AI API。

## 驗證清單

- [ ] Supabase 專案已創建
- [ ] 所有表格（profiles, cached_items, cards, review_history, sync_metadata）已創建
- [ ] RLS 政策已啟用並測試
- [ ] Storage buckets（cached-images, audio-files）已創建
- [ ] Storage RLS 政策已配置
- [ ] 環境變量已設置在 `.env` 文件
- [ ] 測試連接成功

## 常見問題

### Q: 為什麼需要 Row Level Security (RLS)？
A: RLS 確保用戶只能訪問自己的數據，即使有人獲得了 anon key 也無法訪問他人的數據。

### Q: anon key 安全嗎？
A: 是的，anon key 設計為可以公開的。真正的安全性由 RLS 和 JWT 驗證保證。

### Q: 如何重置資料庫？
A: 在 SQL Editor 中運行 `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`，然後重新執行 schema.sql。

## 下一步

完成 Supabase 設置後，繼續：
- [ ] 配置 WatermelonDB
- [ ] 實現同步邏輯
- [ ] 測試離線功能
