import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(__dirname, 'DeckMainScreenUI.tsx'),
  'utf8',
);

test('Word Pop 輪播動畫必須定義卡片間距 WORD_POP_SLIDE_GAP', () => {
  const hasGapConstant = /export\s+const\s+WORD_POP_SLIDE_GAP\s*=\s*(\d+)/.test(source);
  assert.ok(
    hasGapConstant,
    'DeckMainScreenUI.tsx 應定義並匯出 WORD_POP_SLIDE_GAP 常數以確保卡片間有可配置的留白',
  );

  const match = source.match(/WORD_POP_SLIDE_GAP\s*=\s*(\d+)/);
  const gapValue = match ? Number(match[1]) : 0;
  assert.ok(gapValue >= 12, `WORD_POP_SLIDE_GAP 應至少為 12px（目前: ${gapValue}px）以維持足夠留白`);
});

test('Word Pop 輪播位移距離函式 getWordPopSlideDistance 應包含寬度與間距', () => {
  const hasDistanceHelper = /export\s+function\s+getWordPopSlideDistance/.test(source);
  assert.ok(
    hasDistanceHelper,
    'DeckMainScreenUI.tsx 應匯出 getWordPopSlideDistance 輔助函式計算包含間隔的位移距離',
  );

  const fnMatch = source.match(/export\s+function\s+getWordPopSlideDistance\([^)]*\)[^{]*\{[\s\S]*?\n\}/);
  assert.ok(fnMatch, '應能取得 getWordPopSlideDistance 實作內容');
  const jsFunctionCode = fnMatch[0]
    .replace(/export\s+function\s+getWordPopSlideDistance/, 'return function')
    .replace(/:\s*number/g, '');
  const computeFn = new Function('WORD_POP_SLIDE_GAP', jsFunctionCode)(16);

  assert.equal(computeFn(300), 316, '預設間隔應加上 16px');
  assert.equal(computeFn(300, 24), 324, '自訂間隔應加上 24px');
  assert.equal(computeFn(-5, -10), 0, '負數寬度與間距應安全歸零');
});

test('Slot A/B 平移動畫必須使用包含間隔的 slideDistance，不可直接使用緊貼的 wordSlideWidth', () => {
  // 不應再直接出現 slotBX.value = wordSlideWidth; 或 slotAX.value = withTiming(-wordSlideWidth, ...)
  const bareIncomingB = /slotBX\.value\s*=\s*wordSlideWidth;/.test(source);
  const bareIncomingA = /slotAX\.value\s*=\s*wordSlideWidth;/.test(source);
  const bareOutgoingA = /slotAX\.value\s*=\s*withTiming\(-wordSlideWidth/.test(source);
  const bareOutgoingB = /slotBX\.value\s*=\s*withTiming\(-wordSlideWidth/.test(source);

  assert.ok(
    !bareIncomingB && !bareIncomingA && !bareOutgoingA && !bareOutgoingB,
    '輪播進出平移動畫不應使用未加間隔的 bare wordSlideWidth，否則圖片與卡片會無縫黏連成巨大連續色塊',
  );
});

test('Word Pop 卡片內部各 section（圖片區與文字區）應具有足夠呼吸間距', () => {
  const contentGapMatch = source.match(/wordShowcaseContent:\s*\{[\s\S]*?gap:\s*(\d+)/);
  assert.ok(contentGapMatch, 'wordShowcaseContent 應設定 gap 屬性');
  const gapVal = Number(contentGapMatch[1]);
  assert.ok(gapVal >= 12, `wordShowcaseContent 的 gap 應至少為 12px（目前: ${gapVal}px），確保圖片與文字區塊分明`);
});

test('Word Pop 輪播動畫時長應平緩（>= 600ms）且使用 Ease-Out 軟著陸曲線避免生硬急促', () => {
  const durationMatch = source.match(/const\s+duration\s*=\s*(\d+);/);
  assert.ok(durationMatch, '應定義動畫 duration');
  const duration = Number(durationMatch[1]);
  assert.ok(duration >= 600, `duration 應至少為 600ms 以避免滑動太快太急促（目前: ${duration}ms）`);

  const hasSmoothEasing = /bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/.test(source);
  assert.ok(hasSmoothEasing, 'easing 應使用 bezier(0.22, 1, 0.36, 1) 軟著陸曲線，避免機械生硬感');
});

test('Slot B 初始 SharedValue 不可為 0，必須停留在離屏距離以防初次載入雙卡片重疊亂碼', () => {
  const zeroInitMatch = /const\s+slotBX\s*=\s*useSharedValue\(0\);/.test(source);
  assert.ok(
    !zeroInitMatch,
    'slotBX 初始值不可直接為 0，否則初始渲染時 Slot B 會絕對定位疊在 Slot A 正上方產生重疊亂碼',
  );

  const offscreenInitMatch =
    /const\s+slotBX\s*=\s*useSharedValue\(\s*getWordPopSlideDistance/.test(source);
  assert.ok(
    offscreenInitMatch,
    'slotBX 應使用 getWordPopSlideDistance 初始值停留在可視範圍外',
  );
});


