# Handoff — Dev/Normal Flow 對齊（給下一個 fresh chat）

> 這是單向交接。請完整讀完本文再動手。語言：繁體中文。

## 1. 主目標（Main End Goal）

**對齊 dev mode（dev fresh account entrance）與 normal mode 的一切流程。**
dev 以全新付費用戶身分進入，走與 normal 完全相同的 first-run journey：
`onboarding → video tour → interactive tutorial → app`，不跳過任何一步。
此外，dev 對共用元件的 UIUX 變更要讓 normal 跟進（因共用元件已自然成立）。

**規格文件**：[`plans/dev-vs-normal-flow-differences.md`](plans/dev-vs-normal-flow-differences.md:1)
（第 6 節「實作計畫（完全對齊）」是本次範圍；第 4 節是差異總表。）

## 2. 已完成（累計）

### Commit `1a0f2c8` — `feat(dev): align dev fresh-user flow with normal mode (partial/broken commit)`
7 個檔案，389 insertions / 80 deletions。5 處對齊修改全部完成並已 commit：

| # | 位置 | 修改 |
|---|---|---|
| C1 | [`App.tsx`](App.tsx:1413) | `setNeedsVideoTour(VIDEO_TOUR_ENABLED)`（原 `\|\| devFreshUserSimulatorEnabled`） |
| C2 | [`App.tsx`](App.tsx:1550) | onboarding 完成後 `setNeedsVideoTour(VIDEO_TOUR_ENABLED && stage==='video-tour')` |
| C3 | [`App.tsx`](App.tsx:1565) | `startTutorialOnMount={startTutorialAfterVideoTour}` |
| C4 | [`App.tsx`](App.tsx:1561) | RootNavigator key 用 `startTutorialAfterVideoTour`（含 `${userId}:` 前綴） |
| 清理 | [`App.tsx`](App.tsx:1489) | `shouldRenderVideoTour` 移除 `\|\| devFreshUserSimulatorEnabled`；移除未使用變數 |

### Commit `aaf8e3c` — `feat(dev): complete dev/normal alignment dependency closure (pure alignment files)`
**策略 A**（用戶確認）：只 commit 純對齊線檔案，接受 commit 仍無法獨立編譯，其餘無關變更留在工作區。
4 個檔案，125 insertions / 4 deletions：
- [`userIdentity.ts`](src/services/auth/userIdentity.ts:14) — 無真實 session 時 fallback 到 `getActiveDevFreshUserId()`（支援 D2）
- [`ProfileMainFlow.tsx`](src/screens/flow/ProfileScreenFlow/ProfileMainFlow.tsx:499) — dev account delete 分支（`isDevFreshUserSimulatorEnabled() && onDevAccountDelete`）
- [`TourCompletionGreetingUI.tsx`](src/components/UI/DeckScreenUI/TourCompletionGreetingUI.tsx:42) — greeting 畫面加 video 播放（expo-video）
- [`tutorialPresentation.ts`](src/features/tour/tutorialPresentation.ts:6) — greeting video sizing/playback helpers

### Commit `ac44469` — `refactor(dev): dedupe clearLocalAccountData with AccountDeletionService`
1 個檔案，2 insertions / 24 deletions。移除 [`devFreshUserSimulator.ts`](src/features/auth/devFreshUserSimulator.ts:28) 的逐字重複 `clearLocalAccountData`，改用 [`AccountDeletionService.ts`](src/services/account/AccountDeletionService.ts:20) 的 `clearLocalAccountDataForUser`；清理未使用的 `Q`/`database` import。

**已驗證**：`npx tsc --noEmit` 通過、`npx eslint` 通過（完整工作區狀態）。

## 3. 關鍵背景：這是 BROKEN / PARTIAL COMMIT（仍成立）

Commit `1a0f2c8` + `aaf8e3c` **仍無法獨立編譯**。已 commit 的 `RootNavigator.tsx` 仍引用多個未 commit 檔案（來自其他功能線）。這是用戶明確接受的決策（策略 A）。

**已 commit 的對齊線檔案（7 + 4 + 1）**：
- `App.tsx`（M）
- `src/navigation/RootNavigator.tsx`（M）
- `src/services/account/AccountDeletionService.ts`（M）
- `src/features/auth/devFreshUserSimulator.ts`（A）
- `src/features/auth/devFreshUserSimulatorCore.ts`（A）
- `src/screens/dev/TourCompletionGreetingLab.tsx`（A）
- `src/services/analytics/growthAnalyticsRuntime.ts`（A）⚠️ 此檔屬 growth analytics 線，非對齊線，但已在 1a0f2c8 混入
- `src/services/auth/userIdentity.ts`（M）
- `src/screens/flow/ProfileScreenFlow/ProfileMainFlow.tsx`（M）
- `src/components/UI/DeckScreenUI/TourCompletionGreetingUI.tsx`（M）
- `src/features/tour/tutorialPresentation.ts`（M）

