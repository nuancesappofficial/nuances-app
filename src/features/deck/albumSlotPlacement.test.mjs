import assert from 'node:assert/strict';
import test from 'node:test';

import { placeNewAlbumInSlotOrder } from './albumSlotPlacement.ts';

const EMPTY_1 = '__nuances_empty_album_slot__:1';
const EMPTY_2 = '__nuances_empty_album_slot__:2';
const EMPTY_3 = '__nuances_empty_album_slot__:3';

test('places new album into the first empty slot immediately following the last album', () => {
  const currentOrder = ['all', 'favorites', 'slang', EMPTY_1, EMPTY_2, EMPTY_3];
  const newAlbumId = 'custom-work';

  const result = placeNewAlbumInSlotOrder(currentOrder, newAlbumId);

  assert.deepEqual(result, [
    'all',
    'favorites',
    'slang',
    'custom-work',
    EMPTY_2,
    EMPTY_3,
  ]);
});

test('places new album into trailing empty slot even if there is an empty hole before the last album', () => {
  const currentOrder = ['all', EMPTY_1, 'favorites', EMPTY_2, EMPTY_3];
  const newAlbumId = 'custom-work';

  const result = placeNewAlbumInSlotOrder(currentOrder, newAlbumId);

  assert.deepEqual(result, [
    'all',
    EMPTY_1,
    'favorites',
    'custom-work',
    EMPTY_3,
  ]);
});

test('appends to the end when no empty slots exist in current order', () => {
  const currentOrder = ['all', 'favorites', 'slang', 'a1', 'a2', 'a3'];
  const newAlbumId = 'a4';

  const result = placeNewAlbumInSlotOrder(currentOrder, newAlbumId);

  assert.deepEqual(result, [
    'all',
    'favorites',
    'slang',
    'a1',
    'a2',
    'a3',
    'a4',
  ]);
});

test('returns [newAlbumId] when current order is empty', () => {
  const result = placeNewAlbumInSlotOrder([], 'first-album');
  assert.deepEqual(result, ['first-album']);
});
