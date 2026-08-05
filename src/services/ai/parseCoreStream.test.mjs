import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCoreStream } from './parseCoreStream.ts';

test('parses DEF/TRANS/WORD/POS marker format', () => {
  const raw = [
    '==DEF==',
    'to move quickly on foot',
    '==TRANS==',
    '跑',
    '==WORD==',
    'run',
    '==POS==',
    'verb',
    '==RESOLUTION==',
    'unchanged',
  ].join('\n');

  const result = parseCoreStream(raw);
  assert.equal(result.definition, 'to move quickly on foot');
  assert.equal(result.sentenceTranslation, '跑');
  assert.equal(result.normalizedTargetWord, 'run');
  assert.equal(result.partOfSpeech, 'verb');
});

test('handles TRANS before DEF ordering', () => {
  const raw = [
    '==TRANS==',
    '跑',
    '==DEF==',
    'to move quickly on foot',
    '==WORD==',
    'run',
    '==POS==',
    'verb',
  ].join('\n');

  const result = parseCoreStream(raw);
  assert.equal(result.definition, 'to move quickly on foot');
  assert.equal(result.sentenceTranslation, '跑');
  assert.equal(result.normalizedTargetWord, 'run');
  assert.equal(result.partOfSpeech, 'verb');
});

test('strips code fences from marker content', () => {
  const raw = [
    '```json',
    '==DEF==',
    'to move quickly on foot',
    '==TRANS==',
    '跑',
    '==WORD==',
    'run',
    '==POS==',
    'verb',
    '```',
  ].join('\n');

  const result = parseCoreStream(raw);
  assert.equal(result.definition, 'to move quickly on foot');
  assert.equal(result.sentenceTranslation, '跑');
});

test('falls back to first JSON object when no markers present', () => {
  const raw = 'prefix text {"definition":"to run","sentenceTranslation":"跑"} trailing';

  const result = parseCoreStream(raw);
  assert.equal(result.definition, 'to run');
  assert.equal(result.sentenceTranslation, '跑');
});

test('returns empty object for unparseable content', () => {
  const result = parseCoreStream('no markers and no json here');
  assert.deepEqual(result, {});
});
