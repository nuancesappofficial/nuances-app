import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isRecognizedTextEditingAvailable,
  resolveRecognizedWordPressAction,
} from './recognizedTextEditMode.ts';

test('recognized-text editing is available in normal builds', () => {
  assert.equal(isRecognizedTextEditingAvailable(), true);
});

test('pressing a recognized word edits it while edit mode is active', () => {
  assert.equal(resolveRecognizedWordPressAction(true), 'edit');
});

test('pressing a recognized word selects it outside edit mode', () => {
  assert.equal(resolveRecognizedWordPressAction(false), 'select');
});
