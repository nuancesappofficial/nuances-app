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

test('例句區塊必須維持獨立測量層（解耦 Reanimated 動畫容器）', () => {
  const hasMeasurementPass =
    /examplesMeasuredHeight === 0\s*\?[\s\S]*?exampleMeasurementLayer[\s\S]*?handleFullExamplesLayout/.test(
      source,
    );

  assert.ok(
    hasMeasurementPass,
    [
      '❌ [例句收合失效風險] CardDetailCarouselCardUI 遺失了受 examplesMeasuredHeight === 0 控制的獨立測量層（exampleMeasurementLayer）！',
      '📌 問題原因：若將 onLayout 直接放在受 Reanimated 限制高度的容器內，會造成「高度死結」——父層限制 114px 導致子層永遠量不到完整高度，使展開動畫無法取得目標高度，例句將永遠全開且無法收合。',
      '🛠 修正方式：保持獨立測量層在 examplesMeasuredHeight === 0 時掛載並測量，測量完成後卸載，動畫容器僅負責以 examplesBodyStyle 執行高度過渡。',
    ].join('\n'),
  );
});

test('卡片切換生命週期必須重設 hasMeasuredExamplesRef', () => {
  const hasRefReset =
    /useEffect\(\(\)\s*=>\s*\{[\s\S]*?hasMeasuredExamplesRef\.current\s*=\s*false[\s\S]*?item\.id/.test(
      source,
    );

  assert.ok(
    hasRefReset,
    [
      '❌ [卡片切換動畫失效風險] item.id 重設 useEffect 中遺失了 hasMeasuredExamplesRef.current = false！',
      '📌 問題原因：若切換卡片未重設此 Ref，第二張之後的卡片會誤判為「已完成測量」，導致 Reanimated 跳過高度初始化，新卡片的例句將無法正確展開或收合。',
      '🛠 修正方式：在 item.id 觸發的 reset effect 內加入 hasMeasuredExamplesRef.current = false;。',
    ].join('\n'),
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
    ].join('\n'),
  );
});

