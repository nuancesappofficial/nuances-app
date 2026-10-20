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

test('custom album edit clears stale name/emoji/color overrides so they cannot shadow the new values', () => {
  const customAlbum = {
    id: 'custom-9',
    name: 'Trip',
    emoji: '📁',
    color: '#1E293B',
    cardIds: [],
    wordCount: 0,
    latestCards: [],
  };
  const prefs = {
    ...BASE_PREFS,
    customAlbums: [customAlbum],
    // Stale overrides left behind by an earlier save that took the system-album path.
    albumNameOverrides: { 'custom-9': 'Old trip' },
    albumEmojiOverrides: { 'custom-9': '🧳' },
    albumColorOverrides: { 'custom-9': '#000000' },
    albumCoverOverrides: { 'custom-9': 'file:///old.jpg' },
  };

  const { nextPrefs } = applyDeckAlbumAppearanceUpdate(
    customAlbum,
    prefs,
    { name: 'Trip', emoji: '✨', color: '#E45757', coverImageUri: 'file:///new.jpg' },
    'Trip'
  );

  assert.equal(nextPrefs.albumNameOverrides['custom-9'], undefined);
  assert.equal(nextPrefs.albumEmojiOverrides['custom-9'], undefined);
  assert.equal(nextPrefs.albumColorOverrides['custom-9'], undefined);
  assert.equal(nextPrefs.albumCoverOverrides['custom-9'], undefined);
  assert.equal(nextPrefs.customAlbums[0].emoji, '✨');
  assert.equal(nextPrefs.customAlbums[0].coverImageUri, 'file:///new.jpg');
});

test('foldCustomAlbumOverrides moves leftover overrides into the custom album and removes them', async () => {
  const { foldCustomAlbumOverrides } = await import('./albumAppearanceSettings.ts');
  const prefs = {
    ...BASE_PREFS,
    customAlbums: [{ id: 'custom-9', name: 'Trip', emoji: '📁', color: '#1E293B' }],
    albumNameOverrides: { 'custom-9': 'Japan', slang: 'Memes' },
    albumEmojiOverrides: { 'custom-9': '🗾', favorites: '💛' },
    albumColorOverrides: { 'custom-9': '#E45757' },
    albumCoverOverrides: { 'custom-9': 'file:///cover.jpg' },
  };

  const { prefs: next, changed } = foldCustomAlbumOverrides(prefs);

  assert.equal(changed, true);
  assert.deepEqual(next.customAlbums[0], {
    id: 'custom-9',
    name: 'Japan',
    emoji: '🗾',
    color: '#E45757',
    coverImageUri: 'file:///cover.jpg',
    isNameCustomized: true,
  });
  // System album overrides are untouched.
  assert.deepEqual(next.albumNameOverrides, { slang: 'Memes' });
  assert.deepEqual(next.albumEmojiOverrides, { favorites: '💛' });
  assert.deepEqual(next.albumColorOverrides, {});
  assert.deepEqual(next.albumCoverOverrides, {});

  const again = foldCustomAlbumOverrides(next);
  assert.equal(again.changed, false);
});
