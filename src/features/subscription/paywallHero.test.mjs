import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeDevStarterUsage,
  resolvePaywallEntry,
  resolvePaywallHero,
} from './paywallHero.ts';

test('dev link usage overrides the fetched starter usage field by field', () => {
  const fetched = { cardsUsed: 3, pronunciationUsed: 5 };
  assert.deepEqual(mergeDevStarterUsage(fetched, undefined), fetched);
  assert.deepEqual(mergeDevStarterUsage(fetched, { cardsUsed: 20 }), {
    cardsUsed: 20,
    pronunciationUsed: 5,
  });
  assert.deepEqual(
    mergeDevStarterUsage(null, { cardsUsed: 12, pronunciationUsed: 8 }),
    { cardsUsed: 12, pronunciationUsed: 8 }
  );
  assert.equal(mergeDevStarterUsage(null, { cardsUsed: 20 }), null);
  assert.equal(mergeDevStarterUsage(null, undefined), null);
});

test('a paywall the learner opened themself is a settings entry; any cap is a limit entry', () => {
  assert.equal(resolvePaywallEntry('user_initiated'), 'settings');
  assert.equal(resolvePaywallEntry('lite_card_cap'), 'limit');
  assert.equal(resolvePaywallEntry('free_pronunciation_cap'), 'limit');
  assert.equal(resolvePaywallEntry('lite_pronunciation_cap'), 'limit');
});

test('a freemium learner partway through the starter allowance sees the covered 21st card with progress', () => {
  assert.deepEqual(
    resolvePaywallHero({
      planType: 'free',
      starterUsage: { cardsUsed: 12, pronunciationUsed: 8 },
    }),
    {
      kind: 'covered',
      usage: {
        cardsUsed: 12,
        pronunciationUsed: 8,
        limit: 20,
        cardsLeft: 8,
        progress: 0.6,
      },
    }
  );
});

test('a freemium learner whose usage is still loading or failed sees the covered card without numbers', () => {
  assert.deepEqual(resolvePaywallHero({ planType: 'free', starterUsage: null }), {
    kind: 'covered',
    usage: null,
  });
});

test('a freemium learner who used the whole allowance sees a full bar and nothing left', () => {
  assert.deepEqual(
    resolvePaywallHero({
      planType: 'free',
      starterUsage: { cardsUsed: 23, pronunciationUsed: -1 },
    }),
    {
      kind: 'covered',
      usage: {
        cardsUsed: 20,
        pronunciationUsed: 0,
        limit: 20,
        cardsLeft: 0,
        progress: 1,
      },
    }
  );
});

test('paying learners see their plan instead of the starter allowance', () => {
  const usage = { cardsUsed: 20, pronunciationUsed: 20 };
  assert.deepEqual(resolvePaywallHero({ planType: 'lite', starterUsage: usage }), {
    kind: 'plan',
    tier: 'lite',
  });
  assert.deepEqual(resolvePaywallHero({ planType: 'premium', starterUsage: null }), {
    kind: 'plan',
    tier: 'pro',
  });
  assert.deepEqual(resolvePaywallHero({ planType: 'trial', starterUsage: null }), {
    kind: 'plan',
    tier: 'pro',
  });
});
