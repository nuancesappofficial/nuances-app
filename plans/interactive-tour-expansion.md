# 互動式教學擴充計畫

## 目標

擴充互動式教學（[`AppTourContext.tsx`](src/contexts/AppTourContext.tsx:8)）的步驟，並把含影片的歡迎通知（[`TourCompletionGreetingUI.tsx`](src/components/UI/DeckScreenUI/TourCompletionGreetingUI.tsx:32)）移到所有步驟完成後顯示。

## 最終互動式教學流程

```
建卡 (STEP_5) → quiz 3題 (含發音題) → 建立相簿 (STEP_11/12)
→ 自動滑動到 album grid 第二頁 (帶動畫) → 長按更改相簿 (STEP_13/14)
→ 在相簿設定內換上自己的相片當封面 (STEP_14 內新增引導) → 歡迎通知 (移到最後)
```

> 註：「換上自己的相片」指的是在 STEP_14 相簿設定內，引導使用者點選「換封面」選自己的相片當相簿封面（沿用 [`handlePickAlbumCoverImage`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:1463)），**不是**跳到 Profile 頁換大頭照，也不是新增獨立的 STEP_15。

## 目前程式碼對應

| 流程步驟 | 目前程式碼 | 狀態 |
|---------|-----------|------|
| 建卡（固定選字 nuances） | STEP_5_PROCESS_CACHE_CARD → STEP_5_SELECT_TARGET → STEP_6 → STEP_7 | ✅ 已存在 |
| quiz 3題（含發音題） | `handlePressTodayReview` 啟動，`isDefaultExperienceTutorial=true` | ✅ 已存在 |
| 建立相簿 | STEP_11_CREATE_ALBUM → STEP_12_CONFIRM_ALBUM | ✅ 已存在（但實際未顯示） |
| 自動滑到第二頁 | STEP_13 的 `scrollToIndex`（[`DeckMainScreenUI.tsx`](src/components/UI/DeckScreenUI/DeckMainScreenUI.tsx:248)） | ⚠️ 需確認/強化 |
| 長按更改相簿 | STEP_13_LONG_PRESS_ALBUM → STEP_14_ALBUM_SETTINGS | ✅ 已存在 |
| 換上自己的相片當封面 | STEP_14 相簿設定內引導點「換封面」（`handlePickAlbumCoverImage`） | ⚠️ 需新增引導 |
| 歡迎通知 | `completeTour()` → 450ms 後顯示 | ✅ 已存在（但需移到最後） |

## 核心問題（Bug）

**實際體驗中，quiz 完成後相簿步驟（STEP_11~14）和歡迎通知都沒顯示，直接進 app。**

程式碼設計（[`DeckMainFlow.tsx`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:1221)）：
- quiz 完成 → [`ReviewFlow.tsx`](src/screens/flow/DeckScreenFlow/ReviewFlow.tsx:3333) emit `DEFAULT_EXPERIENCE_TUTORIAL_COMPLETED_EVENT`
- [`DeckMainFlow.tsx`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:1221) 監聽 → `goToStep('STEP_11_CREATE_ALBUM')`
- STEP_11 spotlight 顯示在「+」按鈕（[`DeckMainScreenUI.tsx`](src/components/UI/DeckScreenUI/DeckMainScreenUI.tsx:681)）

**可能根因（需在 code 模式實際 debug 確認）**：
1. `isDefaultExperienceTutorial` 為 false（`showDefaultExperienceQuizHint` 未正確設定），導致 quiz 完成時不 emit 事件
2. `goToStep('STEP_11_CREATE_ALBUM')` 執行後，STEP_11 的 spotlight 顯示條件（`!isSearchExpanded`）不滿足
3. quiz 完成後 `navigation.goBack()` 與 `goToStep` 的時機競態

## 相簿分頁細節

- 預設每頁 3 個相簿（`mainScreenAlbumGridCount=3`，[`userSettings.ts`](src/services/settings/userSettings.ts:395)）
- 預設相簿 3 個（所有、最愛、網路用語）
- 教學中建立 1 個自訂相簿 → 總數 4 個 → 第二頁有 1 個 → 可滑到第二頁

