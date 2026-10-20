import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ENGLISH_PROPER_NOUNS_FRONT_CODED,
  ENGLISH_WORDS_FRONT_CODED,
} from './englishWords.generated.ts';
import {
  decodeEnglishLexicon,
  decodeEnglishLexiconAsync,
  restoreOCRSpacing,
  restoreRunTogetherCardTarget,
  splitRunTogetherWord,
} from './ocrSpacing.ts';
import { normalizeOCRText } from '../../services/ocr/ocrTextNormalization.ts';

const lexicon = decodeEnglishLexicon(
  ENGLISH_WORDS_FRONT_CODED,
  ENGLISH_PROPER_NOUNS_FRONT_CODED
);

test('restores the space OCR dropped after "a" (the anatural bug)', () => {
  assert.equal(
    restoreOCRSpacing('I thought you were anatural.', lexicon),
    'I thought you were a natural.'
  );
});

test('splits run-together function words and picks the natural split', () => {
  const cases = {
    ofthe: 'of the',
    inthe: 'in the',
    itwas: 'it was',
    forthe: 'for the',
    isnot: 'is not',
    youwere: 'you were',
    iwasthere: 'I was there',
  };
  for (const [token, expected] of Object.entries(cases)) {
    assert.equal(splitRunTogetherWord(token, lexicon)?.join(' '), expected, token);
  }
});

test('never splits real words, names, brands or new slang', () => {
  const untouched = [
    'notable', 'therapist', 'another', 'together', 'natural',
    'rizz', 'delulu', 'skibidi', 'yeet', 'goated', 'staycation',
    'chillin', 'trippin', 'bussin',
    'youtube', 'facebook', 'adidas', 'onboarding', 'upskill',
  ];
  for (const word of untouched) {
    assert.equal(splitRunTogetherWord(word, lexicon), null, word);
  }
  const text = 'Zendaya and Ariana slay. NASA rizz www.anatural.com #anatural @anatural';
  assert.equal(restoreOCRSpacing(text, lexicon), text);
});

test('capitalized tokens are only split with OCR candidate evidence', () => {
  assert.equal(restoreOCRSpacing('Anatural talent.', lexicon), 'Anatural talent.');
  assert.equal(
    restoreOCRSpacing('Anatural talent.', lexicon, ['A natural talent.']),
    'A natural talent.'
  );
});

test('a spaced reading from OCR candidates wins over the dictionary', () => {
  assert.equal(
    restoreOCRSpacing('It was agreatidea', lexicon),
    'It was agreatidea'
  );
  assert.equal(
    restoreOCRSpacing('It was agreatidea', lexicon, ['It was a great idea']),
    'It was a great idea'
  );
});

test('keeps the existing contraction repair working after spacing restore', () => {
  assert.equal(
    normalizeOCRText(restoreOCRSpacing('you renuts.', lexicon)),
    "you're nuts."
  );
});

test('server safety net turns an OCR run-together target into the real word', () => {
  assert.deepEqual(
    restoreRunTogetherCardTarget('anatural', 'I thought you were anatural.', lexicon),
    { targetWord: 'natural', sentence: 'I thought you were a natural.' }
  );
  assert.equal(
    restoreRunTogetherCardTarget('natural', 'I thought you were a natural.', lexicon),
    null
  );
  assert.equal(restoreRunTogetherCardTarget('rizz', 'He has rizz.', lexicon), null);
});

test('async decode yields the same lexicon', async () => {
  const asyncLexicon = await decodeEnglishLexiconAsync(
    ENGLISH_WORDS_FRONT_CODED,
    ENGLISH_PROPER_NOUNS_FRONT_CODED,
    { yieldToEventLoop: () => Promise.resolve() }
  );
  assert.equal(asyncLexicon.known.size, lexicon.known.size);
  assert.equal(asyncLexicon.pieces.size, lexicon.pieces.size);
});

test('ai-proxy copies are identical to the app copies', () => {
  for (const file of ['ocrSpacing.ts', 'englishWords.generated.ts']) {
    const app = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    const server = readFileSync(
      new URL(
        `../../../supabase/functions/ai-proxy/_shared/ocrSpacing/${file}`,
        import.meta.url
      ),
      'utf8'
    );
    assert.equal(server, app, `${file} drifted; copy src/features/ocrSpacing/${file} over`);
  }
});
