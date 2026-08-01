import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimUnsavedCards,
  getOptimisticCardIdentity,
} from './optimisticCardSave.ts';

const firstCard = {
  displayWord: 'nuance',
  sourceSentence: 'That nuance changes the meaning.',
};
const secondCard = {
  displayWord: 'context',
  sourceSentence: 'Context makes the nuance clear.',
};

test('a completed card is claimed for optimistic save exactly once', () => {
  const claimed = new Set();
  const firstClaim = claimUnsavedCards([firstCard], claimed);
  const repeatedClaim = claimUnsavedCards([firstCard], claimed);

  assert.deepEqual(firstClaim, [firstCard]);
  assert.deepEqual(repeatedClaim, []);
  assert.deepEqual([...claimed], [getOptimisticCardIdentity(firstCard)]);
});

test('the next completed card in a multi-card run is independently claimed', () => {
  const claimed = new Set([getOptimisticCardIdentity(firstCard)]);

  assert.deepEqual(claimUnsavedCards([firstCard, secondCard], claimed), [
    secondCard,
  ]);
});
