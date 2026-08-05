# Handoff：修復「刪除帳號後重新登入仍看到舊卡片」

> 給下一個 fresh chat 的交接 prompt。直接複製「交接 prompt」段落給新 chat 即可。

## 主目標（Main Goal）
修復 delete-account bug：**真實帳號在 dev build（有 dev entrance / 內部測試工具）下按「刪除帳號」，必須走真實的 server-backed 刪除**，否則該帳號的雲端卡片不會被刪除，重新登入後舊卡片又出現。

## 已完成（Done）
所有程式碼修改 + 回歸測試都已落地，**尚未跑 type-check**（App.tsx 修改後未驗證過編譯）。

### 根因
[`ProfileMainFlow.tsx`](../../src/screens/flow/ProfileScreenFlow/ProfileMainFlow.tsx:495) 原本用 `isDevFreshUserSimulatorEnabled()`（只檢查「是否 dev build + 內部測試工具」）來決定刪除路徑。結果**真實帳號在 dev build 登入時，刪除帳號被誤導到 dev-only 的 `handleDevAccountDelete`（只清本地）**，沒呼叫真實的 `deleteCurrentAccount()`（會呼叫 Supabase `delete-account` edge function 刪伺服器資料）。所以真實帳號的雲端卡片存活，重新登入又出現。

### 修改清單
1. [`devFreshUserSimulatorCore.ts`](../../src/features/auth/devFreshUserSimulatorCore.ts:99) — 新增純函式：
   - `shouldUseDevAccountDelete(userId)`：只有「目前 active 的 dev fresh-user id」才回 true
   - `resolveAccountDeletionPath(currentUserId, hasDevDeleteHandler)`：回傳 `'dev-simulator' | 'real-account'`，只有「有 dev handler 且目前使用者真的是模擬帳號」才走 dev-simulator
2. [`devFreshUserSimulator.test.mjs`](../../src/features/auth/devFreshUserSimulator.test.mjs) — 新增 2 個回歸測試（共 7 pass）
3. [`ProfileMainFlow.tsx`](../../src/screens/flow/ProfileScreenFlow/ProfileMainFlow.tsx:495) — `performAccountDeletion` 改用 `resolveAccountDeletionPath`，真實帳號走 `deleteCurrentAccount()`
4. [`AccountDeletionService.ts`](../../src/services/account/AccountDeletionService.ts:46) — 把 `clearLocalAccountCaches` 從 private 改 export
5. [`App.tsx`](../../App.tsx:1463) — `handleDevAccountDelete` 補上 `clearLocalAccountCaches` + `clearUserSettings`（原本只清 WatermelonDB rows，漏了 AsyncStorage cache 與 user settings）

### 驗證已做
- 回歸測試 7 pass：`node --test src/features/auth/devFreshUserSimulator.test.mjs`
- 回饋迴圈：暫時把 `resolveAccountDeletionPath` 弄成 buggy（有 dev handler 就回 dev-simulator），測試紅（`AssertionError: expected: 'real-account'`），確認測試能捕捉此 bug，再還原（綠）
- type-check 在 App.tsx 修改**之前**通過（exit 0），**之後未跑**

## 收尾驗證結果（已完成）
1. ✅ **type-check**：`npx tsc --noEmit` → exit 0（App.tsx 修改後編譯通過）
2. ✅ **回歸測試**：`node --test src/features/auth/devFreshUserSimulator.test.mjs` → 7 pass / 0 fail
3. ✅ **code-review**（兩軸）：
   - Standards：無硬性違規；唯一 judgement call 是 `App.tsx` `handleDevAccountDelete` 手動重複 `simulateFreshUser` 的清理序列（dev-only 路徑，語意不同，抽取共用函式屬可選優化）
   - Spec：主目標達成——真實帳號在 dev build 一律走 `'real-account'` → `deleteCurrentAccount()`（server-backed）；修改清單 5 項全落地；無 scope creep
