import assert from 'node:assert/strict';
import test from 'node:test';

import { balanceOnboardingQuestion } from './onboardingQuestionLayout.ts';

test('balances long English questions without leaving one word alone', () => {
  const balanced = balanceOnboardingQuestion(
    'What do you do when you find an unfamiliar word?',
  );
  const lines = balanced.split('\n');

  assert.equal(lines.length, 2);
  assert.ok(lines[0].split(' ').length > 1);
  assert.ok(lines[1].split(' ').length > 1);
  assert.ok(Math.abs(lines[0].length - lines[1].length) <= 12);
});

test('keeps short questions on one line', () => {
  assert.equal(
    balanceOnboardingQuestion('Where do you learn?'),
    'Where do you learn?',
  );
});

test('balances mixed Chinese and Latin copy instead of orphaning the last word', () => {
  assert.equal(
    balanceOnboardingQuestion('你希望 Nuances 用什麼語言解釋英文？'),
    '你希望 Nuances\n用什麼語言解釋英文？',
  );
});
