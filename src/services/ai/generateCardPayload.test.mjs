import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGenerateCardPayload,
  buildGenerateCardStreamPayload,
} from './generateCardPayload.ts';

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

// 守則 A：Path A（非串流）與 Path B（串流）都必須包含 generationId 冪等鍵，
// 且兩條路徑共用同一個底層 builder，欄位組裝一致。
test('streaming generate_card payload always includes the generationId (Rule A)', () => {
  const payload = buildGenerateCardStreamPayload({
    targetWord: 'run',
    originalSentence: 'I run every morning.',
    includePronunciation: true,
    replyLanguage: 'zh-TW',
    sourceLanguage: 'en',
    aiBreakdownMode: 'context',
    generationId: 'gen-stream-123',
  });

  assert.equal(payload.generationId, 'gen-stream-123');
  assert.equal(payload.targetWord, 'run');
  assert.equal(payload.originalSentence, 'I run every morning.');
  assert.equal(payload.includePronunciation, true);
  assert.equal(payload.replyLanguage, 'zh-TW');
  assert.equal(payload.sourceLanguage, 'en');
  assert.equal(payload.aiBreakdownMode, 'context');
});

test('streaming and non-streaming builders share the same field assembly (Rule A)', () => {
  const common = {
    targetWord: 'run',
    originalSentence: 'I run every morning.',
    includePronunciation: true,
    replyLanguage: 'zh-TW',
    sourceLanguage: 'en',
    aiBreakdownMode: 'context',
  };
  const nonStreaming = buildGenerateCardPayload({
    ...common,
    generationId: 'gen-a',
  });
  const streaming = buildGenerateCardStreamPayload({
    ...common,
    generationId: 'gen-b',
  });

  // 兩條路徑的共用欄位必須一致，只有 generationId 不同。
  const sharedFields = [
    'targetWord',
    'originalSentence',
    'includePronunciation',
    'replyLanguage',
    'sourceLanguage',
    'aiBreakdownMode',
  ];
  for (const key of sharedFields) {
    assert.equal(streaming[key], nonStreaming[key], `field ${key} must match`);
  }
  assert.equal(nonStreaming.generationId, 'gen-a');
  assert.equal(streaming.generationId, 'gen-b');
});