**仍未 commit 的檔案（其他功能線，留在工作區，勿混入對齊 commit）**：
- `src/contexts/AppTourContext.tsx`（tutorial 重構線：移除 STEP_2/3/4）
- `src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx`（tutorial 重構線：STEP_13→STEP_14、long-press album）
- `src/screens/flow/CacheScreenFlow/CreateCardFlow.tsx`（OCR + create-card + tutorial 混合線）
- `src/screens/flow/ProfileScreenFlow/ProfileSettingOptionsFlow.tsx`（growth analytics 訂閱追蹤線）
- `src/services/subscription/SubscriptionService.ts`（pronunciation access 線）
- `src/theme/colors.ts`（純 UI 微調，無關線）

> ⚠️ 工作區仍有 ~55 個 tracked modified + 大量 untracked 檔案，橫跨多個先前 session 的功能線（growth analytics、content-creation-manager、tiktok-remix-agent、pronunciation、ocr、app-store assets 等）。這些**不屬於** dev/normal 對齊線，勿一次 commit。

## 4. 已完成 vs 待辦

### ✅ 已完成
- **Step 1**：補齊對齊線依賴閉合（策略 A，commit `aaf8e3c`）
- **Step 2**：重構 Duplicated Code（commit `ac44469`）
- **Step 3（靜態部分）**：驗證 C1-C4 修改正確、first-run journey 邏輯正確、`tsc`/eslint 通過
- **code-review**（固定點 `1a0f2c8`）：完成，見 §5

### ⏳ 待辦（下一個 session）
- **Step 3（實際 UI 驗證）**：需 dev build 手動測試
  1. dev build 開 `EXPO_PUBLIC_INTERNAL_TESTER_TOOLS`，走 test account 進入
  2. 確認依序出現 onboarding → video tour → interactive tutorial → app
  3. 設 `EXPO_PUBLIC_VIDEO_TOUR_ENABLED=false`，確認 dev 也跳過 video tour（與 normal 一致）
  4. 確認 normal mode（真實登入）行為不變
  5. 確認 dev 與 normal 在教程結束後都會遇到 greeting 畫面（含 video）

### ✅ Step 3 靜態邏輯驗證（session 3，2026-08-04，已完成）
> 用戶當眼睛操作 UI，agent 只檢查 code 與邏輯。以下為 agent 完成的靜態驗證，UI 手動驗證仍待用戶執行。

- **`tsc --noEmit` 通過**、**eslint（對齊線檔案）通過**、**`firstRunJourney.test.mjs` 4/4 通過**（驗證 onboarding → video-tour → tutorial → app 完整順序）。
- **C1-C4 修改正確落地**（[`App.tsx`](App.tsx:1413) / [`App.tsx`](App.tsx:1550) / [`App.tsx`](App.tsx:1565) / [`App.tsx`](App.tsx:1561)）。
- **first-run 渲染決策樹**（[`App.tsx`](App.tsx:1512)）dev 與 normal 共用同一路徑，不再有 `devFreshUserSimulatorEnabled` 特判：
  - dev fresh user 進入（1411-1416）：`setNeedsOnboarding(true)` + `setNeedsVideoTour(VIDEO_TOUR_ENABLED)` → 先顯示 OnboardingFlow。
  - onboarding 完成（1544-1555）：`advanceFirstRunJourney` → stage `video-tour` → `setNeedsVideoTour(VIDEO_TOUR_ENABLED && stage==='video-tour')` → 顯示 VideoTourFlow。
  - video tour 完成（1525-1531）：`advanceFirstRunJourney` → stage `tutorial` → `setStartTutorialAfterVideoTour(true)` → RootNavigator 以 `startTutorialOnMount=true` 掛載 → 啟動 interactive tutorial。
  - `VIDEO_TOUR_ENABLED=false` 時（1553-1555）：onboarding 完成後 `setStartTutorialAfterVideoTour(!VIDEO_TOUR_ENABLED)=true` → 直接進 tutorial，跳過 video tour（與 normal 一致）。
