import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseLearningTerm } from './learningTermResolution.ts';

test('uses the lemma when the target word itself preserves the contextual meaning', () => {
  assert.deepEqual(
    chooseLearningTerm({
      originalTarget: 'aimed',
      lemma: 'aim',
      lemmaMeaningPreserved: true,
      canonicalPhrase: 'aimed a',
      phraseConfirmed: true,
    }),
    { learningTerm: 'aim', kind: 'lemma' }
  );
});

test('keeps an independently meaningful noun as a word', () => {
  assert.deepEqual(
    chooseLearningTerm({
      originalTarget: 'script',
      lemma: 'script',
      lemmaMeaningPreserved: true,
      canonicalPhrase: 'stick to the script',
      phraseConfirmed: true,
    }),
    { learningTerm: 'script', kind: 'unchanged' }
  );
});

test('uses a canonical phrase only when the word alone loses the contextual meaning', () => {
  assert.deepEqual(
    chooseLearningTerm({
      originalTarget: 'let',
      lemma: 'let',
      lemmaMeaningPreserved: false,
      canonicalPhrase: 'let someone down',
      phraseConfirmed: true,
    }),
    { learningTerm: 'let someone down', kind: 'phrase' }
  );
});

test('falls back to the lemma when no complete phrase is confirmed', () => {
  assert.deepEqual(
    chooseLearningTerm({
      originalTarget: 'lead',
      lemma: 'lead',
      lemmaMeaningPreserved: false,
      canonicalPhrase: 'lead you',
      phraseConfirmed: false,
    }),
    { learningTerm: 'lead', kind: 'unchanged' }
  );
});
