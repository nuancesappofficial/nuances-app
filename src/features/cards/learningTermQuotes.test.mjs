import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unquoteLearningTermInText,
  segmentSentenceWithTargetWord,
} from './learningTermQuotes.ts';

test('unquoteLearningTermInText removes surrounding quotes around the target word', () => {
  assert.equal(
    unquoteLearningTermInText('She noticed a subtle “nuance” in his tone.', 'nuance'),
    'She noticed a subtle nuance in his tone.'
  );
  assert.equal(
    unquoteLearningTermInText('He made a "deliberate" choice.', 'deliberate'),
    'He made a deliberate choice.'
  );
  assert.equal(
    unquoteLearningTermInText('這是「細微差別」的表現。', '細微差別'),
    '這是細微差別的表現。'
  );
  assert.equal(
    unquoteLearningTermInText('Case insensitive “Nuance” check.', 'nuance'),
    'Case insensitive Nuance check.'
  );
  assert.equal(
    unquoteLearningTermInText('Already unquoted sentence with nuance.', 'nuance'),
    'Already unquoted sentence with nuance.'
  );
});

test('segmentSentenceWithTargetWord splits sentence into text and bold segments', () => {
  const result = segmentSentenceWithTargetWord(
    'She noticed a subtle “nuance” in his tone.',
    'nuance'
  );
  assert.deepEqual(result, [
    { text: 'She noticed a subtle ', isBold: false },
    { text: 'nuance', isBold: true },
    { text: ' in his tone.', isBold: false },
  ]);

  const unquotedResult = segmentSentenceWithTargetWord(
    'Deliberate practice is key.',
    'deliberate'
  );
  assert.deepEqual(unquotedResult, [
    { text: 'Deliberate', isBold: true },
    { text: ' practice is key.', isBold: false },
  ]);

  const inflectedResult = segmentSentenceWithTargetWord(
    'The "nuances" matter most.',
    'nuance'
  );
  assert.deepEqual(inflectedResult, [
    { text: 'The ', isBold: false },
    { text: 'nuances', isBold: true },
    { text: ' matter most.', isBold: false },
  ]);

  const notFound = segmentSentenceWithTargetWord('No match here.', 'nuance');
  assert.deepEqual(notFound, [
    { text: 'No match here.', isBold: false },
  ]);
});

