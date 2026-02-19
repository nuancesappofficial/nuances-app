# P0（本週必做）執行清單

- [x] 真實身份整合：移除 `demo-user`，改為 Supabase Auth `user.id`
  - `App.tsx` 啟動時以 `supabase.auth.getSession()` 取得 `user.id`
  - `App.tsx` 監聽 `onAuthStateChange` 更新目前 user
  - `src/screens/CacheListScreen.tsx` 貼上剪貼簿前取得目前 Auth user id
  - `src/screens/AddCacheItemScreen.tsx` 新增快取前要求已登入 user id
  - `src/services/auth/userIdentity.ts` 新增統一 user id 取得工具

- [x] AI 防濫用：`ai-proxy` 加 JWT 驗證、每人速率限制、每日配額
  - `supabase/config.toml`：`verify_jwt = true`
  - `supabase/functions/ai-proxy/index.ts`：
    - 驗證 `Authorization: Bearer <JWT>` 並取 `sub` 作為 user id
    - 每分鐘速率限制（預設 20，`AI_RATE_LIMIT_PER_MINUTE` 可覆寫）
    - 每日配額（預設 200，`AI_DAILY_QUOTA` 可覆寫）
    - 超限回傳 `429`

- [x] 編譯品質清零
  - `npm run type-check`：0 error
  - `npm run lint`：0 error（目前僅 warnings，無 error）

- [ ] 舊金鑰全面撤銷確認（OpenAI/Gemini）
  - 需要在雲端後台手動完成與截圖存證（本地無法直接操作帳號後台）
  - 建議流程：
    - OpenAI dashboard 撤銷所有舊 key，僅保留新 key
    - Google AI/GCP 撤銷所有舊 key，僅保留新 key
    - Supabase Edge Function Secrets 更新為新 key
    - 以 401/403 驗證舊 key 已失效、以 200 驗證新 key 可用

- [x] DevTools 下線保護：正式版不可見（僅 `__DEV__`）
  - `src/navigation/RootNavigator.tsx` 以 `__DEV__` 條件註冊 `DevTools` tab
