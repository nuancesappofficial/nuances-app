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
    nextPrefs = {
      ...nextPrefs,
      customAlbums: nextPrefs.customAlbums.map((it) =>
        it.id === currentAlbum.id ? updatedAlbum : it
      ),
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
