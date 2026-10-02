import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCardFrontDynamicLayout } from './cardFrontDynamicLayout.ts';

test('當卡片可用高度充裕時，零收合（Zero-Collapse）', () => {
  const result = resolveCardFrontDynamicLayout({
    viewportHeight: 520,
    meaningHeight: 48,
    sentenceMeasuredHeight: 112, // 4 lines @ 28px
    contextMeasuredHeight: 50,  // 2 lines @ 25px
    sentenceLineHeight: 28,
    contextLineHeight: 25,
    hasInsightMetrics: true,
  });

  assert.equal(result.fitsWithoutCollapse, true);
  assert.equal(result.shouldOfferFullSentence, false, '例句不應收合');
  assert.equal(result.shouldOfferFullContext, false, '語境不應收合');
  assert.ok(result.sentenceBudgetHeight >= 112);
  assert.ok(result.contextBudgetHeight >= 50);
});

test('語境短時，未用空間讓渡給例句，例句免收合', () => {
  // 總可視 420，Meaning 50，Chrome ~160 -> 可用文字空間約 210
  // Context 只有 1 行 (25px)
  // Sentence 需要 4 行 (112px)
  // 總共需 137px <= 210px，兩者皆應完全展開
  const result = resolveCardFrontDynamicLayout({
    viewportHeight: 420,
    meaningHeight: 50,
    sentenceMeasuredHeight: 112,
    contextMeasuredHeight: 25,
    sentenceLineHeight: 28,
    contextLineHeight: 25,
    hasInsightMetrics: true,
  });

  assert.equal(result.fitsWithoutCollapse, true);
  assert.equal(result.shouldOfferFullSentence, false, '例句雖超過3行但卡片放得下，不應收合');
  assert.equal(result.shouldOfferFullContext, false);
});

test('例句短時，未用空間讓渡給語境，語境免收合', () => {
  // 總可視 480，Meaning 50，Chrome ~228 -> 可用文字空間約 202
  // Sentence 只有 1 行 (28px)
  // Context 需要 6 行 (150px)
  // 總共需 178px <= 202px
  const result = resolveCardFrontDynamicLayout({
    viewportHeight: 480,
    meaningHeight: 50,
    sentenceMeasuredHeight: 28,
    contextMeasuredHeight: 150,
    sentenceLineHeight: 28,
    contextLineHeight: 25,
    hasInsightMetrics: true,
  });

  assert.equal(result.fitsWithoutCollapse, true);
  assert.equal(result.shouldOfferFullSentence, false);
  assert.equal(result.shouldOfferFullContext, false, '語境雖超過4行但卡片放得下，不應收合');
});

test('當兩者皆過長且超出卡片空間時，按保底預算與比例收合', () => {
  // 可用文字空間 180
  // Sentence 200px, Context 200px -> 總共 400px > 180px
  const result = resolveCardFrontDynamicLayout({
    viewportHeight: 390,
    meaningHeight: 50,
    sentenceMeasuredHeight: 200,
    contextMeasuredHeight: 200,
    sentenceLineHeight: 28,
    contextLineHeight: 25,
    hasInsightMetrics: true,
    minSentenceLines: 3,
    minContextLines: 2,
  });

  assert.equal(result.fitsWithoutCollapse, false);
  assert.equal(result.shouldOfferFullSentence, true, '例句應提供展開按鈕');
  assert.equal(result.shouldOfferFullContext, true, '語境應提供展開按鈕');
  assert.ok(result.sentenceBudgetHeight >= 3 * 28, '應至少保障保底行數高度');
  assert.ok(result.contextBudgetHeight >= 2 * 25, '應至少保障保底行數高度');
});

