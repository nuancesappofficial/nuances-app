# Video Tour 影片預載（消除切換 lag）

Status: todo
Type: feature
Blocked by: none

## 目標

Video Tour 切換 slide 時，先顯示「gray mock phone」再出現影片（約半秒延遲）。讓影片在切換到該 slide 前就已 ready，消除延遲。

## 根因

[`visibleTourSteps`](src/screens/flow/VideoTourFlow.tsx:610) 只渲染 active + transitioning slide；每個 slide 的 [`TutorialVideo`](src/screens/flow/VideoTourFlow.tsx:240) 用 `useVideoPlayer` 在掛載時才建立 player，`.mov` 需載入 + 解碼 → 延遲。

## 實作

在 [`VideoTourFlow.tsx`](src/screens/flow/VideoTourFlow.tsx:1)：

1. **擴充 `visibleTourSteps` 預載下一個 slide**：讓 `visibleTourSteps` 除了 active + transitioning，也包含 `index + 1`（若存在）。預載的 slide 需隱藏（`opacity: 0` / `pointerEvents: none`），避免提前顯示。
2. **首次也預載**：進入 video tour 時第一個 slide 的 player 已掛載（原本就是 active），確保首次無延遲。
3. **確認預載 slide 不播放**：預載 slide 的 `isPlaybackActive` 為 `false` → [`TutorialVideo`](src/screens/flow/VideoTourFlow.tsx:264) effect 會 `player.pause()`，不播放但 source 已載入。

## 驗證

- 手動：切換 slide 時 gray mock phone 不再出現（或明顯縮短）。
- 預載 slide 不提前播放聲音/畫面。
- reduce motion 模式正常。
