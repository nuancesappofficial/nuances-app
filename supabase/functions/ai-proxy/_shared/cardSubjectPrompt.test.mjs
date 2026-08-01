import assert from 'node:assert/strict';
import test from 'node:test';

import { CARD_SUBJECT_SELECTION_INSTRUCTION } from './cardSubjectPrompt.ts';

test('card subject prompt keeps an independently meaningful noun as the subject', () => {
  assert.match(CARD_SUBJECT_SELECTION_INSTRUCTION, /script.*noun/i);
  assert.match(
    CARD_SUBJECT_SELECTION_INSTRUCTION,
    /stick to the script.*go off script.*collocations/is
  );
});

test('card subject prompt promotes inseparable meanings to canonical phrases', () => {
  assert.match(
    CARD_SUBJECT_SELECTION_INSTRUCTION,
    /let you down.*let someone down.*phrasal verb/is
  );
  assert.match(
    CARD_SUBJECT_SELECTION_INSTRUCTION,
    /lead you on.*lead someone on.*phrasal verb/is
  );
});

test('card subject prompt states the semantic-unit decision rule', () => {
  assert.match(
    CARD_SUBJECT_SELECTION_INSTRUCTION,
    /lemma.*preserves the meaning.*only if the lemma does not preserve the meaning.*complete established expression/is
  );
});

test('card subject prompt separates the source phrase from its reusable subject', () => {
  assert.match(
    CARD_SUBJECT_SELECTION_INSTRUCTION,
    /detectedPhrase.*exact surface form.*canonicalSubject.*reusable generalized form/is
  );
});

test('card subject prompt requires localization before word-versus-phrase resolution', () => {
  assert.match(
    CARD_SUBJECT_SELECTION_INSTRUCTION,
    /localize.*whole source sentence.*target.*corresponding meaning/is
  );
  assert.match(
    CARD_SUBJECT_SELECTION_INSTRUCTION,
    /lemma.*preserves.*meaning.*only if.*does not/is
  );
});