## 實作任務

### 任務 1：診斷並修復「quiz 後相簿步驟未顯示」的 bug
- 確認 `isDefaultExperienceTutorial` 鏈路（`markDefaultExperienceQuizHintPending` → `isDefaultExperienceQuizHintPending` → `showDefaultExperienceQuizHint`）
- 確認 `DEFAULT_EXPERIENCE_TUTORIAL_COMPLETED_EVENT` 監聽器是否正確觸發
- 確認 STEP_11 spotlight 顯示條件
- 修復後，確保 quiz 完成 → 回到 DeckMain → STEP_11 建立相簿引導顯示

### 任務 2：確認/強化「自動滑到第二頁」動畫
- 目前 [`DeckMainScreenUI.tsx`](src/components/UI/DeckScreenUI/DeckMainScreenUI.tsx:248) 在 STEP_13 用 `scrollToIndex({ animated: true })` 自動滑動
- 確認動畫正確顯示（不是瞬間跳轉）
- 若需強化，確保滑動動畫流暢且引導明確

### 任務 3：在 STEP_14 相簿設定內新增「換上自己的相片當封面」引導
- 在 STEP_14_ALBUM_SETTINGS 的相簿設定 modal 內，用 `TutorialSpotlight` 引導使用者點選「換封面」
- 沿用 [`handlePickAlbumCoverImage`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:1463)（ImagePicker + ImageManipulator + ImageCropperModal）
- 使用者選完自己的相片當封面後，才允許完成 STEP_14 → `completeTour()`
- 注意：這不是跳到 Profile 頁換大頭照，也不是新增獨立的 STEP_15

### 任務 4：確認歡迎通知移到最後
- 目前 `completeTour()`（[`DeckMainFlow.tsx`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:289)）在 STEP_14 儲存後觸發
- 確認歡迎通知在所有步驟（含滑到第二頁、長按更改、換封面）完成後才顯示
- 若目前時機正確（STEP_14 是最後一步），則只需確認 bug 修復後流程完整

### 任務 5：驗證完整流程
- 使用 dev fresh user simulator 或手動重設，走完整流程
- 確認：建卡 → quiz → 建立相簿 → 自動滑到第二頁 → 長按更改 → 換封面 → 歡迎通知

## 驗證方式

- 使用 [`devFreshUserSimulator`](src/features/auth/devFreshUserSimulator.ts:86) 重設教學狀態
- 或使用 dev URL scheme（`://dev/replay-tour`、`://dev/reset-onboarding`）
- 逐步走完互動式教學，確認每個步驟的箭頭引導正確顯示

## 注意事項

- 互動式教學的 UI 是「箭頭 GIF 導引，無文字說明」，透過 `TutorialSpotlight` 驅動
- 歡迎通知含影片（[`TourCompletionGreetingUI.tsx`](src/components/UI/DeckScreenUI/TourCompletionGreetingUI.tsx:32)），目前掛在 [`DeckMainFlow.tsx`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:1773)
- 不要改動影片教學（[`VideoTourFlow.tsx`](src/screens/flow/VideoTourFlow.tsx:433)），本次只動互動式教學

---

## 已完成進度（starter 交接，2026-08-05）

### 已完成的程式碼變更（尚未 commit，工作區內）

**1. [`DeckMainFlow.tsx`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx)**
- quiz 完成事件不再直接 `completeTour()`，改為 `appTour.goToStep('STEP_11_CREATE_ALBUM')`（line 1221-1231）
- `handleAddAlbum` 建立相簿後 → `goToStep('STEP_13_LONG_PRESS_ALBUM')`（不再直接開相簿設定）
- `handleActionEnd` 在 STEP_13 長按 → edit 時 → `goToStep('STEP_14_ALBUM_SETTINGS')`
- `handleSaveAlbumSettings` 判斷改為 `STEP_14_ALBUM_SETTINGS` 才 `completeTour()`
- `onOpenCreateAlbum` 在 STEP_11 時改走 `handleTourTargetPress()`（修復「+」按鈕不推進教學的 bug）
- 傳入 `tutorialLongPressAlbumId`（STEP_13 時 = `customAlbums[0]?.id`）
- STEP_5 進入 cache 的 effect 條件改為 `STEP_5_PROCESS_CACHE_CARD`

