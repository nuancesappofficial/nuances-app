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

- **STEP_13 長按箭頭高度調整（進行中，未 commit）**：使用者回報「箭頭太高，沒指向相簿中心」。已做：wrap 改水平排列（箭頭在左、label 在右）、`top: cell中心 - 30`、固定 wrap `height: 60`、measure 延遲 700→1200ms。使用者最新回報「箭頭在 album grid & word pop 中間」（偏上），仍未對準相簿中心。**注意：動畫部分使用者說「動畫我來想辦法」，不要改 spring 動畫，只調箭頭高度/位置**
- **任務 5（未做）**：用 dev fresh user simulator 或 dev URL scheme（`://dev/replay-tour`、`://dev/reset-onboarding`）在模擬器上走完整流程做 UI 互動驗證（建卡 → quiz → 建立相簿 → 自動滑到第二頁 → 長按更改 → 換封面 → 歡迎通知）。靜態驗證（tsc + eslint）已通過，但 UI 互動需模擬器手動確認

---

## 交接 prompt（給下一個 fresh chat）

你是互動式教學擴充任務的接續者。主目標：把互動式教學（[`AppTourContext.tsx`](src/contexts/AppTourContext.tsx:8)）擴充成完整流程「建卡 → quiz 3題 → 建立相簿 → 自動滑到第二頁 → 長按更改相簿 → 換上自己的相片當封面 → 歡迎通知」，並把含影片的歡迎通知移到所有步驟完成後顯示。

**已完成的（不需重查，已 commit）**：
- **任務 1-2**（前 session）：quiz 完成後不再直接 completeTour，改為推進到 STEP_11 建立相簿；建立相簿後推進到 STEP_13 長按；長按 edit 後推進到 STEP_14；STEP_11「+」按鈕接上 handleTourTargetPress；STEP_13 自動滑到教學相簿所在頁（帶動畫）；STEP_13 長按引導已接上
- **任務 3**（本 session，commit `9b17547`）：STEP_14 相簿設定 modal 內新增「換上自己的相片當封面」引導。在 [`AlbumSettingsModalUI.tsx`](src/components/UI/DeckScreenUI/AlbumSettingsModalUI.tsx) 新增 `tourPickCoverActive` prop，coverTab 非 image 時在 image tab 按鈕加箭頭、coverTab 為 image 時在 coverUploadTile 加箭頭；[`DeckMainFlow.tsx`](src/screens/flow/DeckScreenFlow/DeckMainFlow.tsx) 傳入 `tourPickCoverActive={appTour.step === 'STEP_14_ALBUM_SETTINGS'}`
- **任務 4**（本 session）：確認歡迎通知時機正確——`completeTour()` 只在 `handleSaveAlbumSettings` 且 `appTour.step === 'STEP_14_ALBUM_SETTINGS'` 時觸發，`applyAlbumSettings` 先關 modal，effect 在 modal 關閉 450ms 後顯示 `showTourCompletionGreeting()`。無需改動
- **任務 5 靜態部分**（本 session）：`npx tsc --noEmit` + `npx eslint` 皆通過
- **STEP_11 箭頭 bug 修復**（本 session，commit `2bf0fe8` + `d2cd24d`）：使用者回報「quiz 後指向建立相簿的箭頭被 word pop 區塊遮擋」。根因：箭頭原本巢狀在「+」按鈕內被其 outline 裁切、且渲染在 word showcase 之前被覆蓋。修正：把箭頭移出「+」按鈕，改為在 [`DeckMainScreenUI.tsx`](src/components/UI/DeckScreenUI/DeckMainScreenUI.tsx) 的 `topActionsRow` 內用 `onLayout` 捕捉「+」按鈕座標，渲染獨立浮動箭頭（`position:'absolute'`、`zIndex:999`、`pointerEvents:'none'`、`direction="up"` 指回按鈕）。後續使用者回報「箭頭同時指向新增與搜尋按鈕」，根因是 `MovingTutorialArrow` 的動畫 `transform` 會覆蓋外部 `transform`，故改用 `marginLeft:-32`（箭頭實際寬度 64/2）水平置中，現已精準對齊「+」按鈕中心
- **STEP_11 箭頭水平偏移修復**（本 session，commit `ea62fab`）：使用者回報「指向 create album 的箭頭太左了，add button 在右上角」。根因：箭頭 `position:'absolute'` 以 `topActionsRow`（`position:'relative'`）為基準，但「+」按鈕的 `onLayout` 座標是以 `TutorialSpotlight`（位於搜尋區塊之後的普通 View，無定位）為基準，兩者基準不一致 → 箭頭少了搜尋區塊寬度而偏左。修正：把箭頭移進 `TutorialSpotlight` 內、新增 `createAlbumSpotlight` style（`position:'relative'`），使箭頭基準與「+」按鈕 `onLayout` 基準一致；`TutorialSpotlight.tsx` 的 `children` 型別由 `React.ReactElement` 改為 `React.ReactNode`（因現在包兩個 child）
- **STEP_13 長按箭頭移到最上層 + 加「長按」標籤**（本 session，commit `ea62fab`）：使用者回報「指向新相簿的箭頭移到最上層」→ 先加 `position:'relative'` 到 `styles.albumItem` 修復基準；後續回報「箭頭不在最上層（被裁切）且未提示長按」。根因：`albumGroup` 有 `overflow:'hidden'`（line 1092）裁切向上延伸的箭頭、`albumItem` zIndex 僅 1。採使用者選的**方案 A**：把箭頭移出 `AlbumIconItemUI`，在 [`DeckMainScreenUI.tsx`](src/components/UI/DeckScreenUI/DeckMainScreenUI.tsx) 用 `onLayout` + `measureInWindow` 捕捉教學相簿 cell 的絕對螢幕座標（`tutorialAlbumLayout` state + `tutorialAlbumCellRef`），在 SafeAreaView 內渲染獨立浮動箭頭（`longPressTutorialWrap`：`position:'absolute'`、`zIndex:999`、`pointerEvents:'none'`、`alignItems:'center'`、`marginLeft:-15`），並在箭頭上方加「長按」/「Hold to edit」文字標籤（`longPressTutorialLabel`）。因 `measureInWindow` 的 y 含狀態列、而浮動箭頭以 SafeAreaView 內容為基準，故 `top` 需減 `insets.top`。`AlbumIconItemUI.tsx` 移除 `showLongPressTutorial` prop、箭頭渲染、`longPressTutorialArrow` style 與 `MovingTutorialArrow` import。`uiLanguage === 'zh'` 型別錯誤改為 `uiLanguage === 'zh-TW' || uiLanguage === 'zh-CN'`

