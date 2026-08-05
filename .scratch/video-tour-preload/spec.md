# Video Tour 影片預載（消除切換 lag）

Status: spec
Type: feature
Severity: medium（UX 卡頓，非資料/商業邏輯問題）

## 摘要

Video Tour（`VideoTourFlow`）的影片在切換 slide 時，先顯示「gray mock phone」（深色 phone frame 佔位），隔約半秒後影片才出現。目標是讓影片在切換到該 slide 前就已 ready，消除這個延遲。

## 根因（已確認）

1. [`visibleTourSteps`](src/screens/flow/VideoTourFlow.tsx:610) 只渲染 **active + transitioning** 的 slide。
2. 每個 slide 的 [`TutorialVideo`](src/screens/flow/VideoTourFlow.tsx:240) 用 `useVideoPlayer(source, ...)` 在**元件掛載時**才建立 player。
3. 因此切換到新 slide 時，該 slide 的 player 才剛建立，`.mov` 需要載入 + 解碼 → 在 player ready 前，[`VideoView`](src/screens/flow/VideoTourFlow.tsx:272) 顯示的是空白 phone frame（`backgroundColor: '#111827'` / `'#020617'`，即「gray mock phone」）。
4. player ready、第一幀解碼完成後影片才出現 → 約半秒延遲。

**重要澄清**：這**不是** offline pack 問題。所有 onboarding 圖片、video tour 影片、demo card 圖片都已經用 `require()` 靜態打包進 app bundle（`assetBundlePatterns` 含 `assets/tutorial/**/*`，見 [`tutorialOfflineBundle.test.mjs`](scripts/tutorialOfflineBundle.test.mjs:11)）。資產不需下載，offline 已達成。真正的問題是**影片 player 的初始化時機**。

## 解法（已確認）

**預載 player**：提前初始化「下一個」slide 的影片，切換時立即 ready。

- **方案 A（只預載下一個）**：擴充 `visibleTourSteps` 多渲染 `index + 1` 的 slide（隱藏），讓其 `TutorialVideo` 提前掛載、`useVideoPlayer` 提前建立 player 並載入 `.mov`。切換時已 ready。
- **首次也預載**：進入 video tour 時，第一個 slide 的 player 也提前初始化（避免首次延遲）。

## 實作方式（已確認）

**方式 1**：擴充 `visibleTourSteps` 多渲染下一個 slide 並隱藏（`opacity: 0` / `pointerEvents: none`），沿用現有 `TutorialVideo` 邏輯。改動最小。

### 關鍵行為

- 預載的 slide 其 `isPlaybackActive` 為 `false` → [`TutorialVideo`](src/screens/flow/VideoTourFlow.tsx:264) 的 effect 會 `player.pause()`，**不會播放**，但 source 已載入。
- 切換到該 slide 時，`isPlaybackActive` 變 `true` → `player.play()`，因 source 已 ready，立即播放。

## 驗證

- 手動：進入 video tour，切換 slide 時 gray mock phone 不再出現（或明顯縮短）。
- 確認預載的 slide 不會提前播放聲音/畫面（`muted: true` + `pause`）。
- 確認 reduce motion 模式下行為正常。

## 相關

- [`VideoTourFlow.tsx`](src/screens/flow/VideoTourFlow.tsx:1)
- [`tutorialOfflineBundle.test.mjs`](scripts/tutorialOfflineBundle.test.mjs:1)
