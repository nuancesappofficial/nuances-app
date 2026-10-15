import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldTriggerCardSwipe } from './cacheSwipeTriggerPolicy.ts';

test('triggers swipe when top card matches trigger itemId and sequence is new', () => {
  const result = shouldTriggerCardSwipe({
    isTopCard: true,
    cardItemId: 'card-1',
    swipeTrigger: { seq: 1, itemId: 'card-1', direction: 'right' },
    lastSwipeTriggerSeq: null,
  });
  assert.equal(result, true);
});

test('does NOT trigger swipe when not top card', () => {
  const result = shouldTriggerCardSwipe({
    isTopCard: false,
    cardItemId: 'card-1',
    swipeTrigger: { seq: 1, itemId: 'card-1', direction: 'right' },
    lastSwipeTriggerSeq: null,
  });
  assert.equal(result, false);
});

test('does NOT trigger swipe when trigger is null', () => {
  const result = shouldTriggerCardSwipe({
    isTopCard: true,
    cardItemId: 'card-1',
    swipeTrigger: null,
    lastSwipeTriggerSeq: null,
  });
  assert.equal(result, false);
});

test('does NOT trigger swipe when trigger belongs to a different card', () => {
  const result = shouldTriggerCardSwipe({
    isTopCard: true,
    cardItemId: 'card-2',
    swipeTrigger: { seq: 1, itemId: 'card-1', direction: 'right' },
    lastSwipeTriggerSeq: null,
  });
  assert.equal(result, false);
});

test('does NOT trigger swipe when sequence was already processed (prevents phantom auto-swipe)', () => {
  const result = shouldTriggerCardSwipe({
    isTopCard: true,
    cardItemId: 'card-1',
    swipeTrigger: { seq: 1, itemId: 'card-1', direction: 'right' },
    lastSwipeTriggerSeq: 1,
  });
  assert.equal(result, false);
});