- **greeting 畫面（含 video）**：`DeckMainFlow`（共用元件）tutorial 完成 → `completeTour`（[`DeckMainFlow.tsx`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:289)）→ `showTourCompletionGreeting`（[`DeckMainFlow.tsx`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:281)）→ `TourCompletionGreetingUI`（含 `useVideoPlayer` + `VideoView`，[`TourCompletionGreetingUI.tsx`](src/components/UI/DeckScreenUI/TourCompletionGreetingUI.tsx:47)）。dev/normal 共用，都會遇到。
- **環境狀態**：模擬器 iPhone 17 Pro 已 booted，Nuances app 已安裝（`com.jeffenglishlearning.nuances`），Metro 在 8081 跑著。`.env.local` 目前 `EXPO_PUBLIC_INTERNAL_TESTER_TOOLS=true`、`EXPO_PUBLIC_VIDEO_TOUR_ENABLED=true`（Step 3 初始狀態已就緒）。

### ✅ 已解決 BUG：dev interactive tutorial 邏輯啟動但 UI 沒顯示（session 3 發現，session 5 2026-08-05 修復）
> 用戶在真機跑 dev build（`expo run:ios`），提供 `[FirstRunTrace]` 日誌。**用戶確認 interactive tutorial 真的沒跑**。
>
> **Session 5 根因（已由 log 證實，推翻 Session 4 診斷）**：
> - log 出現兩個不同 userId：`auth.dev_fresh_user_simulator_ready` → `dev-fresh-user-1785902016113`，但 `default_experience_card.ensure_result` / `cache_list.loaded` → `4d7726a4-429c-4885-ad4c-5b915b2ce0ec`（真實 Supabase UUID）。
> - 機制：dev fresh-user 登入（[`App.tsx`](App.tsx:1399)）只設 React `userId` state + `activeDevFreshUserId`，**未清除 SecureStore 持久化的真實 Supabase session**（`persistSession:true`）。[`getCurrentSessionUserId()`](src/services/auth/userIdentity.ts:11) 原邏輯 `return session?.user?.id ?? getActiveDevFreshUserId()` 因真實 session 存在而回傳真實 UUID，永遠不走到 dev fallback。
> - 後果：`ensureDefaultExperienceCard` / cache list 全跑在**真實用戶**資料範圍 → `skipped=already_seen`、`count=0`、`stackCards=0 topIsDefault=false` → 預設卡從未為 dev fresh user 建立 → STEP_5 無可見 UI。
> - **修法（session 5，已 commit 於工作區）**：[`getCurrentSessionUserId()`](src/services/auth/userIdentity.ts:11) 改為 dev fresh user 優先（`getActiveDevFreshUserId()` 有值即回傳，否則才用真實 session）。`tsc --noEmit` 通過。
> - **待驗證**：重跑 dev build 確認 `ensure_result=created=true`、`cache_stack.render` 的 `stackCards>0 topIsDefault=true`、STEP_5 顯示 swipe tug hint。

**日誌證據（矛盾點）**：
- `auth.dev_fresh_user_simulator_ready`（userId `dev-fresh-user-...`）→ onboarding 顯示 ✅
- `onboarding.completed_and_routed` → video tour 顯示 ✅
- `video_tour.completed` → `tutorial.start_requested` → `tutorial.started` → **tutorial 邏輯有觸發**（[`RootNavigator.tsx`](src/navigation/RootNavigator.tsx:401) 的 `appTour.startTour()` 執行了）
- 但**用戶確認 UI 沒顯示 interactive tutorial**

**已知線索**：
- `appTour.startTour()`（[`AppTourContext.tsx`](src/contexts/AppTourContext.tsx:116)）設 `setIsRunning(true)` + `setStep('STEP_5_PROCESS_CACHE_CARD')`，無條件阻擋。
- `DeckMainFlow`（[`DeckMainFlow.tsx`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:225)）用 `useAppTour()`，`STEP_5_PROCESS_CACHE_CARD` 只 `tabSwipeContext?.goToTab(1)` 切到 cache tab（[`DeckMainFlow.tsx`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:382)），**STEP_5 本身可能沒有明顯 spotlight UI**。
- tutorial UI 由 `tourStep` 驅動（[`DeckMainScreenUI.tsx`](src/components/UI/DeckScreenUI/DeckMainScreenUI.tsx:681) 的 `TutorialSpotlight active={tourStep === 'STEP_11_CREATE_ALBUM'}` 等）。
- `video_tour.mark_seen_failed`：supabase 對 dev userId（非合法 UUID）update 失敗（D2 預期），catch 只 warn 不阻止，不影響流程。

