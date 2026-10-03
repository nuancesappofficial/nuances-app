import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCardBackDynamicLayout } from './cardBackDynamicLayout.ts';

test('當背面所有區塊總高放得下時，零收合（Zero-Collapse）', () => {
  const result = resolveCardBackDynamicLayout({
    viewportHeight: 520,
    activeSections: {
      collocations: true,
      semanticRelations: true,
      examples: true,
      personalNotes: false,
    },
    measuredHeights: {
      collocations: 60,
      semanticRelations: 50,
      examples: 100,
    },
    lineHeight: 24,
    exampleCount: 2,
  });

  assert.equal(result.fitsWithoutCollapse, true);
  assert.equal(result.shouldOfferExpansion.collocations, false);
  assert.equal(result.shouldOfferExpansion.semanticRelations, false);
  assert.equal(result.shouldOfferExpansion.examples, false, '例句總高充裕時不應強制收合');
});

test('部分區塊為空時，空間自動重新分配給現存區塊', () => {
  // 只有 examples 存在，其他皆為空
  const result = resolveCardBackDynamicLayout({
    viewportHeight: 520,
    activeSections: {
      collocations: false,
      semanticRelations: false,
      examples: true,
      personalNotes: false,
    },
    measuredHeights: {
      examples: 260,
    },
    lineHeight: 24,
    exampleCount: 3,
  });

  // 單獨區塊應獨享可用高度（約 400px+），260px 完全放得下，不應收合
  assert.equal(result.fitsWithoutCollapse, true);
  assert.equal(result.shouldOfferExpansion.examples, false, '單獨存在且空間充裕時不收合');
  assert.ok(result.limits.examples >= 260);
});

test('短區塊未用空間讓渡給長區塊（跨區塊動態讓渡）', () => {
  // 搭配詞只有 1 行 (30px)，例句有 4 句 (200px)
  const result = resolveCardBackDynamicLayout({
    viewportHeight: 450,
    activeSections: {
      collocations: true,
      semanticRelations: false,
      examples: true,
      personalNotes: false,
    },
    measuredHeights: {
      collocations: 30,
      examples: 200,
    },
    lineHeight: 24,
    exampleCount: 4,
  });

  assert.equal(result.fitsWithoutCollapse, true);
  assert.equal(result.shouldOfferExpansion.collocations, false);
  assert.equal(result.shouldOfferExpansion.examples, false, '搭配詞讓出空間後例句免收合');
});

test('當內容確實過長需收合時，收合上限嚴格整行對齊（Line-Snapping）', () => {
  const result = resolveCardBackDynamicLayout({
    viewportHeight: 400,
    activeSections: {
      collocations: true,
      semanticRelations: true,
      examples: true,
      personalNotes: true,
    },
    measuredHeights: {
      collocations: 180,
      semanticRelations: 180,
      examples: 280,
      personalNotes: 180,
    },
    lineHeight: 24,
    exampleCount: 5,
  });

  assert.equal(result.fitsWithoutCollapse, false);
  assert.equal(result.shouldOfferExpansion.examples, true);
  assert.equal(
    result.limits.examples % 24,
    0,
    '例句收合限制高度必須是行高的整數倍'
  );
  assert.equal(
    result.limits.collocations % 24,
    0,
    '搭配詞收合限制高度必須是行高的整數倍'
  );
});

test('有 supplementarySensesCount 時，會為其他釋義保留高度預算', () => {
  const withoutSupplementary = resolveCardBackDynamicLayout({
    viewportHeight: 450,
    activeSections: {
      collocations: true,
      semanticRelations: false,
      examples: true,
      personalNotes: false,
    },
    measuredHeights: {
      collocations: 80,
      examples: 180,
    },
    lineHeight: 24,
    exampleCount: 3,
    supplementarySensesCount: 0,
  });

  const withSupplementary = resolveCardBackDynamicLayout({
    viewportHeight: 450,
    activeSections: {
      collocations: true,
      semanticRelations: false,
      examples: true,
      personalNotes: false,
    },
    measuredHeights: {
      collocations: 80,
      examples: 180,
    },
    lineHeight: 24,
    exampleCount: 3,
    supplementarySensesCount: 2,
  });

  assert.ok(
    withSupplementary.availableContentHeight < withoutSupplementary.availableContentHeight,
    '附帶其他釋義時，可用內容高度必須動態扣減以防溢出截斷'
  );
});
