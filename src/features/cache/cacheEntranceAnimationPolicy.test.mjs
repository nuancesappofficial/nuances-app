import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCacheCardTransition } from './cacheEntranceAnimationPolicy.ts';

test('single shared card input triggers entrance animation properly', () => {
  const initialState = {
    visibleCardIds: ['card_default'],
    enteringCardIds: [],
    lastSeenCardIds: ['card_default'],
    pendingBatchEnterIds: [],
    hasSeenCacheOnce: true,
    animationSeed: 1,
    restoreSeed: 0,
  };

  const currentIds = ['card_default', 'card_share_1'];

  const result = resolveCacheCardTransition({
    currentIds,
    state: initialState,
    isCacheFocused: true,
    showAddModal: false,
  });

  assert.equal(result.transitionType, 'new_cards_enter');
  assert.deepEqual(result.nextEnteringCardIds, ['card_share_1']);
  assert.deepEqual(result.nextVisibleCardIds, ['card_default', 'card_share_1']);
  assert.equal(result.nextAnimationSeed, 2);
});

test('several shared inputs arriving while animation is active MUST NOT swallow cards and skip animation', () => {
  // Scenario: Card 1 arrived and is currently playing its entrance drop animation
  const animatingState = {
    visibleCardIds: ['card_default', 'card_share_1'],
    enteringCardIds: ['card_share_1'],
    lastSeenCardIds: ['card_default', 'card_share_1'],
    pendingBatchEnterIds: [],
    hasSeenCacheOnce: true,
    animationSeed: 2,
    restoreSeed: 0,
  };

  // While card_share_1 is entering, card_share_2 and card_share_3 arrive from share sheet
  const currentIdsWithSeveralInputs = [
    'card_default',
    'card_share_1',
    'card_share_2',
    'card_share_3',
  ];

  const step1 = resolveCacheCardTransition({
    currentIds: currentIdsWithSeveralInputs,
    state: animatingState,
    isCacheFocused: true,
    showAddModal: false,
  });

  // Bug symptom check:
  // In the buggy implementation, card_share_2 and card_share_3 are swallowed into lastSeenCardIds
  // and NOT included in nextEnteringCardIds, leaving them with no entrance animation.
  // We assert that the incoming cards MUST be queued or included for entrance animation:
  assert.notEqual(
    step1.transitionType,
    'noop',
    'Should not drop subsequent shared inputs as no-op'
  );
  assert.ok(
    step1.nextEnteringCardIds.includes('card_share_2'),
    'card_share_2 must be marked for entrance animation'
  );
  assert.ok(
    step1.nextEnteringCardIds.includes('card_share_3'),
    'card_share_3 must be marked for entrance animation'
  );
  assert.deepEqual(
    step1.nextVisibleCardIds,
    currentIdsWithSeveralInputs,
    'All shared cards must be visible in stack'
  );
});

test('batch of multiple shared inputs arriving at once all enter together', () => {
  const steadyState = {
    visibleCardIds: ['card_default'],
    enteringCardIds: [],
    lastSeenCardIds: ['card_default'],
    pendingBatchEnterIds: [],
    hasSeenCacheOnce: true,
    animationSeed: 1,
    restoreSeed: 0,
  };

  const currentIdsWithThreeShares = [
    'card_default',
    'card_share_1',
    'card_share_2',
    'card_share_3',
  ];

  const result = resolveCacheCardTransition({
    currentIds: currentIdsWithThreeShares,
    state: steadyState,
    isCacheFocused: true,
    showAddModal: false,
  });

  assert.equal(result.transitionType, 'new_cards_enter');
  assert.deepEqual(result.nextEnteringCardIds, [
    'card_share_1',
    'card_share_2',
    'card_share_3',
  ]);
  assert.deepEqual(result.nextVisibleCardIds, currentIdsWithThreeShares);
  assert.equal(result.nextAnimationSeed, 2);
});

