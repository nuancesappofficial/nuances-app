import assert from 'node:assert/strict';
import test from 'node:test';

import { groupSelectedSourceTokens } from './textTransforms.ts';

test('groupSelectedSourceTokens keeps adjacent selected tokens as separate targets by default (Option 2A)', () => {
  const tokens = ['look', 'after', 'the', 'cat'];
  const targets = groupSelectedSourceTokens(tokens, [0, 1], 'look after the cat');

  assert.equal(targets.length, 2);
  assert.equal(targets[0].text, 'look');
  assert.equal(targets[0].startIndex, 0);
  assert.equal(targets[0].endIndex, 0);
  assert.equal(targets[1].text, 'after');
  assert.equal(targets[1].startIndex, 1);
  assert.equal(targets[1].endIndex, 1);
});

test('groupSelectedSourceTokens merges adjacent tokens when explicitly listed in mergedPhraseRanges', () => {
  const tokens = ['look', 'after', 'the', 'cat'];
  const targets = groupSelectedSourceTokens(
    tokens,
    [0, 1],
    'look after the cat',
    [{ startIndex: 0, endIndex: 1 }]
  );

  assert.equal(targets.length, 1);
  assert.equal(targets[0].text, 'look after');
  assert.equal(targets[0].startIndex, 0);
  assert.equal(targets[0].endIndex, 1);
});

test('groupSelectedSourceTokens supports mix of merged phrase targets and single token targets', () => {
  const tokens = ['look', 'after', 'the', 'cat'];
  const targets = groupSelectedSourceTokens(
    tokens,
    [0, 1, 3],
    'look after the cat',
    [{ startIndex: 0, endIndex: 1 }]
  );

  assert.equal(targets.length, 2);
  assert.equal(targets[0].text, 'look after');
  assert.equal(targets[0].startIndex, 0);
  assert.equal(targets[0].endIndex, 1);
  assert.equal(targets[1].text, 'cat');
  assert.equal(targets[1].startIndex, 3);
  assert.equal(targets[1].endIndex, 3);
});

test('groupSelectedSourceTokens preserves CJK character fallback span behavior', () => {
  const tokens = ['你', '好', '世', '界'];
  const targets = groupSelectedSourceTokens(tokens, [0, 1], '你好世界');

  assert.equal(targets.length, 1);
  assert.equal(targets[0].text, '你好');
});

test('groupSelectedSourceTokens supports multiple distinct merged phrases simultaneously', () => {
  const tokens = ['look', 'after', 'and', 'take', 'care'];
  const targets = groupSelectedSourceTokens(
    tokens,
    [0, 1, 3, 4],
    'look after and take care',
    [
      { startIndex: 0, endIndex: 1 },
      { startIndex: 3, endIndex: 4 },
    ]
  );

  assert.equal(targets.length, 2);
  assert.equal(targets[0].text, 'look after');
  assert.equal(targets[0].startIndex, 0);
  assert.equal(targets[0].endIndex, 1);
  assert.equal(targets[1].text, 'take care');
  assert.equal(targets[1].startIndex, 3);
  assert.equal(targets[1].endIndex, 4);
});

test('groupSelectedSourceTokens honors explicit merged phrases across punctuation', () => {
  const tokens = ['well', 'known'];
  const targets = groupSelectedSourceTokens(
    tokens,
    [0, 1],
    'well, known',
    [{ startIndex: 0, endIndex: 1 }]
  );

  assert.equal(targets.length, 1);
  assert.equal(targets[0].text, 'well known');
  assert.equal(targets[0].startIndex, 0);
  assert.equal(targets[0].endIndex, 1);
});

