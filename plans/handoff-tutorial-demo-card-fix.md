# Handoff：修復 Demo 卡片防刪除失效與帳號刪除重登後 Demo 卡片/遮罩缺失

## 1. 原始目標（Original Goal）
使用者回報在互動式導覽（Interactive Tutorial）中遇到兩個連鎖問題：
1. **Demo 卡片可被刪除**：「I deleted the demo card, for some reason I can」——在暫存庫（Cache Stack）中，使用者能夠將教學 Demo 卡片左滑刪除。
2. **刪除帳號後重啟教學卡死**：「deleted the account, went into interactive tutorial and saw no demo card nor transparent mask. Every thing was active and my demo card is missing.」——帳號刪除重登後進入互動教學時，暫存庫沒有 Demo 卡片，亦沒有透明開孔遮罩，畫面所有按鈕皆為 active 狀態，教學卡在第一步（`STEP_5_PROCESS_CACHE_CARD`）無法進行。

## 2. 目前進度與已完成工作（What You Did & Where We Are At）
- **診斷完畢**：已徹底追查出兩大問題的程式碼根因。
- **變更清單已擬定**：已列出精確的 5 項修改點與防禦策略。
- **程式碼狀態**：尚未修改程式碼（遵守 Rule 7 程式碼修改授權規範，已呈報修改清單等待使用者授權）。
- **既有測試狀態**：`node --test src/features/tour/tutorialCachePolicy.test.mjs`（9 passed），`npx tsc --noEmit`（0 errors）。

## 3. 根因剖析（Root Causes）

