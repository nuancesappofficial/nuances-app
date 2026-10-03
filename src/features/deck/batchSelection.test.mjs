import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toggleCardSelection,
  selectAllCards,
  deselectAllCards,
  isAllSelected,
  filterCardsAfterBatchDelete,
  calculateAlbumTagsForBatchMove,
} from './batchSelection.ts';

test('toggleCardSelection adds card when not selected', () => {
  const initial = new Set(['card-1']);
  const next = toggleCardSelection(initial, 'card-2');
  assert.equal(next.has('card-1'), true);
  assert.equal(next.has('card-2'), true);
  assert.equal(next.size, 2);
});

test('toggleCardSelection removes card when already selected', () => {
  const initial = new Set(['card-1', 'card-2']);
  const next = toggleCardSelection(initial, 'card-1');
  assert.equal(next.has('card-1'), false);
  assert.equal(next.has('card-2'), true);
  assert.equal(next.size, 1);
});

test('selectAllCards selects all available card IDs', () => {
  const allIds = ['card-1', 'card-2', 'card-3'];
  const next = selectAllCards(allIds);
  assert.equal(next.size, 3);
  assert.equal(next.has('card-1'), true);
  assert.equal(next.has('card-2'), true);
  assert.equal(next.has('card-3'), true);
});

test('deselectAllCards returns empty set', () => {
  const next = deselectAllCards();
  assert.equal(next.size, 0);
});

test('isAllSelected checks if all cards are selected', () => {
  const allIds = ['card-1', 'card-2'];
  assert.equal(isAllSelected(new Set(['card-1']), allIds), false);
  assert.equal(isAllSelected(new Set(['card-1', 'card-2']), allIds), true);
  assert.equal(isAllSelected(new Set(['card-1', 'card-2', 'card-3']), allIds), true);
  assert.equal(isAllSelected(new Set(), []), false);
});

test('filterCardsAfterBatchDelete removes deleted cards', () => {
  const cards = [
    { id: 'c1', targetWord: 'word1' },
    { id: 'c2', targetWord: 'word2' },
    { id: 'c3', targetWord: 'word3' },
  ];
  const remaining = filterCardsAfterBatchDelete(cards, new Set(['c1', 'c3']));
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, 'c2');
});

test('calculateAlbumTagsForBatchMove assigns target album tag and preserves non-album tags', () => {
  const currentTags = ['tag:general', 'album:work'];
  const nextTags = calculateAlbumTagsForBatchMove(currentTags, 'travel', 'work');
  assert.equal(nextTags.includes('tag:general'), true);
  assert.equal(nextTags.includes('album:travel'), true);
  assert.equal(nextTags.includes('album:work'), false);
});
