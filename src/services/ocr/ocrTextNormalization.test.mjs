import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeOCRText } from './ocrTextNormalization.ts';

test('repairs an apostrophe lost inside a fused contraction', () => {
  assert.equal(normalizeOCRText('you renuts.'), "you're nuts.");
});

test('repairs common compact contractions without changing punctuation', () => {
  assert.equal(normalizeOCRText("I dont think theyre ready!"), "I don't think they're ready!");
});

test('leaves ordinary words unchanged', () => {
  assert.equal(normalizeOCRText('The important lesson.'), 'The important lesson.');
});
