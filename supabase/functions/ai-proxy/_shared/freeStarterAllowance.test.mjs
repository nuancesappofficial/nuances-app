import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FREE_STARTER_CARD_LIMIT,
  getFreeStarterActionDecision,
} from './freeStarterAllowance.ts';

test('a free user can reserve the first 20 card generations', () => {
  assert.equal(FREE_STARTER_CARD_LIMIT, 20);
  assert.equal(
    getFreeStarterActionDecision({
      planType: 'free',
      action: 'generate_card_core_stream',
      successfulOrProcessingCards: 19,
      generationAlreadyReserved: false,
    }),
    'reserve'
  );
});

test('the 21st card generation is paywalled', () => {
  assert.equal(
    getFreeStarterActionDecision({
      planType: 'free',
      action: 'generate_card_core_stream',
      successfulOrProcessingCards: 20,
      generationAlreadyReserved: false,
    }),
    'paywall'
  );
});

test('enrichment and retries reuse the same reservation without another charge', () => {
  assert.equal(
    getFreeStarterActionDecision({
      planType: 'free',
      action: 'generate_card_enrichment_stream',
      successfulOrProcessingCards: 20,
      generationAlreadyReserved: true,
    }),
    'reuse'
  );
});

test('premium users bypass starter allowance accounting', () => {
  assert.equal(
    getFreeStarterActionDecision({
      planType: 'premium',
      action: 'generate_card_core_stream',
      successfulOrProcessingCards: 20,
      generationAlreadyReserved: false,
    }),
    'allow'
  );
});