**調查方向（下一個 session）**：
1. 確認 `STEP_5_PROCESS_CACHE_CARD` 是否有可見 UI；若無，tutorial「啟動」但用戶看不到第一個 step 是預期還是 bug。
2. 確認 `DeckMainFlow` 是否真的 re-render 並把 `appTour.step` 傳給 `DeckMainScreenUI`（context 傳遞是否正常）。
3. 對照 normal mode：fresh real account 的 tutorial 是否正常顯示（用戶說有），找出 dev 與 normal 的渲染差異。
4. 檢查是否 tutorial overlay 被其他元件（curtain、splash）蓋住。

---

#### 🔍 Session 4 診斷（2026-08-05，agent 靜態分析，尚未經 UI 驗證）

> ⚠️ **已被 Session 5 推翻**：Session 5 的 `[FirstRunTrace]` log 顯示根因是 `getCurrentSessionUserId()` 回傳真實 session 的 UUID（`4d7726a4-...`）而非 dev fresh user id（`dev-fresh-user-...`），導致預設卡從未為 dev fresh user 建立。下方「預設卡沒建 → STEP_5 無 UI」的結論方向正確，但**機制不是 seen key v1/v3 沒清**，而是 userId 解析錯誤。修法見 §「已解決 BUG」。

**核心診斷**：`STEP_5_PROCESS_CACHE_CARD` 的**唯一可見 UI 是 cache stack 頂部預設體驗卡片的 swipe tug hint**（邊框 + 移動箭頭），由 [`CacheStackUI.tsx`](src/components/UI/CacheScreenUI/CacheStackUI.tsx:229) 的 `showSwipeTugHint={Boolean(item.isDefaultExperienceCard && isTopCard)}` 驅動。而 `TutorialSpotlight`（[`TutorialSpotlight.tsx`](src/components/UI/shared/TutorialSpotlight.tsx:14)）**是 no-op**——它只渲染 children，完全忽略 `active`/`onSpotlightPress`，所以整個 tutorial **沒有任何 spotlight overlay**。

因此：**若 dev 模式下預設體驗卡片沒有被建立/顯示，STEP_5 就什麼都不顯示**，tutorial「啟動」但用戶看不到任何東西。dev 與 normal 的差異最可能出在「預設卡片是否建立並顯示」。

**6 個最可能藏 bug 的檔案**（依可能性排序）：
1. [`src/features/cache/defaultExperienceCard.ts`](src/features/cache/defaultExperienceCard.ts:90) — `ensureDefaultExperienceCard()` 只在「真正空帳號」（0 cache + 0 cards）才建立卡片；seen key 是 `nuances:default_experience_card:v3:${userId}`。dev 若被判定 not_empty 或 already_seen 就不建卡。
2. [`src/screens/flow/CacheScreenFlow/index.tsx`](src/screens/flow/CacheScreenFlow/index.tsx:937) — `visibleCacheIds` 被 `isCacheFocused` 門控（[`index.tsx`](src/screens/flow/CacheScreenFlow/index.tsx:938)），`stackCards` 依 `visibleCacheIds` 過濾。
3. [`src/screens/flow/CacheScreenFlow/hooks/useCacheListDataSource.ts`](src/screens/flow/CacheScreenFlow/hooks/useCacheListDataSource.ts:62) — 呼叫 `ensureDefaultExperienceCard(userId)` 的地方。
4. [`src/navigation/RootNavigator.tsx`](src/navigation/RootNavigator.tsx:389) — tutorial 啟動 effect（切 tab + `startTour()`）。
5. [`src/components/UI/CacheScreenUI/CacheStackUI.tsx`](src/components/UI/CacheScreenUI/CacheStackUI.tsx:229) — `showSwipeTugHint` 開關。
6. [`src/components/UI/shared/TutorialSpotlight.tsx`](src/components/UI/shared/TutorialSpotlight.tsx:14) — **no-op**，無 spotlight overlay。

**已加入的診斷 log（5 個檔案，尚未跑過）**：
- [`defaultExperienceCard.ts`](src/features/cache/defaultExperienceCard.ts:161) — `default_experience_card.ensure_result`（`created=true` / `skipped=already_seen` / `skipped=not_empty`）
- [`useCacheListDataSource.ts`](src/screens/flow/CacheScreenFlow/hooks/useCacheListDataSource.ts:68) — `cache_list.loaded`（count + 是否有 default card）
- [`CacheScreenFlow/index.tsx`](src/screens/flow/CacheScreenFlow/index.tsx:930) — `cache_stack.render`（isCacheFocused + visibleIds + stackCards + topIsDefault）
- [`RootNavigator.tsx`](src/navigation/RootNavigator.tsx:397) — `tutorial.switch_tab` 與 `tutorial.started`（含 `selectedTabIndex`）
- [`DeckMainFlow.tsx`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:384) — `deck_main.step5_go_cache`

