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

test('pickSentenceContainingWord extracts contiguous sentence for mid-paragraph word without splicing disparate lines', () => {
  const text = `Griffin cut him off. 'Would you like to know the second and third largest sources of income at Babel?'
'Legal?'
'No. Militaries, both state and private,' said Griffin. 'And then slave traders. Legal makes pennies in comparison.'
'That's... that's impossible.'
'No, that's just how the world works. Let me paint you a picture, brother. You've noticed by now that London sits at the centre of a vast empire that won't stop growing. The single most important enabler of this growth is Babel. Babel collects foreign languages and foreign talent the same way it hoards silver and uses them to produce translation magic that benefits England and England only. The vast majority of all silver`;

  const result0 = pickSentenceContainingWord(text, 'legal', { targetOccurrence: 0 });
  assert.ok(result0.includes("'Would you like to know the second and third largest sources of income at Babel?' 'Legal?'"));
  assert.ok(!result0.includes('benefits England and England only'));

  const result1 = pickSentenceContainingWord(text, 'legal', { targetOccurrence: 1 });
  assert.ok(result1.includes("Legal makes pennies in comparison"));
  assert.ok(!result1.includes('benefits England and England only'));
});
