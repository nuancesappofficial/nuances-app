import type { DeckAlbum } from '../../components/UI/DeckScreenUI/deckTypes';
import type { DeckAlbumPreferences } from './albums';

export type AlbumAppearanceUpdateInput = {
  name: string;
  emoji: string;
  color: string;
  coverImageUri?: string;
};

export function applyDeckAlbumAppearanceUpdate(
  currentAlbum: DeckAlbum,
  prefs: DeckAlbumPreferences,
  update: AlbumAppearanceUpdateInput,
  defaultDisplayName: string
): { nextPrefs: DeckAlbumPreferences; updatedAlbum: DeckAlbum } {
  const isCustomAlbum = prefs.customAlbums.some((it) => it.id === currentAlbum.id);
  const nextName = update.name.trim();

  let nextPrefs: DeckAlbumPreferences = { ...prefs };
  let updatedAlbum: DeckAlbum;

  if (isCustomAlbum) {
    updatedAlbum = {
      ...currentAlbum,
      name: nextName,
      emoji: update.emoji,
      color: update.color,
      coverImageUri: update.coverImageUri || undefined,
      isNameCustomized: true,
    };
    // A custom album stores its own appearance. Any override left for its id
    // (from an earlier save that took the system-album path) would win in
    // buildDeckAlbums and hide this edit, so clear all of them.
    nextPrefs = {
      ...nextPrefs,
      customAlbums: nextPrefs.customAlbums.map((it) =>
        it.id === currentAlbum.id ? updatedAlbum : it
      ),
      ...withoutOverridesFor(nextPrefs, currentAlbum.id),
    };
  } else {
    const nextNameOverrides = { ...nextPrefs.albumNameOverrides };
    const unchangedSystemName = nextName === defaultDisplayName;
    if (unchangedSystemName) {
      delete nextNameOverrides[currentAlbum.id];
    } else {
      nextNameOverrides[currentAlbum.id] = nextName;
    }

    const nextEmojiOverrides = {
      ...nextPrefs.albumEmojiOverrides,
      [currentAlbum.id]: update.emoji,
    };
    const nextColorOverrides = {
      ...nextPrefs.albumColorOverrides,
      [currentAlbum.id]: update.color,
    };
    const nextCoverOverrides = { ...nextPrefs.albumCoverOverrides };
    if (update.coverImageUri) {
      nextCoverOverrides[currentAlbum.id] = update.coverImageUri;
    } else {
      delete nextCoverOverrides[currentAlbum.id];
    }

    nextPrefs = {
      ...nextPrefs,
      albumNameOverrides: nextNameOverrides,
      albumEmojiOverrides: nextEmojiOverrides,
      albumColorOverrides: nextColorOverrides,
      albumCoverOverrides: nextCoverOverrides,
    };

    updatedAlbum = {
      ...currentAlbum,
      name: nextName,
      emoji: update.emoji,
      color: update.color,
      coverImageUri: update.coverImageUri || undefined,
      isNameCustomized: !unchangedSystemName,
    };
  }

  return { nextPrefs, updatedAlbum };
}

type OverrideMaps = Pick<
  DeckAlbumPreferences,
  'albumNameOverrides' | 'albumEmojiOverrides' | 'albumColorOverrides' | 'albumCoverOverrides'
>;

function withoutOverridesFor(prefs: DeckAlbumPreferences, albumId: string): OverrideMaps {
  const strip = (map: Record<string, string>) => {
    if (!(albumId in map)) return map;
    const next = { ...map };
    delete next[albumId];
    return next;
  };
  return {
    albumNameOverrides: strip(prefs.albumNameOverrides),
    albumEmojiOverrides: strip(prefs.albumEmojiOverrides),
    albumColorOverrides: strip(prefs.albumColorOverrides),
    albumCoverOverrides: strip(prefs.albumCoverOverrides),
  };
}

/**
 * Repairs prefs where a custom album still has entries in the override maps:
 * the override values (the most recent edit) are folded into the album itself
 * and the overrides are removed. System-album overrides are left alone.
 */
export function foldCustomAlbumOverrides(prefs: DeckAlbumPreferences): {
  prefs: DeckAlbumPreferences;
  changed: boolean;
} {
  let changed = false;
  let next: DeckAlbumPreferences = prefs;
  const customAlbums = prefs.customAlbums.map((album) => {
    const name = (prefs.albumNameOverrides[album.id] || '').trim();
    const emoji = prefs.albumEmojiOverrides[album.id];
    const color = prefs.albumColorOverrides[album.id];
    const cover = prefs.albumCoverOverrides[album.id];
    if (!name && !emoji && !color && !cover) return album;
    changed = true;
    next = { ...next, ...withoutOverridesFor(next, album.id) };
    return {
      ...album,
      ...(name ? { name, isNameCustomized: true } : {}),
      ...(emoji ? { emoji } : {}),
      ...(color ? { color } : {}),
      ...(cover ? { coverImageUri: cover } : {}),
    };
  });
  return changed ? { prefs: { ...next, customAlbums }, changed } : { prefs, changed };
}
