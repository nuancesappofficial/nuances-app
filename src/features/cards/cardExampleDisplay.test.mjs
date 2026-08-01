import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeEnglishExampleDisplayOrder } from './cardExampleDisplay.ts';

test('English example is shown first even when the stored pair is reversed', () => {
  assert.deepEqual(
    normalizeEnglishExampleDisplayOrder({
      sentence: '該地區的緊張局勢加劇。',
      translation: 'Tension in the region has escalated.',
    }),
    {
      sentence: 'Tension in the region has escalated.',
      translation: '該地區的緊張局勢加劇。',
    }
  );
});

test('English example order does not depend on the card title or source context', () => {
  assert.deepEqual(
    normalizeEnglishExampleDisplayOrder({
      sentence: 'Lead someone on.',
      translation: '誤導某人。',
    }),
    {
      sentence: 'Lead someone on.',
      translation: '誤導某人。',
    }
  );
});
