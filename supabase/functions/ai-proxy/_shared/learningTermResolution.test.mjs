import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chooseLearningTerm,
  isPhrasePartOfSpeech,
  extractPhraseFromContext,
  resolveContextualLearningTerm,
  resolveLearningTermWithRouteA,
} from './learningTermResolution.ts';


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

test('isPhrasePartOfSpeech detects phrase-like parts of speech', () => {
  assert.equal(isPhrasePartOfSpeech('phrasal verb'), true);
  assert.equal(isPhrasePartOfSpeech('phrase'), true);
  assert.equal(isPhrasePartOfSpeech('idiom'), true);
  assert.equal(isPhrasePartOfSpeech('fixed expression'), true);
  assert.equal(isPhrasePartOfSpeech('片語'), true);
  assert.equal(isPhrasePartOfSpeech('noun'), false);
  assert.equal(isPhrasePartOfSpeech('verb'), false);
  assert.equal(isPhrasePartOfSpeech('adjective'), false);
});

test('extractPhraseFromContext extracts phrase from candidates if valid', () => {
  const result = extractPhraseFromContext({
    originalSentence: 'guy really told superman to “square” up',
    targetWord: 'square',
    candidates: ['square up'],
  });
  assert.equal(result, 'square up');
});

test('extractPhraseFromContext extracts particle phrase from sentence when candidate is single word', () => {
  const result = extractPhraseFromContext({
    originalSentence: 'guy really told superman to square up',
    targetWord: 'square',
    candidates: ['square'],
  });
  assert.equal(result, 'square up');
});

test('resolveContextualLearningTerm promotes square to square up directly when partOfSpeech is phrasal verb', () => {
  const result = resolveContextualLearningTerm({
    originalTarget: 'square',
    lemma: 'square',
    partOfSpeech: 'phrasal verb',
    originalSentence: 'guy really told superman to square up',
    candidates: ['square up'],
  });
  assert.deepEqual(result, {
    learningTerm: 'square up',
    kind: 'phrase',
    confirmedPhrase: true,
  });
});

test('resolveContextualLearningTerm extracts phrase from sentence even when candidates only had single word', () => {
  const result = resolveContextualLearningTerm({
    originalTarget: 'square',
    lemma: 'square',
    partOfSpeech: 'phrasal verb',
    originalSentence: 'guy really told superman to square up',
    candidates: ['square'],
  });
  assert.deepEqual(result, {
    learningTerm: 'square up',
    kind: 'phrase',
    confirmedPhrase: true,
  });
});

test('resolveLearningTermWithRouteA backward compatibility alias works', () => {
  const result = resolveLearningTermWithRouteA({
    originalTarget: 'square',
    lemma: 'square',
    partOfSpeech: 'phrasal verb',
    originalSentence: 'guy really told superman to square up',
    candidates: ['square up'],
  });
  assert.equal(result.learningTerm, 'square up');
});

test('extractPhraseFromContext matches canonical phrase candidate when target in sentence is inflected', () => {
  const result = extractPhraseFromContext({
    originalSentence: 'he squared up to his opponent',
    targetWord: 'squared',
    lemma: 'square',
    candidates: ['square up'],
  });
  assert.equal(result, 'square up');
});

test('extractPhraseFromContext uses lemma when generating phrase from sentence particles', () => {
  const result = extractPhraseFromContext({
    originalSentence: 'he squared up to his opponent',
    targetWord: 'squared',
    lemma: 'square',
    candidates: ['squared'],
  });
  assert.equal(result, 'square up');
});




