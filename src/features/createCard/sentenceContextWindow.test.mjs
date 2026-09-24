import assert from 'node:assert/strict';
import test from 'node:test';

import { pickSentenceContainingWord } from './textTransforms.ts';

test('pickSentenceContainingWord pulls in preceding sentence when context is short (e.g. 8 words)', () => {
  const text = "I know her parents made love that night. She's not the baby of a quick nut.";
  const result = pickSentenceContainingWord(text, 'nut');
  assert.equal(
    result,
    "I know her parents made love that night. She's not the baby of a quick nut."
  );
});

test('pickSentenceContainingWord respects MAX_SOURCE_WORDS upper bound', () => {
  const longPrefix = "This is a preamble sentence that has many words to test bounds. Another long sentence before it that adds more words. ";
  const text = longPrefix + "I know her parents made love that night. She's not the baby of a quick nut.";
  const result = pickSentenceContainingWord(text, 'nut');
  assert.ok(result.includes("She's not the baby of a quick nut."));
  assert.ok(result.split(/\s+/).length <= 45);
});

test('pickSentenceContainingWord does not infinite loop when expanding in both directions', () => {
  const text = "First short. Middle contains word. Last short.";
  const result = pickSentenceContainingWord(text, 'word');
  assert.equal(result, "First short. Middle contains word. Last short.");
});
