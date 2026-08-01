import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeGeneratedUsagePairs } from './usageValidation.ts';

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

test('card enrichment rejects an empty validated usage result', () => {
  assert.throws(
    () => normalizeGeneratedUsagePairs({ usagePairs: [] }, 'military'),
    /missing valid collocation and example pairs/i
  );
});