test('無 Insight Metrics 時，減少固定 Chrome 佔用預算', () => {
  const withMetrics = resolveCardFrontDynamicLayout({
    viewportHeight: 400,
    meaningHeight: 40,
    sentenceMeasuredHeight: 100,
    contextMeasuredHeight: 100,
    sentenceLineHeight: 28,
    contextLineHeight: 25,
    hasInsightMetrics: true,
  });

  const withoutMetrics = resolveCardFrontDynamicLayout({
    viewportHeight: 400,
    meaningHeight: 40,
    sentenceMeasuredHeight: 100,
    contextMeasuredHeight: 100,
    sentenceLineHeight: 28,
    contextLineHeight: 25,
    hasInsightMetrics: false,
  });

  assert.ok(
    withoutMetrics.availableTextHeight > withMetrics.availableTextHeight,
    '無 metrics 時應有更多可用文字高度'
  );
});

test('釋義（Meaning）多行佔用高度時，動態扣除並保護例句保底', () => {
  const result = resolveCardFrontDynamicLayout({
    viewportHeight: 400,
    meaningHeight: 120, // 特長釋義
    sentenceMeasuredHeight: 100,
    contextMeasuredHeight: 100,
    sentenceLineHeight: 28,
    contextLineHeight: 25,
    hasInsightMetrics: false,
    minSentenceLines: 2,
    minContextLines: 2,
  });

  assert.ok(result.sentenceBudgetHeight >= 2 * 28);
  assert.ok(result.contextBudgetHeight >= 2 * 25);
});

test('初次渲染 viewportHeight 或 measuredHeight 為 0 時不拋錯並回傳平順保底', () => {
  const result = resolveCardFrontDynamicLayout({
    viewportHeight: 0,
    meaningHeight: 0,
    sentenceMeasuredHeight: 0,
    contextMeasuredHeight: 0,
    sentenceLineHeight: 28,
    contextLineHeight: 25,
  });

  assert.equal(result.fitsWithoutCollapse, true);
  assert.equal(result.shouldOfferFullSentence, false);
  assert.equal(result.shouldOfferFullContext, false);
});

test('所有收合高度預算必須整行對齊（Line-Snapping），禁止非整數行的高度以防文字被腰斬裁切', () => {
  const result = resolveCardFrontDynamicLayout({
    viewportHeight: 450,
    meaningHeight: 45,
    sentenceMeasuredHeight: 180,
    contextMeasuredHeight: 180,
    sentenceLineHeight: 28,
    contextLineHeight: 25,
  });

  assert.equal(
    result.sentenceBudgetHeight % 28,
    0,
    '例句預算高度必須是行高的整數倍'
  );
  assert.equal(
    result.contextBudgetHeight % 25,
    0,
    '語境預算高度必須是行高的整數倍'
  );
  assert.equal(
    result.sentenceBudgetHeight,
    result.sentenceBudgetLines * 28,
    '例句預算高度應精確等於行數乘以行高'
  );
  assert.equal(
    result.contextBudgetHeight,
    result.contextBudgetLines * 25,
    '語境預算高度應精確等於行數乘以行高'
  );
});

test('真實卡片情境（帶有 Hero Image 且語境有5行時），若空間不足應觸發收合且不溢出截斷', () => {
  // 模擬 admonishment 卡片：視窗 310，釋義 38，Chrome ~186 -> 可用文字空間約 86
  // 例句需要 120 (4行)，語境需要 125 (5行)
  const result = resolveCardFrontDynamicLayout({
    viewportHeight: 310,
    meaningHeight: 38,
    sentenceMeasuredHeight: 120,
    contextMeasuredHeight: 125,
    sentenceLineHeight: 28,
    contextLineHeight: 25,
    hasInsightMetrics: false,
    minSentenceLines: 3,
    minContextLines: 3,
  });

  assert.equal(result.fitsWithoutCollapse, false, '空間不足時必須觸發收合');
  assert.equal(result.shouldOfferFullContext, true, '語境必須提供展開按鈕');
  assert.equal(result.contextBudgetHeight % 25, 0, '語境高度必須為行高整數倍');
  assert.ok(
    result.contextBudgetHeight <= result.contextBudgetLines * 25,
    '語境高度不得超過行數預算'
  );
});
