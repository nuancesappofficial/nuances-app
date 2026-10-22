import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPaywallExitRows, shouldShowPaywallExit } from './paywallExit.ts';

test('the exit screen lists review and Cache as actions and pronunciation as text', () => {
  assert.deepEqual(
    buildPaywallExitRows({ savedCardCount: 20, pronunciationUsed: 8 }),
    [
      { key: 'review', tappable: true, count: 20 },
      { key: 'cache', tappable: true },
      { key: 'pronunciation', tappable: false, remaining: 12 },
    ]
  );
});

test('pronunciation shows no count when usage is unknown and disappears when used up', () => {
  assert.deepEqual(
    buildPaywallExitRows({ savedCardCount: 5, pronunciationUsed: null }),
    [
      { key: 'review', tappable: true, count: 5 },
      { key: 'cache', tappable: true },
      { key: 'pronunciation', tappable: false, remaining: null },
    ]
  );
  assert.deepEqual(
    buildPaywallExitRows({ savedCardCount: 5, pronunciationUsed: 20 }).map(
      (row) => row.key
    ),
    ['review', 'cache']
  );
});

test('the review row is left out when no saved cards are known', () => {
  assert.deepEqual(
    buildPaywallExitRows({ savedCardCount: null, pronunciationUsed: 0 }).map(
      (row) => row.key
    ),
    ['cache', 'pronunciation']
  );
});

test('declining the 21st-card paywall for the first time leads to the exit screen', () => {
  assert.equal(
    shouldShowPaywallExit({ heroKind: 'next', alreadySeen: false }),
    true
  );
});

test('the exit screen is shown once per account', () => {
  assert.equal(
    shouldShowPaywallExit({ heroKind: 'next', alreadySeen: true }),
    false
  );
});

test('closing a paywall the learner opened from settings just closes it', () => {
  assert.equal(
    shouldShowPaywallExit({ heroKind: 'covered', alreadySeen: false }),
    false
  );
  assert.equal(
    shouldShowPaywallExit({ heroKind: 'plan', alreadySeen: false }),
    false
  );
  assert.equal(shouldShowPaywallExit({ heroKind: null, alreadySeen: false }), false);
});
