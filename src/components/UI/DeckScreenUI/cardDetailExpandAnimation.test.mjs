import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(__dirname, 'CardDetailCarouselCardUI.tsx'),
  'utf8'
);
const flowSource = readFileSync(
  join(__dirname, '../../../screens/flow/DeckScreenFlow/CardDetailFlow.tsx'),
  'utf8'
);
const carouselSource = readFileSync(
  join(__dirname, 'CardDetailCarouselUI.tsx'),
  'utf8'
);

// 回饋迴圈：展開/收合動畫的 height 動畫必須在 UI thread（reanimated）執行，
// 不能用 JS 驅動的 Animated.timing（useNativeDriver: false）——後者每幀透過
// JS bridge 更新 style + 觸發 layout 重算，是卡片詳情頁展開/收合卡頓的根因。
//
// numberOfLines 切換是刻意保留的（修日韓 UI 收合時字元擠壓的 bug），
// 不是卡頓來源，因此不在此迴圈斷言。

test('展開動畫的 height 動畫應使用 reanimated（UI thread）而非 JS 驅動', () => {
  // 找出所有 height 動畫的 timing 呼叫
  const heightTimings =
    source.match(
      /Animated\.timing\([\s\S]*?useNativeDriver:\s*(true|false)[\s\S]*?\)\.start\(\)/g
    ) ?? [];

  for (const timing of heightTimings) {
    // 動 height 的 timing 若用 useNativeDriver: false，會每幀觸發 JS layout 重算
    const isHeightAnim = /BodyHeightAnim|HeightAnim/.test(timing);
    const usesNativeDriver = /useNativeDriver:\s*true/.test(timing);
    assert.ok(
      !isHeightAnim || usesNativeDriver,
      `height 動畫不應使用 useNativeDriver: false（每幀 JS layout 重算造成卡頓）：\n${timing}`
    );
  }
});

test('展開動畫的 height 動畫已遷移到 reanimated withTiming', () => {
  // 每個 height 動畫都應以 reanimated 的 withTiming 驅動（UI thread）
  for (const anim of ['sentenceBodyHeightAnim', 'contextBodyHeightAnim']) {
    const usesWithTiming = new RegExp(`${anim}\\.value = withTiming`).test(
      source
    );
    assert.ok(
      usesWithTiming,
      `${anim} 應使用 reanimated withTiming 驅動（UI thread），而非 JS 驅動的 Animated.timing`
    );
  }
});

test('背面例句區塊平鋪展示且不設高度拘束', () => {
  const rendersFlat =
    /\{tUI\(uiLanguage,\s*'cardDetail\.exampleSentence'\)\}[\s\S]*?\{renderExampleRows\(false\)\}/.test(
      source
    );

  assert.ok(
    rendersFlat,
    '❌ CardDetailCarouselCardUI 背面例句應平鋪展示且不設收合容器！'
  );
});

