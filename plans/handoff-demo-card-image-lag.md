# Handoff：修復 demo card 圖片載入的三個 lag

> 給下一個 fresh chat 的交接 prompt。直接複製「交接 prompt」段落給新 chat 即可。

## 主目標（Main Goal）
修復 demo card（預設體驗卡）圖片載入的三個 lag，讓 demo card 圖片像一般挑選的照片一樣「立即」顯示：
1. **video → cache screen**：卡片滑入但空白一秒，圖片才載入
2. **進入 image cropper modal**：原本有 spinner 閃一下（已修），現在是短暫全黑
3. **create card screen**：圖片要一秒才載入

## 已完成（Done）
所有程式碼修改已落地，**tsc + eslint 已通過**。**尚未在裝置上驗證**三個 lag 是否真的消失。

### 根因
demo card 圖片是 bundled asset（`require('assets/tutorial/demo-card/smallest-nuances-with-text-v2.png')`，1254×1254，1.8MB）。所有消費端都用 `source={{ uri: imageUri }}`，而 `imageUri` 是 `Image.resolveAssetSource(...).uri` 回傳的 bundle URI（`file:///.../assets_xxx/...`）。React Native 對這種 bundle asset URI 的載入（尤其 `Image.getSize()`）比實體檔案慢，造成三個畫面都閃一下。

### 修改清單
1. [`defaultExperienceCard.ts`](../../src/features/cache/defaultExperienceCard.ts:56) — 新增：
   - `export const DEFAULT_EXPERIENCE_CARD_IMAGE_SIZE = { width: 1254, height: 1254 } as const`
   - `resolvePersistedDemoCardImageUri()`：用 `FileSystemLegacy.copyAsync` 把 bundled asset 複製成 document directory 的實體檔案（module-level promise 快取，冪等）
   - `ensureDefaultExperienceCard` 建立/更新 demo card 時改用實體 URI（`?? undefined` 處理 null）
   - 已存在 demo card 會自動遷移：`ensureDefaultExperienceCard` 在每次 cache list 載入時呼叫，`mediaUri !== imageUri` 比較會觸發 update 分支
2. [`useCacheSwipeActions.ts`](../../src/screens/flow/CacheScreenFlow/hooks/useCacheSwipeActions.ts:105) — 右滑 demo card 進 cropper 時傳入 `imageSize: DEFAULT_EXPERIENCE_CARD_IMAGE_SIZE`，跳過 cropper 內慢的 `Image.getSize()`（修 spinner）

### 驗證已做
- `npx tsc --noEmit` → exit 0
- `eslint` → 通過
- 用 `sips` 確認 PNG 實際尺寸 1254×1254

## 收尾驗證結果（尚未完成）
1. ✅ **type-check**：`npx tsc --noEmit` → exit 0
2. ✅ **eslint** → 通過
3. ⏳ **裝置驗證**（需真人 dev build 手動驗證，非自動化）：
   - video → cache screen：卡片滑入時圖片應立即顯示，不再空白一秒
   - 右滑 demo card 進 cropper：不應再全黑（也不該有 spinner）
   - create card screen：圖片應立即載入
   - **關鍵風險**：`FileSystemLegacy.copyAsync` 能否從 app bundle 的 `file://` asset URI 讀取，native 行為無法在單元測試驗證。若失敗，fallback 回傳 asset URI（不劣於現狀），但遷移不會發生——需確認 document directory 真的有 `demo-card-*.png` 檔案

## 交接 prompt（複製這段給新 chat）

```
語言：一律用繁體中文。溝通格式：i-have-adhd（先講下一步、多步驟編號、每輪重述進度、給時間估算、不寒暄）。

任務：完成「demo card 圖片載入三個 lag」修復的收尾驗證。

背景：demo card 圖片是 bundled asset（1254×1254 PNG），所有消費端用 uri 載入 bundle asset URI 較慢，造成三個畫面閃一下（cache screen 空白、cropper 全黑、create card 慢）。已修好：(a) defaultExperienceCard.ts 用 FileSystemLegacy.copyAsync 把 asset 複製成 document directory 實體檔案，ensureDefaultExperienceCard 改用實體 URI（含已存在遷移）；(b) useCacheSwipeActions.ts 右滑 demo card 進 cropper 時傳入已知尺寸跳過 Image.getSize()。tsc + eslint 已過。

請依序執行：
1. 先讀 plans/handoff-demo-card-image-lag.md 了解完整脈絡與修改清單。
2. 跑 `npx tsc --noEmit` 確認編譯通過（應已過，若環境變動再驗一次）。
3. 跑 code-review skill 審查這次改動（對照 Standards 與 Spec）。
4. 請用戶在 dev build 裝置上驗證三個 lag 是否消失：
   - video → cache screen：卡片滑入圖片立即顯示
   - 右滑 demo card 進 cropper：不再全黑／無 spinner
   - create card screen：圖片立即載入
5. 若 copyAsync 從 bundle asset URI 失敗（fallback 回 asset URI，遷移沒發生），改用替代方案：expo-asset 的 Asset.fromModule().downloadAsync() 或改用 require() 顯示層方案，並重新驗證。
6. 驗證通過後 commit 這兩個檔案的改動。
```
