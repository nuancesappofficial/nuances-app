# Handoff：Tutorial 全流程預載（onboarding → video tour → 建卡）

## 主目標（end goal，避免無限迴圈）

把 onboarding → video tour → 建卡 這整個 tutorial 當作**一個 sequence**，實作「在第 N 步預載第 N+1 步」的資產預載策略，消除兩個殘留延遲：

1. **onboarding Q2 其中一個 option 等約 5 秒**（最嚴重）
2. **video tour 第一個 video 延遲出現**（mock phone 先出現，影片才出現）

> 注意：使用者**尚未**決定 Q2 圖片要「壓縮圖片」還是「只做預載」——這是下一個 agent 要先用 grilling 釐清的第一個決策點（見下方「待釐清決策」）。

## 已完成、不需重查（前一個 session 已確認）

- **原始 issue 前提是錯的**：所有 onboarding 圖、video tour 影片、demo card 圖都已透過 `require()` 靜態打包進 app bundle（`scripts/tutorialOfflineBundle.test.mjs` 驗證 `assetBundlePatterns` 含 `assets/tutorial/**/*`）。**不需要**「下載 offline pack」。
- **「元件消失」問題已解決**：根因是使用者手機 wifi 切換到不同來源，與 code 無關。已確認。
- **已 commit `8ddad10`**：`feat(tour): preload next slide video player to remove switch lag`。實作 `getVisibleTourSlides` 純函式（[`src/features/tour/tutorialPresentation.ts`](src/features/tour/tutorialPresentation.ts:32)），讓 video tour 切換到下一個 slide 時，下一個 player 提前 mount 初始化。**這解決了「切換 slide」的延遲，但沒解決「第一個 slide 進入時」的延遲**（因為第一個 slide 沒有更早的 slide 去預載它）。
- 98 tests 全過、typecheck 過、code-review（Standards + Spec）兩軸皆無 findings。

## 根因分析（下一個 agent 直接沿用）

### 問題 1：onboarding Q2 option 5 秒 lag

- Q2 三張圖是**未壓縮的大 PNG**：
  - `assets/onboarding_q2_assets/q2-book-cutout.png` = **2.2MB**（最大）
  - `assets/onboarding_q2_assets/q2-headphones-cutout.png` = 1.5MB
  - `assets/onboarding_q2_assets/q2-tv-cutout.png` = 1.6MB
- 對比 Q1/Q3 的 cutout 圖（1.2MB～1.8MB），Q2 的圖特別大，且三張同時渲染。
- 渲染方式：[`OnboardingFlow.tsx`](src/screens/flow/OnboardingFlow.tsx:473) 的 `SelectableSticker` 用 `<Image source={imageSource} resizeMode="contain">` 直接渲染 `require()` 的圖。首次渲染時 decode 2.2MB PNG 很慢 → 5 秒延遲。
- 相關定義：[`OnboardingFlow.tsx`](src/screens/flow/OnboardingFlow.tsx:104) `STUMBLE_CONTEXT_OPTIONS`（Q2）、[`OnboardingFlow.tsx`](src/screens/flow/OnboardingFlow.tsx:76) 圖片 require 宣告。

### 問題 2：video tour 第一個 video 延遲

- `VideoTourFlow` 只在 `shouldRenderVideoTour` 為 true 時 mount（[`App.tsx`](App.tsx:1536)）。
- `TutorialVideo`（[`VideoTourFlow.tsx`](src/screens/flow/VideoTourFlow.tsx:241)）用 `useVideoPlayer(source, ...)` 在 mount 時初始化 player，但 `.mov` 解碼是異步的。
- 我的 `getVisibleTourSlides` 讓 `index+1` 提前 mount，但**第一個 slide 進入時沒有提前量**。使用者說「第一個 video 的 lag 程度跟沒預載差不多」。
- 使用者當初 grilling 選的是「方式 1 + **首次也預載**（進入 video tour 前先初始化第一個 player）」，但我的實作**漏掉了「首次也預載」**這部分。

## 待釐清決策（下一個 agent 第一步用 grilling 問使用者）

1. **Q2 圖片**：要「壓縮圖片（根本解，2.2MB → 幾百 KB）」還是「只做預載（第 N 步預載第 N+1 步）」還是兩者都做？壓縮可能影響視覺品質，需使用者確認。
2. **第一個 video 預載**：是否要在進入 video tour 前（`showVideoTourCurtain` 顯示期間，[`App.tsx`](App.tsx:1625)）就初始化第一個 player？

## 建議方案（下一個 agent 遵循）

### 方案 A：Q2 圖片壓縮（根本解，優先）
- 用工具（如 `sips`、`pngquant`、`ImageMagick`）把 `assets/onboarding_q2_assets/*-cutout.png` 壓縮到幾百 KB。
- 保留原圖備份，確認視覺品質可接受。
- 這直接消除 5 秒 decode 延遲，比預載更根本。

### 方案 B：sequence 預載策略（使用者明確要求的方向）
- 建立一個「tutorial sequence」的資產預載機制：在第 N 步（如 Q1 顯示時）就 `Image.prefetch` 第 N+1 步（Q2）的圖片。
- 對 video tour：在進入前初始化第一個 player（補上「首次也預載」）。
- 可參考現有的 `getVisibleTourSlides` 純函式模式，抽出可測試的預載排程純函式。

### 建議實作順序
1. 先 grilling 釐清「壓縮 vs 預載」決策
2. 若選壓縮：先壓 Q2 圖片，實測 5 秒是否消除
3. 補上 video tour「首次也預載」
4. 若要 sequence 預載：抽出純函式 + tdd + code-review

## 相關檔案

