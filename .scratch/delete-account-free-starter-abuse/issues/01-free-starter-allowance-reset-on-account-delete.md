# 刪除帳號後可重領 20 張免費新手卡（free starter allowance 重置）

Status: fixed
Type: bug
Severity: high（商業邏輯漏洞，可被濫用無限刷免費 AI 生成額度）

## 摘要

使用者刪除帳號後，server 端 `free_starter_card_generations` 額度記錄隨帳號級聯刪除。使用者用同一個 email 重新註冊會得到**新的 user_id**，新 user_id 查無額度記錄 → 視為 0 已用 → **重新獲得 20 張免費 AI 生成卡**。重複「刪帳號 → 重註冊」流程 = 無限刷免費額度。

## 根因

1. 免費新手額度以 `user_id` 為 key 計量：[`get_free_starter_card_allowance(p_user_id, ...)`](supabase/migrations/20260729000000_add_free_starter_card_allowance.sql:103) 查 `where user_id = p_user_id`。
2. 額度表 [`free_starter_card_generations.user_id`](supabase/migrations/20260729000000_add_free_starter_card_allowance.sql:5) 有 `references auth.users(id) on delete cascade`。
3. [`delete-account` edge function](supabase/functions/delete-account/index.ts:155) 最後呼叫 `supabase.auth.admin.deleteUser(userId)` → 級聯刪除該 user 的額度記錄。
4. 重新註冊（同 email）→ Supabase 產生新 user_id → 額度計量從零開始。

## 影響

- 免費使用者可無限取得 20 張 AI 生成卡額度（`FREE_STARTER_CARD_LIMIT = 20`，[`freeStarterAllowance.ts`](supabase/functions/ai-proxy/_shared/freeStarterAllowance.ts:1)）。
- 每次刪帳號也消耗 server 資源（刪除 + 重新註冊 + 重新生成），可被用來刷 AI 成本。
- 此漏洞**非**本次「刪除帳號後重新登入仍看到舊卡片」bug 修復引入，但修復後真實帳號刪除真的會走 server 端，漏洞變得更可被利用。

## 觸發路徑

1. 免費使用者用完 20 張免費卡額度。
2. 在 app 內按「刪除帳號」→ server 刪除 auth user + 級聯刪額度記錄。
3. 用同一個 email 重新註冊 → 新 user_id → 再領 20 張免費卡。
4. 重複步驟 2-3。

## 建議修復方向（需 server 端 + 商業決策，未實作）

- **方案 A（額度不隨帳號刪除重置）**：把 `free_starter_card_generations.user_id` 的 FK 改為不 cascade，或改用「以 email / 裝置指紋為 key 的終身額度表」，刪除帳號後仍保留額度消耗記錄。
- **方案 B（email 冷卻/黑名單）**：刪除帳號後，同一 email 短期內不能重新註冊，或重新註冊時繼承原額度消耗。
- **方案 C（裝置指紋）**：以裝置為 key 計量終身免費額度，跨帳號共享。

## 驗證

- 需 server 端測試：刪除帳號後，確認 `free_starter_card_generations` 記錄是否殘留；重新註冊同 email 後 `get_free_starter_card_allowance` 回傳的剩餘額度。
- 需確認 Supabase `deleteUser` 的級聯行為在實際 DB 上的表現。

## 相關

- 本次 bug 修復交接：[`plans/handoff-delete-account-fix.md`](plans/handoff-delete-account-fix.md:1)
- 額度 migration：[`20260729000000_add_free_starter_card_allowance.sql`](supabase/migrations/20260729000000_add_free_starter_card_allowance.sql:1)
- 額度決策邏輯：[`freeStarterAllowance.ts`](supabase/functions/ai-proxy/_shared/freeStarterAllowance.ts:1)
- 刪除帳號 edge function：[`delete-account/index.ts`](supabase/functions/delete-account/index.ts:1)

## 決策記錄

- **日期**：2026-08-05
- **決定**：採**方案 A** — 改為以 email 為 key 的終身額度計量，堵住「同 email 刪帳號重註冊 → 額度重置」路徑。已實作並驗證。
- **狀態**：`fixed` — 已修復。

### 實作內容

1. **migration**：[`20260805000000_add_email_keyed_free_starter_allowance.sql`](supabase/migrations/20260805000000_add_email_keyed_free_starter_allowance.sql:1)
   - 移除 `free_starter_card_generations.user_id` 的 `on delete cascade` FK，刪帳號不再清掉額度記錄。
   - 新增 `email` 欄位作為計量 key，並回填既有記錄。
   - 改寫 3 個 RPC（`claim` / `finish` / `get_allowance`）以 email 計量；email 為 null（phone-only）時 fallback 到 user_id，維持既有行為。
2. **ai-proxy 呼叫端**：[`ai-proxy/index.ts`](supabase/functions/ai-proxy/index.ts:2221) — `claimFreeStarterCard` / `finishFreeStarterCard` / `hasFreeStarterAccess` 傳入 `authUser.email`。
3. **tts-proxy 呼叫端**：[`tts-proxy/index.ts`](supabase/functions/tts-proxy/index.ts:441) — `get_free_starter_card_allowance` 傳入 `authUser.email`。
4. **測試輔助腳本**：[`reset-fresh-test-account.mjs`](scripts/reset-fresh-test-account.mjs:105) — 同步傳 email。

### 驗證（本地 Postgres 實測）

- 同 email 兩個 user_id：user1 領 3 張（success）→ 刪除 user1 → user2 同 email 重註冊 → claim 回傳 `(claimed,4,16)`，allowance `used=3, remaining=16`。**額度跨帳號累計，不再重置為 20**。
- email-less user：fallback 到 user_id 計量正常（`used=1, remaining=18`）。
- 純函式測試 [`freeStarterAllowance.test.mjs`](supabase/functions/ai-proxy/_shared/freeStarterAllowance.test.mjs:1) 4 個測試全過（未改動）。

### 已知限制

- 此修復堵住「同 email 重註冊」路徑；若使用者用**不同 email** 重註冊仍可重領（需方案 C 裝置指紋才能根治，本次未做）。
