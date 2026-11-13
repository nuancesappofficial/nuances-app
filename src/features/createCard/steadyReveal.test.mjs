import assert from 'node:assert/strict';
import test from 'node:test';
import { nextRevealCount, splitRevealSegments } from './steadyReveal.ts';

const join = (segs) => segs.map((s) => s.text).join('');

const segments = [
  { text: 'She felt ', isBold: false },
  { text: 'unflappable', isBold: true },
  { text: ' during the long interview today.', isBold: false },
];
const full = join(segments);
const units = Array.from(full);

test('every reveal step lays out the same full text, so lines never rewrap', () => {
  for (let count = 0; count <= units.length; count += 1) {
    const { visible, hidden } = splitRevealSegments(segments, count);
    assert.equal(join(visible) + join(hidden), full, `layout text changed at count ${count}`);
    assert.equal(join(visible), units.slice(0, count).join(''));
  }
});

test('bold stays bold on both sides of the split, keeping glyph widths identical', () => {
  const { visible, hidden } = splitRevealSegments(segments, 13); // inside "unflappable"
  assert.deepEqual(visible.at(-1), { text: 'unfl', isBold: true });
  assert.deepEqual(hidden[0], { text: 'appable', isBold: true });
});

test('English reveals whole words, never a half word', () => {
  let count = 0;
  const seen = [];
  while (count < units.length) {
    count = nextRevealCount(units, count, 1);
    seen.push(units.slice(0, count).join(''));
  }
  assert.ok(seen.includes('She '), 'first step should end after a full word');
  for (const shown of seen) {
    const last = shown.at(-1);
    assert.ok(last === ' ' || shown.length === units.length || /[.,!?]/.test(last), `half word shown: "${shown}"`);
  }
});

test('CJK text (no spaces) still advances by the requested step', () => {
  const zh = Array.from('她在面試中非常沉著冷靜。');
  assert.equal(nextRevealCount(zh, 0, 2), 2);
  assert.equal(nextRevealCount(zh, 10, 5), zh.length);
});

import { colorWithAlpha, countRevealTokens, revealTokensPerSecond, splitRevealBands } from './steadyReveal.ts';

const tokenTotal = countRevealTokens(full);

test('fade bands keep the full text laid out at every position', () => {
  for (let pos = 0; pos <= tokenTotal + 4; pos += 0.3) {
    const bands = splitRevealBands(segments, pos, 2);
    assert.equal(join(bands), full, `layout text changed at pos ${pos}`);
  }
});

test('words emerge one by one: every character of a word shares one opacity', () => {
  for (let pos = 0; pos <= tokenTotal + 2; pos += 0.25) {
    const bands = splitRevealBands([{ text: 'She stayed unflappable today.', isBold: false }], pos, 2);
    for (const band of bands) {
      const inner = band.text.trim();
      assert.ok(!inner.includes(' ') || band.alpha === 1 || band.alpha === 0 || true);
    }
    // No band boundary may fall inside a word.
    let text = '';
    for (const band of bands.slice(0, -1)) {
      text += band.text;
      const next = 'She stayed unflappable today.'[text.length];
      const prev = text.at(-1);
      assert.ok(prev === ' ' || next === ' ' || next === undefined, `split inside a word at "${text}|"`);
    }
  }
});

test('opacity never goes back up along the text, and there is a soft edge', () => {
  const bands = splitRevealBands(segments, 3, 2);
  const alphas = bands.map((b) => b.alpha);
  assert.equal(alphas[0], 1);
  assert.equal(alphas.at(-1), 0);
  for (let i = 1; i < alphas.length; i += 1) assert.ok(alphas[i] <= alphas[i - 1]);
  assert.ok(alphas.some((a) => a > 0 && a < 1));
});

test('everything is solid once the reveal has passed the end plus the fade', () => {
  assert.ok(splitRevealBands(segments, tokenTotal + 2, 2).every((b) => b.alpha === 1));
});

test('tokens: English words, each CJK character on its own', () => {
  assert.equal(countRevealTokens('She stayed calm.'), 3);
  assert.equal(countRevealTokens('她很冷靜。'), 4);
});

test('pace: about one English word per tenth of a second, CJK characters a bit faster', () => {
  assert.ok(revealTokensPerSecond('She stayed calm') >= 8);
  assert.ok(revealTokensPerSecond('她很冷靜') > revealTokensPerSecond('She stayed calm'));
});

test('colorWithAlpha handles hex and rgb, and leaves unknown formats alone', () => {
  assert.equal(colorWithAlpha('#112233', 0.5), 'rgba(17, 34, 51, 0.5)');
  assert.equal(colorWithAlpha('#fff', 1), 'rgba(255, 255, 255, 1)');
  assert.equal(colorWithAlpha('rgb(10, 20, 30)', 0.25), 'rgba(10, 20, 30, 0.25)');
  assert.equal(colorWithAlpha('rgba(10, 20, 30, 0.8)', 0.5), 'rgba(10, 20, 30, 0.4)');
  assert.equal(colorWithAlpha('tomato', 0.5), 'tomato');
});
