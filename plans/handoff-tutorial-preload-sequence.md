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
