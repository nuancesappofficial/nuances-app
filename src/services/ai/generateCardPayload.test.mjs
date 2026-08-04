import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGenerateCardPayload } from './generateCardPayload.ts';

test('non-streaming generate_card payload includes the generationId when provided', () => {
  const payload = buildGenerateCardPayload({
    targetWord: 'run',
    originalSentence: 'I run every morning.',
    includePronunciation: true,
    replyLanguage: 'zh-TW',
    sourceLanguage: 'en',
    aiBreakdownMode: 'context',
    generationId: 'gen-123',
  });

  assert.equal(payload.generationId, 'gen-123');
  assert.equal(payload.targetWord, 'run');
  assert.equal(payload.originalSentence, 'I run every morning.');
  assert.equal(payload.includePronunciation, true);
  assert.equal(payload.replyLanguage, 'zh-TW');
  assert.equal(payload.sourceLanguage, 'en');
  assert.equal(payload.aiBreakdownMode, 'context');
});

test('non-streaming generate_card payload keeps other fields when generationId is absent', () => {
  const payload = buildGenerateCardPayload({
    targetWord: 'run',
    originalSentence: 'I run every morning.',
    includePronunciation: false,
    replyLanguage: 'en',
    sourceLanguage: 'en',
    aiBreakdownMode: 'context',
  });

  assert.equal(payload.generationId, undefined);
  assert.equal(payload.targetWord, 'run');
  assert.equal(payload.includePronunciation, false);
});
