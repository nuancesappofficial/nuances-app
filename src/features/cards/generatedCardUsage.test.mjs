import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeGeneratedUsagePairs,
  resolveNormalizedPartOfSpeech,
} from './usageValidation.ts';

test('military keeps collocations when usagePairs contains a string example', () => {
  assert.deepEqual(
    normalizeGeneratedUsagePairs(
      {
        usagePairs: [
          {
            phrase: 'military forces',
            translation: '軍隊',
            example: 'Military forces were deployed to the region.',
            exampleTranslation: '軍隊被部署到該地區。',
          },
        ],
      },
      'military'
    ),
    {
      frequentCollocations: [
        { phrase: 'military forces', translation: '軍隊' },
      ],
      example: [
        {
          sentence: 'Military forces were deployed to the region.',
          translation: '軍隊被部署到該地區。',
        },
      ],
    }
  );
});

test('card enrichment rejects an empty validated usage result for normal words on attempts 1-2', () => {
  assert.throws(
    () => normalizeGeneratedUsagePairs({ usagePairs: [] }, 'military'),
    /missing valid collocation and example pairs/i
  );
});

test('proper noun allows empty collocations when a valid example sentence exists via partOfSpeech', () => {
  const result = normalizeGeneratedUsagePairs(
    {
      usagePairs: [
        {
          phrase: '',
          exampleSentence: 'I used to have an Orkut account back in 2008.',
          exampleTranslation: '我以前在 2008 年時曾有個 Orkut 帳號。',
        },
      ],
    },
    'orkut',
    { partOfSpeech: 'proper noun' }
  );

  assert.deepEqual(result, {
    frequentCollocations: [],
    example: [
      {
        sentence: 'I used to have an Orkut account back in 2008.',
        translation: '我以前在 2008 年時曾有個 Orkut 帳號。',
      },
    ],
  });
});

test('proper noun allows empty collocations when recognized via definition even if POS is noun', () => {
  const result = normalizeGeneratedUsagePairs(
    {
      usagePairs: [
        {
          phrase: '',
          exampleSentence: 'I used to have an Orkut account back in 2008.',
          exampleTranslation: '我以前在 2008 年時曾有個 Orkut 帳號。',
        },
      ],
    },
    'orkut',
    { partOfSpeech: 'noun', definition: '已停運的社交網路平台' }
  );

  assert.deepEqual(result, {
    frequentCollocations: [],
    example: [
      {
        sentence: 'I used to have an Orkut account back in 2008.',
        translation: '我以前在 2008 年時曾有個 Orkut 帳號。',
      },
    ],
  });
});

test('normal word allows empty collocations on 3rd retry (allowEmptyCollocations: true) when valid example exists', () => {
  const result = normalizeGeneratedUsagePairs(
    {
      usagePairs: [
        {
          phrase: '',
          exampleSentence: 'The military marched through the capital.',
          exampleTranslation: '軍隊穿過了首都。',
        },
      ],
    },
    'military',
    { partOfSpeech: 'noun', allowEmptyCollocations: true }
  );

  assert.deepEqual(result, {
    frequentCollocations: [],
    example: [
      {
        sentence: 'The military marched through the capital.',
        translation: '軍隊穿過了首都。',
      },
    ],
  });
});

test('rejects when example sentence is missing or does not contain subject even if proper noun or relaxed', () => {
  assert.throws(
    () =>
      normalizeGeneratedUsagePairs(
        {
          usagePairs: [
            {
              phrase: '',
              exampleSentence: 'This sentence does not contain the word.',
            },
          ],
        },
        'orkut',
        { partOfSpeech: 'proper noun' }
      ),
    /missing valid example/i
  );

  assert.throws(
    () =>
      normalizeGeneratedUsagePairs(
        {
          usagePairs: [],
        },
        'military',
        { allowEmptyCollocations: true }
      ),
    /missing valid example/i
  );
});

test('resolveNormalizedPartOfSpeech normalizes proper nouns from definition even when POS is noun', () => {
  assert.equal(
    resolveNormalizedPartOfSpeech('noun', '已停運的社交網路平台'),
    'proper noun'
  );
  assert.equal(
    resolveNormalizedPartOfSpeech('noun', 'A defunct social networking service'),
    'proper noun'
  );
  assert.equal(
    resolveNormalizedPartOfSpeech('noun', '蘋果，一種常見的水果'),
    'noun'
  );
  assert.equal(
    resolveNormalizedPartOfSpeech('verb', '跑步'),
    'verb'
  );
});

