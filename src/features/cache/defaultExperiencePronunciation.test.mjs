import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_EXPERIENCE_PHONETIC_TRANSCRIPTION,
  resolvePronunciationAudioSource,
  shouldUseDefaultExperiencePronunciation,
} from './defaultExperiencePronunciation.ts';

test('tutorial nuances card ships its phonetic transcription in the fixture', () => {
  assert.equal(DEFAULT_EXPERIENCE_PHONETIC_TRANSCRIPTION, '/ˈnuː.ɑːn.sɪz/');
});

test('tutorial nuances card detail uses the bundled reference TTS', () => {
  assert.equal(
    shouldUseDefaultExperiencePronunciation({
      sourceApp: 'Nuances',
      targetWord: 'nuances',
      originalSentence: 'The smallest nuances can make the biggest differences.',
    }),
    true
  );
});

test('tutorial nuances quiz uses the bundled reference TTS even without a route flag', () => {
  assert.equal(
    shouldUseDefaultExperiencePronunciation({
      questionId: 'default-experience-demo:pronunciation',
      targetWord: 'nuances',
    }),
    true
  );
});

test('ordinary cards do not use the tutorial reference TTS', () => {
  assert.equal(
    shouldUseDefaultExperiencePronunciation({
      sourceApp: 'Safari',
      targetWord: 'nuances',
      originalSentence: 'She noticed subtle nuances in his reply.',
    }),
    false
  );
});

test('card detail carousel resolves the persisted nuances demo card to bundled natural audio', () => {
  assert.equal(
    resolvePronunciationAudioSource({
      targetWord: 'nuances',
      sourceApp: 'Nuances',
      originalSentence:
        'The smallest nuances can make the biggest differences.',
    }),
    'bundled-default-experience'
  );
});

test('quiz pronunciation resolves its source demo card to bundled natural audio', () => {
  assert.equal(
    resolvePronunciationAudioSource({
      targetWord: 'nuances',
      sourceCard: {
        targetWord: 'nuances',
        sourceApp: 'Nuances',
        originalSentence:
          'The smallest nuances can make the biggest differences.',
      },
    }),
    'bundled-default-experience'
  );
});

test('ordinary card pronunciation continues through the standard natural TTS path', () => {
  assert.equal(
    resolvePronunciationAudioSource({
      targetWord: 'nuances',
      sourceCard: {
        targetWord: 'nuances',
        sourceApp: 'Safari',
        originalSentence: 'She noticed subtle nuances in his reply.',
      },
    }),
    'standard-natural-tts'
  );
});
