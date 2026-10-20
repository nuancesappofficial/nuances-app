import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSentenceTranslation,
  respaceSourceSentence,
  respaceSourceSentenceFromContext,
} from './sentenceTranslation.ts';

test('keeps the stored source line when the AI repeats it', () => {
  assert.equal(
    normalizeSentenceTranslation(
      'I run every “morning”.\n我每天早上跑步。',
      'I run every morning.'
    ),
    'I run every morning.\n我每天早上跑步。'
  );
});

test('uses the AI line instead of adding a duplicate when it only restores spaces', () => {
  assert.equal(
    normalizeSentenceTranslation(
      'I thought you were a “natural”\n我以為你是天生好手',
      'I thought you were anatural'
    ),
    'I thought you were a “natural”\n我以為你是天生好手'
  );
});

test('respaces the stored sentence and keeps its own punctuation', () => {
  assert.equal(
    respaceSourceSentence('I thought you were anatural.', 'I thought you were a “natural”'),
    'I thought you were a natural.'
  );
  assert.equal(
    respaceSourceSentence('I run every morning.', 'I run every “morning”.'),
    null
  );
  assert.equal(
    respaceSourceSentence('I thought you were anatural.', 'I thought you were brilliant'),
    null
  );
});

test('reads the AI source line from the contextualExplanation JSON', () => {
  const context = JSON.stringify({
    sentenceTranslation: 'I thought you were a “natural”\n我以為你是天生好手',
  });
  assert.equal(
    respaceSourceSentenceFromContext('I thought you were anatural', context),
    'I thought you were a natural'
  );
  assert.equal(respaceSourceSentenceFromContext('I thought you were anatural', 'plain'), null);
});
