import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unquoteLearningTermInText,
  segmentSentenceWithTargetWord,
  sliceSegmentsByCharacterCount,
  buildProgressiveSentenceSegments,
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

test('sliceSegmentsByCharacterCount handles empty or 0 count', () => {
  const segments = [
    { text: 'The smallest ', isBold: false },
    { text: 'nuances', isBold: true },
  ];
  assert.deepEqual(sliceSegmentsByCharacterCount(segments, 0), []);
  assert.deepEqual(sliceSegmentsByCharacterCount([], 10), []);
});

test('sliceSegmentsByCharacterCount slices within first segment', () => {
  const segments = [
    { text: 'The smallest ', isBold: false }, // 13 chars
    { text: 'nuances', isBold: true },        // 7 chars
  ];
  const sliced = sliceSegmentsByCharacterCount(segments, 5);
  assert.deepEqual(sliced, [{ text: 'The s', isBold: false }]);
});

test('sliceSegmentsByCharacterCount slices into bold target segment', () => {
  const segments = [
    { text: 'The smallest ', isBold: false }, // 13 chars
    { text: 'nuances', isBold: true },        // 7 chars
    { text: ' can make', isBold: false },
  ];
  // 15 = 13 + 2 chars of "nuances"
  const sliced = sliceSegmentsByCharacterCount(segments, 15);
  assert.deepEqual(sliced, [
    { text: 'The smallest ', isBold: false },
    { text: 'nu', isBold: true },
  ]);
});

test('sliceSegmentsByCharacterCount slices across all segments up to visibleCount', () => {
  const segments = [
    { text: 'The smallest ', isBold: false }, // 13 chars
    { text: 'nuances', isBold: true },        // 7 chars
    { text: ' can make', isBold: false },     // 9 chars
  ];
  const sliced = sliceSegmentsByCharacterCount(segments, 25);
  assert.deepEqual(sliced, [
    { text: 'The smallest ', isBold: false },
    { text: 'nuances', isBold: true },
    { text: ' can ', isBold: false },
  ]);
});

test('sliceSegmentsByCharacterCount handles unicode properly', () => {
  const segments = [
    { text: '細微的', isBold: false }, // 3 chars
    { text: 'nuances', isBold: true }, // 7 chars
  ];
  const sliced = sliceSegmentsByCharacterCount(segments, 4);
  assert.deepEqual(sliced, [
    { text: '細微的', isBold: false },
    { text: 'n', isBold: true },
  ]);
});

test('buildProgressiveSentenceSegments returns unquoted segments and clean text', () => {
  const sentence = 'The smallest “nuances” can make the biggest differences.';
  const term = 'nuances';
  const { segments, cleanText } = buildProgressiveSentenceSegments(sentence, term);

  assert.equal(cleanText, 'The smallest nuances can make the biggest differences.');
  assert.equal(segments.length, 3);
  assert.equal(segments[1].text, 'nuances');
  assert.equal(segments[1].isBold, true);
});

test('buildProgressiveSentenceSegments handles empty term or no match gracefully', () => {
  const sentence = 'Simple sentence without match.';
  const { segments, cleanText } = buildProgressiveSentenceSegments(sentence, 'other');

  assert.equal(cleanText, 'Simple sentence without match.');
  assert.deepEqual(segments, [{ text: 'Simple sentence without match.', isBold: false }]);
});


