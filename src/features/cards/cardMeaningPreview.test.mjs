import assert from 'node:assert/strict';
import test from 'node:test';

import { getCardMeaningPreview } from './cardMeaningPreview.ts';

test('uses the first non-empty line of the definition', () => {
  assert.equal(getCardMeaningPreview('\n  爆料、說八卦 \n詳細解釋第二行'), '爆料、說八卦');
});

test('drops a leading list marker', () => {
  assert.equal(getCardMeaningPreview('1. 欺騙手段'), '欺騙手段');
  assert.equal(getCardMeaningPreview('• 欺騙手段'), '欺騙手段');
});

test('returns empty for a missing or placeholder definition', () => {
  assert.equal(getCardMeaningPreview(undefined), '');
  assert.equal(getCardMeaningPreview('   '), '');
  assert.equal(getCardMeaningPreview('-'), '');
});