test('background OCR updates without ID changes must be a no-op that never resets or interrupts animation', () => {
  const activeEnteringState = {
    visibleCardIds: ['card_default', 'card_share_1', 'card_share_2'],
    enteringCardIds: ['card_share_1', 'card_share_2'],
    lastSeenCardIds: ['card_default', 'card_share_1', 'card_share_2'],
    pendingBatchEnterIds: [],
    hasSeenCacheOnce: true,
    animationSeed: 2,
    restoreSeed: 0,
  };

  // OCR finished for card_share_1 or card_share_2, so cards re-renders with the SAME IDs
  const sameIdsAfterOcr = ['card_default', 'card_share_1', 'card_share_2'];

  const result = resolveCacheCardTransition({
    currentIds: sameIdsAfterOcr,
    state: activeEnteringState,
    isCacheFocused: true,
    showAddModal: false,
  });

  assert.equal(result.transitionType, 'noop', 'OCR update must not trigger any transition');
  assert.deepEqual(result.nextEnteringCardIds, ['card_share_1', 'card_share_2']);
  assert.equal(result.nextRestoreSeed, 0, 'Restore seed must not increment during active drop');
  assert.equal(result.nextAnimationSeed, 2, 'Animation seed must not increment on OCR update');
});

test('steady state with existing cards must return noop and never increment restoreSeed indefinitely', () => {
  let state = {
    visibleCardIds: ['card-1', 'card-2'],
    enteringCardIds: [],
    lastSeenCardIds: ['card-1', 'card-2'],
    pendingBatchEnterIds: [],
    hasSeenCacheOnce: true,
    animationSeed: 1,
    restoreSeed: 0,
  };
  const currentIds = ['card-1', 'card-2'];

  for (let i = 0; i < 10; i++) {
    const res = resolveCacheCardTransition({
      currentIds,
      state,
      isCacheFocused: true,
      showAddModal: false,
    });
    assert.equal(res.transitionType, 'noop', `Iteration ${i} must be noop in steady state`);
    assert.equal(res.nextRestoreSeed, 0, 'Restore seed must remain unchanged in steady state');
    state = {
      ...state,
      restoreSeed: res.nextRestoreSeed,
      visibleCardIds: res.nextVisibleCardIds,
      lastSeenCardIds: res.nextLastSeenCardIds,
    };
  }
});

test('swiping a card away increments restoreSeed once and immediately settles at noop', () => {
  let state = {
    visibleCardIds: ['card-1', 'card-2'],
    enteringCardIds: [],
    lastSeenCardIds: ['card-1', 'card-2'],
    pendingBatchEnterIds: [],
    hasSeenCacheOnce: true,
    animationSeed: 1,
    restoreSeed: 0,
  };
  // card-2 was swiped away and deleted from DB:
  const currentIdsAfterSwipe = ['card-1'];

  // 1st run: should recognize card removal and restore
  const step1 = resolveCacheCardTransition({
    currentIds: currentIdsAfterSwipe,
    state,
    isCacheFocused: true,
    showAddModal: false,
  });
  assert.equal(step1.transitionType, 'restore', 'Must trigger restore after card swipe');
  assert.equal(step1.nextRestoreSeed, 1, 'Must increment restoreSeed by 1');
  assert.deepEqual(step1.nextVisibleCardIds, ['card-1']);

  // Apply state update as React component does:
  state = {
    ...state,
    restoreSeed: step1.nextRestoreSeed,
    visibleCardIds: step1.nextVisibleCardIds,
    lastSeenCardIds: step1.nextLastSeenCardIds,
  };

  // 2nd run: steady state after restore applied, MUST be noop
  const step2 = resolveCacheCardTransition({
    currentIds: currentIdsAfterSwipe,
    state,
    isCacheFocused: true,
    showAddModal: false,
  });
  assert.equal(step2.transitionType, 'noop', 'Subsequent render must be noop and settle');
  assert.equal(step2.nextRestoreSeed, 1, 'Restore seed must not increment again');
});

