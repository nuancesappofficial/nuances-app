import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CARD_DETAIL_HORIZONTAL_INSET,
  resolveCardDetailSectionLayout,
  resolveExamplePreviewLayout,
  resolveFrontTextWrapGuard,
  shouldOfferExampleExpansion,
} from './cardDetailSectionLayout.ts';

test('collapsed back sections preserve their percentage allocation and personal notes', () => {
  const layout = resolveCardDetailSectionLayout(520);

  assert.deepEqual(layout, {
    collocations: 83,
    semanticRelations: 73,
    examples: 114,
    personalNotes: 73,
  });
  assert.ok(
    Object.values(layout).reduce((total, height) => total + height, 0) <= 343
  );
});

test('compact cards do not replace percentage allocations with oversized minimums', () => {
  assert.deepEqual(resolveCardDetailSectionLayout(320), {
    collocations: 51,
    semanticRelations: 45,
    examples: 70,
    personalNotes: 45,
  });
});

test('card detail content uses the same safe inset on both edges', () => {
  assert.deepEqual(CARD_DETAIL_HORIZONTAL_INSET, { left: 12, right: 12 });
});

test('front text reserves one full glyph before the clipping edge', () => {
  assert.equal(resolveFrontTextWrapGuard(20), 20);
  assert.equal(resolveFrontTextWrapGuard(18.4), 19);
});

test('example preview is clipped to its allocation before measurement', () => {
  assert.deepEqual(resolveExamplePreviewLayout(114, 0, false), {
    height: 114,
    hasOverflow: false,
  });
});

test('measured example overflow stays clipped until expanded', () => {
  assert.deepEqual(resolveExamplePreviewLayout(114, 360, false), {
    height: 114,
    hasOverflow: true,
  });
  assert.deepEqual(resolveExamplePreviewLayout(114, 360, true), {
    height: 360,
    hasOverflow: true,
  });
});

test('multiple examples always offer expansion from a single fixed preview', () => {
  assert.equal(shouldOfferExampleExpansion(3, 0, 114), true);
  assert.equal(shouldOfferExampleExpansion(1, 360, 114), true);
  assert.equal(shouldOfferExampleExpansion(1, 90, 114), false);
});
