import assert from 'node:assert/strict';
import test from 'node:test';

import {
  balanceOnboardingQuestion,
  getOnboardingLayoutMetrics,
} from './onboardingQuestionLayout.ts';

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

test('getOnboardingLayoutMetrics returns compact metrics for Pixel 3 dimensions', () => {
  // Pixel 3 viewport dimensions: 392.7 x 785.4 dp (or scaled 360 x 700 dp)
  const compactMetrics = getOnboardingLayoutMetrics(360, 700);
  assert.equal(compactMetrics.isCompact, true);
  assert.equal(compactMetrics.titleNumberOfLines, 3);
  assert.equal(compactMetrics.titleFontSize, 23);
  assert.equal(compactMetrics.stickerHeight, 68);
  assert.equal(compactMetrics.stickerSvgHeight, 68);

  // Standard large screen dimensions (e.g. iPhone 15 Pro: 393 x 852 dp)
  const standardMetrics = getOnboardingLayoutMetrics(393, 852);
  assert.equal(standardMetrics.isCompact, false);
  assert.equal(standardMetrics.titleNumberOfLines, 2);
  assert.equal(standardMetrics.titleFontSize, 27);
  assert.equal(standardMetrics.stickerHeight, 88);
  assert.equal(standardMetrics.stickerSvgHeight, 88);
});