4. ✅ **Phase 6 清理**：無 `[DEBUG-...]` instrumentation 殘留；無 throwaway prototypes；`[DevAccountDelete]` console.warn 為刻意保留的 dev-only 診斷標記
5. ⏳ **UI 驗證**（需真人 dev build 手動驗證，非自動化）：
   - 用真實帳號（real Gmail）登入 dev build
   - 按「刪除帳號」→ 應回到 auth screen
   - 重新登入同一個真實帳號 → **不應再看到舊卡片**（因為這次走真實 server 刪除）
   - 對照：模擬帳號（dev entrance）按刪除帳號 → 仍走本地清理，行為不變

## Post-mortem（diagnosing-bugs Phase 6）
**根因**：`ProfileMainFlow.performAccountDeletion` 用 build-level 檢查 `isDevFreshUserSimulatorEnabled()` 決定刪除路徑，而非 identity-level 檢查。真實帳號在 dev build 被誤導到 dev-only 的 `handleDevAccountDelete`（只清本地），沒呼叫 `deleteCurrentAccount()`（Supabase `delete-account` edge function），雲端卡片存活，重新登入又出現。

**正確 hypothesis**：刪除路徑的選擇必須以「目前使用者身份」為準，而非「build 環境」。修復將決策收斂到純函式 `resolveAccountDeletionPath(currentUserId, hasDevDeleteHandler)`，只有「目前 active 的 dev fresh-user id」才走 dev 路徑。

**什麼能預防此 bug**：這是「隱藏耦合」——刪除路徑依賴 build 環境而非使用者身份，且無測試鎖定該決策。修復已：(a) 把決策抽成可測純函式；(b) 新增回歸測試鎖定「真實帳號在 dev build 仍走 real-account」。此為架構層教訓：**凡依賴環境的決策，應以 identity 為準並用純函式封裝 + 測試鎖定**，避免再次發生。

## 交接 prompt（複製這段給新 chat）

```
語言：一律用繁體中文。溝通格式：i-have-adhd（先講下一步、多步驟編號、每輪重述進度、給時間估算、不寒暄）。

任務：完成「刪除帳號後重新登入仍看到舊卡片」bug 修復的收尾驗證。

背景：根因是 ProfileMainFlow.tsx 用 isDevFreshUserSimulatorEnabled()（build-level 檢查）誤判，導致真實帳號在 dev build 按刪除帳號時走 dev-only 本地清理，沒刪伺服器資料。已修好：新增 resolveAccountDeletionPath() 只在「目前使用者真的是模擬帳號」時才走 dev 路徑，真實帳號一律走 deleteCurrentAccount()（server-backed）。所有程式碼修改已落地，回歸測試 7 pass。

請依序執行：
1. 跑 `npx tsc --noEmit` 驗證 App.tsx 修改後能編譯（這是目前唯一未驗證的關鍵步驟）。若有型別錯誤，修到過。
2. 跑 `node --test src/features/auth/devFreshUserSimulator.test.mjs` 確認 7 個測試全過。
3. 跑 code-review skill 審查這次改動（對照 Standards 與 Spec）。
4. 完成 diagnosing-bugs Phase 6：清理 + post-mortem。
5. 最後用 attempt_completion 回報：type-check 結果、測試結果、UI 驗證步驟。

修改過的檔案：
- src/features/auth/devFreshUserSimulatorCore.ts（新增 shouldUseDevAccountDelete + resolveAccountDeletionPath）
- src/features/auth/devFreshUserSimulator.test.mjs（新增 2 回歸測試）
- src/screens/flow/ProfileScreenFlow/ProfileMainFlow.tsx（performAccountDeletion 改用 resolveAccountDeletionPath）
- src/services/account/AccountDeletionService.ts（export clearLocalAccountCaches）
- App.tsx（handleDevAccountDelete 補 clearLocalAccountCaches + clearUserSettings）
```