**下一步（下一個 session）**：
1. 用戶在真機重跑 dev build，回報上述 `[FirstRunTrace]` log。
2. 依 log 判斷：`ensure_result` 是 `created=true` 還是 `skipped=*`？`cache_stack.render` 的 `stackCards`/`topIsDefault` 是否為 0/false？
3. 確認根因後再修（**先確認診斷再動手**，勿直接改）。
4. 修完更新本節。

### ⏳ 待用戶手動 UI 驗證（Step 3 剩餘部分）
> agent 無法操作 UI。以下為精確操作步驟，用戶在真機執行後回報結果。

1. **確認 dev tutorial UI 顯示**（`.env.local` 維持 `INTERNAL_TESTER_TOOLS=true`、`VIDEO_TOUR_ENABLED=true`）：走 test account 進入 → 進 app 後確認是否自動切到 cache tab 且有 tutorial 引導 UI（spotlight/箭頭/step 提示）。
2. **`VIDEO_TOUR_ENABLED=false` 跳過 video tour**：改 `.env.local` 為 `EXPO_PUBLIC_VIDEO_TOUR_ENABLED=false`，重啟 dev build → 確認 dev 也跳過 video tour（onboarding 後直接進 tutorial）。
3. **normal mode 行為不變**：真實登入（Google/Apple）→ 確認 first-run journey 與改前一致。
4. **greeting 畫面（含 video）**：dev 與 normal 各走完 tutorial → 確認教程結束後都遇到 greeting 畫面且 video 播放。

## 5. Code-review 結果（固定點 `1a0f2c8`，規格 `plans/dev-vs-normal-flow-differences.md`）

### Standards 軸
- 0 hard violation。重構乾淨（Duplicated Code 已消除）。
- 4 judgement calls（皆非 blocking）：
  1. `getGreetingVideoContentFit()` 恆回 `'contain'`（Speculative Generality，可內聯）
  2. `getGreetingVideoPlayback` 名稱誤導（Mysterious Name，loop/muted 恆 true）
  3. `getGreetingVideoHeight/Width` 成對使用（Data Clumps，可合併為 `getGreetingVideoSize`）
  4. `ProfileMainFlow` dev 分支內嵌（輕微 Feature Envy）

### Spec 軸
- 核心依賴閉合正確（D6 本地刪除、D2 identity fallback）。
- **greeting video 已確認為必要功能**（用戶澄清）：greeting 畫面本該有 video，且 dev 與 normal 兩個 mode 都要在教程結束後遇到它。`TourCompletionGreetingUI` 是共用元件，在 [`DeckMainFlow.tsx`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:1770) 被使用，dev/normal 都會走。**非 scope creep**。
- 次要矛盾（可選修）：`getGreetingVideoPlayback` 固定 `muted:true`，但 `useVideoPlayer` 設 `audioMixingMode='mixWithOthers'`（永遠靜音下此設定無效）。

## 6. 給新 agent 的注意事項

- **規格**：[`plans/dev-vs-normal-flow-differences.md`](plans/dev-vs-normal-flow-differences.md:105) 第 6 節。
- **dev simulator 核心**：[`devFreshUserSimulatorCore.ts`](src/features/auth/devFreshUserSimulatorCore.ts:1)（純函式，可 Node 測試）；[`devFreshUserSimulator.ts`](src/features/auth/devFreshUserSimulator.ts:1)（含 native 依賴）。
- **first-run 狀態機**：[`firstRunJourney.ts`](src/features/tour/firstRunJourney.ts:1)（`onboarding → video-tour → tutorial → app`）。
- **共用元件**（dev 變更會影響 normal）：`OnboardingFlow`、`VideoTourFlow`、`AppTourContext`、`RootNavigator`、`firstRunJourney`、`TourCompletionGreetingUI`、`DeckMainFlow`。
- **dev-only 分支**（不影響 normal）：`isDevFreshUserId`、`isDevFreshUserSimulatorEnabled`、`isScreenshotDemoModeEnabled`。
- 本 repo 已跑過 `setup-matt-pocock-skills`：issue 用 Local Markdown（`.scratch/`），domain 用單一 context。
- 若需跑 code-review：固定點用 `1a0f2c8`，規格用 [`plans/dev-vs-normal-flow-differences.md`](plans/dev-vs-normal-flow-differences.md:1)。
