import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(__dirname, 'CardDetailCarouselCardUI.tsx'),
  'utf8',
);

// 回饋迴圈：展開/收合動畫的 height 動畫必須在 UI thread（reanimated）執行，
// 不能用 JS 驅動的 Animated.timing（useNativeDriver: false）——後者每幀透過
// JS bridge 更新 style + 觸發 layout 重算，是卡片詳情頁展開/收合卡頓的根因。
//
// numberOfLines 切換是刻意保留的（修日韓 UI 收合時字元擠壓的 bug），
// 不是卡頓來源，因此不在此迴圈斷言。

test('展開動畫的 height 動畫應使用 reanimated（UI thread）而非 JS 驅動', () => {
  // 找出所有 height 動畫的 timing 呼叫
  const heightTimings = source.match(
    /Animated\.timing\([\s\S]*?useNativeDriver:\s*(true|false)[\s\S]*?\)\.start\(\)/g,
  ) ?? [];

  for (const timing of heightTimings) {
    // 動 height 的 timing 若用 useNativeDriver: false，會每幀觸發 JS layout 重算
    const isHeightAnim = /BodyHeightAnim|HeightAnim/.test(timing);
    const usesNativeDriver = /useNativeDriver:\s*true/.test(timing);
    assert.ok(
      !isHeightAnim || usesNativeDriver,
      `height 動畫不應使用 useNativeDriver: false（每幀 JS layout 重算造成卡頓）：\n${timing}`,
    );
  }
});

test('展開動畫的 height 動畫已遷移到 reanimated withTiming', () => {
  // 每個 height 動畫都應以 reanimated 的 withTiming 驅動（UI thread）
  for (const anim of ['sentenceBodyHeightAnim', 'contextBodyHeightAnim', 'examplesBodyHeightAnim']) {
    const usesWithTiming = new RegExp(`${anim}\\.value = withTiming`).test(source);
    assert.ok(
      usesWithTiming,
      `${anim} 應使用 reanimated withTiming 驅動（UI thread），而非 JS 驅動的 Animated.timing`,
    );
  }
});