test('例句翻譯文字樣式必須維持 flexShrink: 0 防止中文截斷', () => {
  const hasFlexShrinkZero =
    /exampleTranslationText:\s*\{[\s\S]*?flexShrink:\s*0/.test(source);

  assert.ok(
    hasFlexShrinkZero,
    [
      '❌ [中文翻譯裁切風險] localStyles.exampleTranslationText 必須維持 flexShrink: 0！',
      '📌 問題原因：若改為 flexShrink: 1，Flexbox 會在容器高度緊縮時優先壓縮翻譯文字行高，導致中日文多行翻譯末尾字元被直接切斷吃字。',
      '🛠 修正方式：確保 exampleTranslationText 中設定 flexShrink: 0。',
    ].join('\n')
  );
});

test('卡片翻轉動畫必須具備正面與背面 90 度 opacity 切換與 backfaceVisibility 防止 Android 重複光柵化', () => {
  const hasFrontOpacity =
    /frontAnimatedStyle\s*=\s*useAnimatedStyle[\s\S]*?opacity[\s\S]*?flipAnim\.value\s*<\s*0\.5/.test(
      source
    );
  const hasBackOpacity =
    /backAnimatedStyle\s*=\s*useAnimatedStyle[\s\S]*?opacity[\s\S]*?flipAnim\.value\s*>=\s*0\.5/.test(
      source
    );
  const hasBackfaceHidden =
    /frontAnimatedStyle[\s\S]*?backfaceVisibility:\s*'hidden'/.test(source) &&
    /backAnimatedStyle[\s\S]*?backfaceVisibility:\s*'hidden'/.test(source);

  assert.ok(
    hasFrontOpacity && hasBackOpacity && hasBackfaceHidden,
    '❌ [Android 翻轉重疊/效能風險] frontAnimatedStyle 或 backAnimatedStyle 缺少 90 度 opacity 切換或 backfaceVisibility！'
  );
});

test('CardDetailFlow 的 detailPaper 必須在 Android 上關閉 elevation 避免 3D 陰影反轉破面與首幀卡頓', () => {
  const hasAndroidZeroElevation =
    /detailPaper:\s*\{[\s\S]*?android:\s*\{[\s\S]*?elevation:\s*0/.test(
      flowSource
    );

  assert.ok(
    hasAndroidZeroElevation,
    '❌ [Android 3D 陰影破面風險] CardDetailFlow.tsx 中 detailPaper 必須在 Android 平台將 elevation 設為 0！'
  );
});

test('分享截圖時正面與背面 rotateY 必須重置為 0deg 避免 iOS Backface Culling 截取空白照片', () => {
  const frontResetRotate =
    /frontAnimatedStyle\s*=\s*useAnimatedStyle[\s\S]*?rotateY\s*=\s*isCapturingShare\.value\s*\?\s*0/.test(
      source
    );
  const backResetRotate =
    /backAnimatedStyle\s*=\s*useAnimatedStyle[\s\S]*?rotateY\s*=\s*isCapturingShare\.value\s*\?\s*0/.test(
      source
    );

  assert.ok(
    frontResetRotate && backResetRotate,
    '❌ [分享截圖空白風險] frontAnimatedStyle 或 backAnimatedStyle 缺少 isCapturingShare 時的 rotateY 重置為 0！'
  );
});

test('分享預覽容器必須具備預設透明邊框以避免 Android Yoga 引擎在未選取時發生高度塌陷', () => {
  const mediaStyleMatch = source.match(/sharePreviewMedia:\s*\{([\s\S]*?)\},/);
  assert.ok(mediaStyleMatch, '應存在 sharePreviewMedia 樣式定義');
  const hasDefaultBorder =
    /borderWidth:\s*(?:1\.5|1)/.test(mediaStyleMatch[1]) &&
    /borderColor:\s*['"]transparent['"]/.test(mediaStyleMatch[1]);

  assert.ok(
    hasDefaultBorder,
    '❌ [Android 預覽塌陷風險] sharePreviewMedia 缺少預設透明邊框，會導致 Android 在未選取狀態下 Yoga 佈局高度塌陷為 0！'
  );
});

test('CardDetailCarouselCardUI 的 detailCardShell 不可使用 Pressable 包裹 ScrollView 以免手勢鎖死', () => {
  const wrapsInPressable =
    /<Pressable[^>]*style=\{\s*styles\.detailCardShell\s*\}/.test(source);
  assert.ok(
    !wrapsInPressable,
    '❌ [卡片滑動失效風險] detailCardShell 不應為 Pressable！Pressable 包裹 ScrollView 會搶佔手勢響應器並觸發 requestDisallowInterceptTouchEvent，導致子層 ScrollView 無論收合或展開均無法滑動。應使用 View 並將翻牌點擊委派至內部。'
  );
});

test('CardDetailCarouselUI 的 Reanimated.FlatList 必須啟用 nestedScrollEnabled 支援 Android 雙向滾動', () => {
  const hasNestedScroll =
    /<Reanimated\.FlatList[\s\S]*?nestedScrollEnabled/.test(carouselSource);
  assert.ok(
    hasNestedScroll,
    '❌ [Android 雙向滾動風險] CardDetailCarouselUI 的 Reanimated.FlatList 遺失 nestedScrollEnabled 屬性！'
  );
});