**本 session（2026-08-05 後半）完成並已 commit 的 STEP_13 箭頭工作**：
- **STEP_13 箭頭高度調整（commit `c733973`）**：使用者回報箭頭偏上。依使用者逐步指示把 `top` 從 `cell中心 - 30` 一路往下調到 `cell中心 + 20`（[`DeckMainScreenUI.tsx`](src/components/UI/DeckScreenUI/DeckMainScreenUI.tsx:793)），最終對準相簿中心。**spring 動畫未動**（使用者說「動畫我來想辦法」）
- **STEP_13 長按視覺環動畫（commit `6dbd46f`）**：依使用者 prompt 把 [`MovingTutorialArrow.tsx`](src/components/UI/shared/MovingTutorialArrow.tsx) 的 `motion` 從 `'spring'` 改為 `'longPress'`，新增長按視覺環動畫（按下 → 保持擴張提示需按住 → 釋放彈開），並在 [`DeckMainScreenUI.tsx`](src/components/UI/DeckScreenUI/DeckMainScreenUI.tsx:802) 改用 `motion="longPress"`、移除「長按」文字與 `longPressTutorialLabel` 死碼 style。`npx tsc --noEmit` + `npx eslint` 皆通過
- **任務 5 完整流程驗證（本 session）**：使用者實機走 `://dev/replay-tour` 完整流程（建卡 → quiz → 建立相簿 → 自動滑到第二頁 → 長按 → 換封面 → 歡迎通知），確認 STEP_13 箭頭對準相簿中心、完整流程通過

**下一步（依序）**：
1. **確認 STEP_13 長按視覺環動畫在實機上的呈現**（本 session 最後改動，尚未實機確認）：使用者 reload 實機（`://dev/replay-tour`）走到 STEP_13，確認長按視覺環（按下 → 擴張 → 彈開）動畫正常、無遮擋、箭頭仍對準相簿中心。若視覺環位置/大小需微調，改 [`MovingTutorialArrow.tsx`](src/components/UI/shared/MovingTutorialArrow.tsx) 的 `ringPosition`/`ringSize`/`borderWidth`
2. 若實機確認無問題，互動式教學擴充主目標（建卡 → quiz → 建相簿 → 滑第二頁 → 長按 → 換封面 → 歡迎通知）即全部完成

**材料**：計畫檔 [`plans/interactive-tour-expansion.md`](plans/interactive-tour-expansion.md)（含流程、程式碼對應、bug 根因、相簿分頁細節）。不要改動影片教學（[`VideoTourFlow.tsx`](src/screens/flow/VideoTourFlow.tsx:433)）。工作區目前乾淨（本任務相關變更已全部 commit），commit 時只 add 本任務相關檔案。
