import assert from 'node:assert/strict';
import test from 'node:test';

import {
  placeNewAlbumInSlotOrder,
  resolveAlbumSlotOrder,
} from './albumSlotPlacement.ts';

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

test('places new album at the end when fallback default albums are provided', () => {
  const defaultAlbums = ['all-cards', 'favorites', 'slang'];
  const newAlbumId = 'japanese-vocab';
  const result = placeNewAlbumInSlotOrder(defaultAlbums, newAlbumId);
  assert.deepEqual(result, ['all-cards', 'favorites', 'slang', 'japanese-vocab']);
});


test('albums missing from the order fill the empty slots on the current page instead of opening a new page', () => {
  const storedOrder = ['all', 'favorites', 'slang', EMPTY_1, EMPTY_2, EMPTY_3];
  const albumIds = ['all', 'favorites', 'slang', 'created-from-card'];

  const result = resolveAlbumSlotOrder(storedOrder, albumIds);

  assert.deepEqual(result, [
    'all',
    'favorites',
    'slang',
    'created-from-card',
    EMPTY_2,
    EMPTY_3,
  ]);
});

test('drops deleted and repeated album ids so they do not hold a slot', () => {
  const storedOrder = ['all', 'deleted-album', 'favorites', 'all', EMPTY_1];
  const albumIds = ['all', 'favorites', 'new-album'];

  const result = resolveAlbumSlotOrder(storedOrder, albumIds);

  assert.deepEqual(result, ['all', 'favorites', 'new-album']);
});

test('lays out albums in their given order when nothing is stored yet', () => {
  const result = resolveAlbumSlotOrder([], ['all', 'favorites', 'slang']);
  assert.deepEqual(result, ['all', 'favorites', 'slang']);
});
