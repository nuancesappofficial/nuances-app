import assert from 'node:assert/strict';
import test from 'node:test';

import { getTipNotificationCopy } from './tipNotificationCatalog.ts';

test('explains scanned-word spelling correction without OCR jargon in Traditional Chinese', () => {
  const copy = getTipNotificationCopy('zh-TW', 'correct_scanned_word');

  assert.deepEqual(copy, {
    title: '拼字怪怪的？',
    body: '長按掃描出的單字，就能直接修改。',
  });
  assert.doesNotMatch(`${copy.title}${copy.body}`, /OCR/i);
});

test('provides the scanned-word spelling correction tip in English', () => {
  assert.deepEqual(getTipNotificationCopy('en', 'correct_scanned_word'), {
    title: 'Spelling look off?',
    body: 'Press and hold a scanned word to edit it.',
  });
});
