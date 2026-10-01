import assert from 'node:assert/strict';
import test from 'node:test';

import { applyDeckAlbumAppearanceUpdate } from './albumAppearanceSettings.ts';

const BASE_PREFS = {
  customAlbums: [],
  albumNameOverrides: {},
  albumEmojiOverrides: {},
  albumColorOverrides: {},
  albumCoverOverrides: {},
  deletedAlbumIds: [],
};

test('updates custom album name, emoji, color and cover image', () => {
  const customAlbum = {
    id: 'custom-123',
    name: 'Old Name',
    emoji: '📁',
    color: '#1E293B',
    isDefault: false,
    cardCount: 5,
  };

  const prefs = {
    ...BASE_PREFS,
    customAlbums: [customAlbum],
  };

  const update = {
    name: 'New Custom Album',
    emoji: '✨',
    color: '#E45757',
    coverImageUri: 'file:///data/cover.jpg',
  };

  const { nextPrefs, updatedAlbum } = applyDeckAlbumAppearanceUpdate(
    customAlbum,
    prefs,
    update,
    'Old Name'
  );

  assert.equal(updatedAlbum.name, 'New Custom Album');
  assert.equal(updatedAlbum.emoji, '✨');
  assert.equal(updatedAlbum.color, '#E45757');
  assert.equal(updatedAlbum.coverImageUri, 'file:///data/cover.jpg');
  assert.equal(updatedAlbum.isNameCustomized, true);

  assert.equal(nextPrefs.customAlbums.length, 1);
  assert.deepEqual(nextPrefs.customAlbums[0], updatedAlbum);
});

test('overrides system album name, emoji, color and cover image', () => {
  const defaultAlbum = {
    id: 'favorites',
    name: 'My Favorites',
    emoji: '❤️',
    color: '#D86A8A',
    isDefault: true,
    cardCount: 10,
  };

  const update = {
    name: 'Top Picks',
    emoji: '⭐',
    color: '#E8C24A',
    coverImageUri: 'file:///data/star.jpg',
  };

  const { nextPrefs, updatedAlbum } = applyDeckAlbumAppearanceUpdate(
    defaultAlbum,
    BASE_PREFS,
    update,
    'My Favorites'
  );

  assert.equal(updatedAlbum.name, 'Top Picks');
  assert.equal(updatedAlbum.isNameCustomized, true);
  assert.equal(nextPrefs.albumNameOverrides['favorites'], 'Top Picks');
  assert.equal(nextPrefs.albumEmojiOverrides['favorites'], '⭐');
  assert.equal(nextPrefs.albumColorOverrides['favorites'], '#E8C24A');
  assert.equal(nextPrefs.albumCoverOverrides['favorites'], 'file:///data/star.jpg');
});

test('resets system album name override if user re-enters localized default name', () => {
  const defaultAlbum = {
    id: 'all',
    name: 'Custom All Cards',
    emoji: '✨',
    color: '#4EAFF4',
    isDefault: true,
    isNameCustomized: true,
    cardCount: 20,
  };

  const prefsWithOverride = {
    ...BASE_PREFS,
    albumNameOverrides: { all: 'Custom All Cards' },
    albumEmojiOverrides: { all: '✨' },
  };

  const update = {
    name: 'All cards', // Default localized name for 'all'
    emoji: '📁',
    color: '#1E293B',
  };

  const { nextPrefs, updatedAlbum } = applyDeckAlbumAppearanceUpdate(
    defaultAlbum,
    prefsWithOverride,
    update,
    'All cards'
  );

  assert.equal(updatedAlbum.name, 'All cards');
  assert.equal(updatedAlbum.isNameCustomized, false);
  assert.equal(nextPrefs.albumNameOverrides['all'], undefined);
  assert.equal(nextPrefs.albumEmojiOverrides['all'], '📁');
});