### 根因 A：為何 Demo 卡片仍會被刪除？
1. **策略條件漏洞**：[`tutorialCachePolicy.ts`](file:///Users/users/vibe_coding_projects/nuances-app/src/features/tour/tutorialCachePolicy.ts) 的 `shouldBlockTutorialCacheDeletion` 判定：
   ```typescript
   export function shouldBlockTutorialCacheDeletion(params: {
     isTutorialActive?: boolean;
     tourStep?: string;
     isDefaultExperienceCard: boolean;
     direction: 'left' | 'right';
   }): boolean {
     return (
       params.isDefaultExperienceCard === true &&
       (params.isTutorialActive === true ||
         Boolean(params.tourStep?.startsWith('STEP_'))) &&
       params.direction === 'left'
     );
   }
   ```
   若使用者在非教學狀態（例如先前跳過教學後 `appTour.isActive === false`），或手勢啟動時 step 判定延遲，Demo 卡片即會被放行刪除！
2. **手勢甩動判定漏洞**：[`CacheCardUI.tsx`](file:///Users/users/vibe_coding_projects/nuances-app/src/components/UI/CacheScreenUI/CacheCardUI.tsx) 的 `.onEnd` 只檢查 `deletionLocked && e.translationX < 0`。若使用者向左快速甩動卡片（`velocityX < -400`），只要手勢終點位移瞬間不在 `< 0`，即會繞過鎖定直接觸發 `commitSwipe('left')` 飛出場外刪除。

### 根因 B：為何刪除帳號後沒有 Demo 卡片與遮罩？
1. **`seenKey` 判定跳過建立**：[`defaultExperienceCard.ts`](file:///Users/users/vibe_coding_projects/nuances-app/src/features/cache/defaultExperienceCard.ts) 的 `ensureDefaultExperienceCard`：
   ```typescript
   if ((await AsyncStorage.getItem(seenKey)) === 'true') {
     console.log(`... skipped=already_seen`);
     return null;
   }
   ```
   若為同帳號重登，或是前次帳號刪除清理有殘留，AsyncStorage 中的 `seenKey`（`nuances:default_experience_card:v3:${userId}`）為 `'true'`，即直接回傳 `null`，不再建立卡片。
2. **連鎖連動失效**：
   - `ensureDefaultExperienceCard` 回傳 `null` → WatermelonDB `cached_items` 無 Demo 卡片。
   - [`useCacheListDataSource.ts`](file:///Users/users/vibe_coding_projects/nuances-app/src/screens/flow/CacheScreenFlow/hooks/useCacheListDataSource.ts) 在 `isTutorialActive` 時過濾 `demoCard`，因找不到而回傳空清單 `[]`。
   - [`CacheStackUI.tsx`](file:///Users/users/vibe_coding_projects/nuances-app/src/components/UI/CacheScreenUI/CacheStackUI.tsx) 無卡片可渲染，導致 [`TutorialSpotlight`](file:///Users/users/vibe_coding_projects/nuances-app/src/components/UI/shared/TutorialSpotlight.tsx) 未掛載。
   - `TutorialSpotlight` 未掛載 → `spotlightRect === null`。
   - [`TutorialOverlayMask.tsx`](file:///Users/users/vibe_coding_projects/nuances-app/src/components/UI/shared/TutorialOverlayMask.tsx) 在 `rect === null` 時按設計回傳 `null`（無目標時不黑屏鎖死）。
   - 結果：使用者進入互動教學時，畫面無 Demo 卡片、無開孔遮罩、所有按鈕皆為 active。

## 4. 下一步具體執行動作（Actionable Next Steps）

1. **修正防刪除策略與手勢攔截**：
   - 修改 [`src/features/tour/tutorialCachePolicy.ts`](file:///Users/users/vibe_coding_projects/nuances-app/src/features/tour/tutorialCachePolicy.ts)：
     Demo 卡片（`isDefaultExperienceCard === true`）一律永久禁止左滑刪除；教學期間（`isTutorialActive || tourStep?.startsWith('STEP_')`）所有卡片禁止左滑刪除。
   - 修改 [`src/components/UI/CacheScreenUI/CacheCardUI.tsx`](file:///Users/users/vibe_coding_projects/nuances-app/src/components/UI/CacheScreenUI/CacheCardUI.tsx)：
     在 `.onEnd` 補齊 `velocityX < -400` 判定，鎖定狀態下一律回彈，禁止觸發左滑刪除。
   - 修改 [`src/components/UI/CacheScreenUI/CacheStackUI.tsx`](file:///Users/users/vibe_coding_projects/nuances-app/src/components/UI/CacheScreenUI/CacheStackUI.tsx)：
     將 `deletionLocked={deletionLocked || Boolean(item.isDefaultExperienceCard)}` 傳入 `CacheCardUI`。

2. **支援強制建立 Demo 卡片**：
   - 修改 [`src/features/cache/defaultExperienceCard.ts`](file:///Users/users/vibe_coding_projects/nuances-app/src/features/cache/defaultExperienceCard.ts)：
     `ensureDefaultExperienceCard(userId, options?: { force?: boolean })` 支援 `force: true`，當處於教學模式或快取庫無 Demo 卡片時，忽略 `seenKey` 並強制建立。

3. **教學啟動點保證 Demo 卡片存在**：
   - 修改 [`src/contexts/AppTourContext.tsx`](file:///Users/users/vibe_coding_projects/nuances-app/src/contexts/AppTourContext.tsx)：
     在 `startTour('first_run' | 'replay')` 啟動時主動調用 `ensureDefaultExperienceCard(userId, { force: true })` 並清空舊 `seenKey`。

4. **暫存庫資料來源無卡自我修復**：
   - 修改 [`src/screens/flow/CacheScreenFlow/hooks/useCacheListDataSource.ts`](file:///Users/users/vibe_coding_projects/nuances-app/src/screens/flow/CacheScreenFlow/hooks/useCacheListDataSource.ts)：
     當 `isTutorialActive === true` 且找不到 `demoCard` 時，自動觸發強制建立 Demo 卡片。

5. **補齊帳號重置與模擬器清理**：
   - 修改 [`src/features/auth/devFreshUserSimulator.ts`](file:///Users/users/vibe_coding_projects/nuances-app/src/features/auth/devFreshUserSimulator.ts)：
     在 `simulateFreshUser()` 補充呼叫 `clearDefaultExperienceCardSeen(userId)` 與 `clearTourSeenLocally(userId)`。

6. **驗證**：
   - 執行 `node --test src/features/tour/tutorialCachePolicy.test.mjs`
   - 執行 `npx tsc --noEmit`

## 5. 建議使用的 Skills（Suggested Skills）
- `tdd`：修改 `tutorialCachePolicy.ts` 時，先更新 `tutorialCachePolicy.test.mjs` 增補「Demo 卡片非教學狀態下亦不可被左滑刪除」之測試案例，走紅-綠-重構循環。
- `code-review`：完成實作後執行程式碼審查。