**2. [`DeckMainScreenUI.tsx`](src/components/UI/DeckScreenUI/DeckMainScreenUI.tsx)**
- 新增 `albumPagerRef` + `didRevealTutorialAlbumRef`，STEP_13 時自動 `scrollToIndex({ animated: true })` 滑到教學相簿所在頁（line 248-264）
- STEP_11 spotlight 的「+」按鈕內新增 `MovingTutorialArrow`（direction="down"），並新增 `createAlbumTutorialArrow` style
- `AlbumIconItemUI` 傳入 `showLongPressTutorial`（STEP_13 且為教學相簿時顯示長按引導）
- 移除 `tooltip` prop（`TutorialSpotlight` 已不接受）

### 尚未完成（下一個 agent 接手）

- **任務 3（未做）**：STEP_14 相簿設定內新增「換上自己的相片當封面」引導（沿用 `handlePickAlbumCoverImage`，[`DeckMainFlow.tsx`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:1463)）
- **任務 4（未做）**：確認歡迎通知在所有步驟完成後才顯示（目前 `completeTour()` 在 STEP_14 儲存後觸發，時機應已正確，需驗證）
- **任務 5（未做）**：驗證完整流程（建卡 → quiz → 建立相簿 → 自動滑到第二頁 → 長按更改 → 換封面 → 歡迎通知）
- **TS 檢查**：`npx tsc --noEmit` 尚未跑（被中斷），需確認無類型錯誤
- **commit**：本次變更尚未 commit

---

## 交接 prompt（給下一個 fresh chat）

你是互動式教學擴充任務的接續者。主目標：把互動式教學（[`AppTourContext.tsx`](src/contexts/AppTourContext.tsx:8)）擴充成完整流程「建卡 → quiz 3題 → 建立相簿 → 自動滑到第二頁 → 長按更改相簿 → 換上自己的相片當封面 → 歡迎通知」，並把含影片的歡迎通知移到所有步驟完成後顯示。

**已完成的（不需重查）**：quiz 完成後不再直接 completeTour，改為推進到 STEP_11 建立相簿；建立相簿後推進到 STEP_13 長按；長按 edit 後推進到 STEP_14；STEP_11「+」按鈕已接上 handleTourTargetPress 並加箭頭；STEP_13 自動滑到教學相簿所在頁（帶動畫）；STEP_13 長按引導已接上。詳細見 [`plans/interactive-tour-expansion.md`](plans/interactive-tour-expansion.md)。

**下一步（依序）**：
1. 跑 `npx tsc --noEmit` 確認無類型錯誤（工作區有大量未提交變更，只檢查本次相關檔案）
2. **任務 3**：在 STEP_14 相簿設定 modal 內，用 `TutorialSpotlight` 引導使用者點「換封面」選自己的相片當封面（沿用 [`handlePickAlbumCoverImage`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx:1463)）。注意：不是跳 Profile 換大頭照，也不是新增 STEP_15
3. **任務 4**：確認歡迎通知（`completeTour()` → 450ms → `showTourCompletionGreeting()`）在 STEP_14 儲存後才顯示
4. **任務 5**：用 dev fresh user simulator 或 dev URL scheme（`://dev/replay-tour`、`://dev/reset-onboarding`）走完整流程驗證
5. commit 本次相關變更（`plans/interactive-tour-expansion.md`、`src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx`、`src/components/UI/DeckScreenUI/DeckMainScreenUI.tsx`、STEP_14 相關檔案）

**材料**：計畫檔 [`plans/interactive-tour-expansion.md`](plans/interactive-tour-expansion.md)（含流程、程式碼對應、bug 根因、相簿分頁細節）。不要改動影片教學（[`VideoTourFlow.tsx`](src/screens/flow/VideoTourFlow.tsx:433)）。