- [`src/screens/flow/OnboardingFlow.tsx`](src/screens/flow/OnboardingFlow.tsx) — Q2 option 定義（line 104）、圖片 require（line 76-84）、`SelectableSticker` 渲染（line 473）
- [`src/screens/flow/VideoTourFlow.tsx`](src/screens/flow/VideoTourFlow.tsx) — `TutorialVideo`（line 241）、`visibleTourSteps`（line 611）
- [`src/features/tour/tutorialPresentation.ts`](src/features/tour/tutorialPresentation.ts:32) — `getVisibleTourSlides`（已 commit）
- [`App.tsx`](App.tsx:1536) — video tour mount 條件、[`App.tsx`](App.tsx:1625) — curtain
- `assets/onboarding_q2_assets/` — 大 PNG 來源
- `.scratch/video-tour-preload/spec.md` — 前一個 spec

## 驗證方式

- 在 dev（Metro / Expo Go）實測：進入 onboarding Q2 是否還有 5 秒延遲；進入 video tour 第一個 video 是否立即出現。
- 跑 `node --test 'src/features/tour/*.test.mjs'` 確認既有測試仍過。

---

# 交接（2026-08-05）：video tour 第一個 video 預載無效 → 改用「隱藏 VideoView 強迫 decode」

## 主目標（end goal，避免無限迴圈）

消除 onboarding → video tour → 建卡 tutorial 序列的兩個殘留延遲：
1. onboarding 選項圖片延遲（**已解決**：Step 2 放大鏡 + Q2 圖壓縮）
2. **video tour 第一個 video 延遲（本次修法已實作，待 UI 實測驗證）**

## 本次已完成、不需重查

- **Q2 圖片壓縮**、**Step 2 放大鏡壓縮**：已解決（見上方「已完成」）。
- **video tour 第一個 video 預載（commit `3982529`）實測無效**：使用者實測仍有 ~3 秒延遲。
- **根因確認（H1）**：`createVideoPlayer` 建構時就 `replaceCurrentItem` 載入 AVPlayerItem（[`VideoPlayer.swift`](node_modules/expo-video/ios/VideoPlayer.swift:201)），但**未 attach 到 VideoView 時 AVPlayer 不會真正 decode 到 readyToPlay**。`VideoView` 底層是 `AVPlayerViewController`（[`VideoView.swift`](node_modules/expo-video/ios/VideoView.swift:6)），attach player 時才建立 layer 並 decode 到 `isReadyForDisplay`（[`VideoView.swift`](node_modules/expo-video/ios/VideoView.swift:183)）。預載 player 在 onboarding 期間只 createVideoPlayer、沒 attach VideoView → 沒 decode → video tour 出現時才開始 decode → ~3 秒。
- **修法已實作（未 commit）**：
  - 新增 [`src/components/UI/shared/FirstTourVideoPreloader.tsx`](src/components/UI/shared/FirstTourVideoPreloader.tsx)：onboarding 期間 mount，建立預載 player + mount 隱藏 VideoView（`width:1, height:1, opacity:0`）強迫 decode。**不負責 release**（所有權轉移給 App 層）。
  - [`App.tsx`](App.tsx:1574)：onboarding 分支包 fragment，render `<FirstTourVideoPreloader enabled={VIDEO_TOUR_ENABLED} onPlayerReady={handleFirstTourPlayerReady} />`；`handleFirstTourPlayerReady`（[`App.tsx`](App.tsx:656)）用 `useCallback` 存入 `preloadedFirstPlayerRef`；onboarding 完成時若 `nextJourney.stage !== 'video-tour'` 則 release（[`App.tsx`](App.tsx:1592)）；video tour 完成時仍 release（現有邏輯 [`App.tsx`](App.tsx:1565)）。
  - 清理 import：App.tsx 移除 `createVideoPlayer`、`getFirstTourVideoSource`（改由元件使用）。

## 下一個 agent 要做的事

1. **確認 tsc 通過**：`npx tsc --noEmit`（本次 session 執行中，下一個 agent 需重新跑確認無類型錯誤）。
2. **跑 tour 測試**：`node --test 'src/features/tour/*.test.mjs'` 確認 21 個測試仍過。
3. **UI 實測驗證（最重要）**：在 dev（Metro / Expo Go）跑 `npm start`，走完 onboarding → 進入 video tour，確認第一個 video 是否立即出現（不再等 ~3 秒）。若仍有延遲，回報實際秒數。
4. **若仍無效**：用 diagnosing-bugs 排查。可能原因：
   - 隱藏 VideoView 用 `width:1, height:1, opacity:0` 可能不足以讓 AVPlayerViewController 建立 layer（需確認是否需實際尺寸/在 window 上）。可試 `position:'absolute'` + 更大尺寸 + `zIndex:-1`。
   - 或 `.mov` 本身 codec/解析度解碼慢（H3），需檢查影片規格。
5. **code-review 兩軸**（implement 完成後必跑）。
6. **commit**：僅 commit 本次相關檔案（`App.tsx`、`src/components/UI/shared/FirstTourVideoPreloader.tsx`）。**注意**：工作區有大量其他 session 的未提交變更，勿混入。

## 相關材料

- 本 plan：[`plans/handoff-tutorial-preload-sequence.md`](plans/handoff-tutorial-preload-sequence.md)
- 前一個 spec：[`.scratch/video-tour-preload/spec.md`](.scratch/video-tour-preload/spec.md)
- 新元件：[`src/components/UI/shared/FirstTourVideoPreloader.tsx`](src/components/UI/shared/FirstTourVideoPreloader.tsx)
- 已 commit 的 `getVisibleTourSlides`：[`src/features/tour/tutorialPresentation.ts`](src/features/tour/tutorialPresentation.ts:32)
