import AsyncStorage from '@react-native-async-storage/async-storage';
import type Card from '@database/models/Card';
import type { DeckAlbum } from '../../components/UI/DeckScreenUI/deckTypes';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import type { UILanguage } from '@services/settings/userSettings';
import { tUI } from '../../i18n/uiLanguage';

export type DeckAlbumPreferences = {
  customAlbums: DeckAlbum[];
  albumNameOverrides: Record<string, string>;
  albumEmojiOverrides: Record<string, string>;
  albumColorOverrides: Record<string, string>;
  albumCoverOverrides: Record<string, string>;
  deletedAlbumIds: string[];
};

export const DECK_ALBUM_PREFS_KEY = 'deck_album_preferences_v1';
export const DEFAULT_CUSTOM_ALBUM_EMOJI = '📁';
export const DEFAULT_CUSTOM_ALBUM_COLOR = '#1E293B';
export const ALBUM_TAG_PREFIX = 'album:';
export const ALL_CARDS_ALBUM_ID = 'all';
export const FAVORITES_ALBUM_ID = 'favorites';

type DeckAlbumPreferencesListener = (
  preferences: DeckAlbumPreferences,
  userId?: string
) => void;

const deckAlbumPreferencesListeners = new Set<DeckAlbumPreferencesListener>();

export function subscribeDeckAlbumPreferences(
  listener: DeckAlbumPreferencesListener
): () => void {
  deckAlbumPreferencesListeners.add(listener);
  return () => {
    deckAlbumPreferencesListeners.delete(listener);
  };
}

export function getDeckAlbumDisplayName(
  album: Pick<DeckAlbum, 'id' | 'name' | 'isNameCustomized'>,
  uiLanguage: UILanguage
): string {
  if (album.isNameCustomized) return album.name;
  if (album.id === ALL_CARDS_ALBUM_ID || album.id === 'all-cards') {
    return tUI(uiLanguage, 'deck.albumAllCards');
  }
  if (album.id === FAVORITES_ALBUM_ID) {
    return tUI(uiLanguage, 'deck.albumFavorites');
  }
  if (album.id === 'slang') {
    return tUI(uiLanguage, 'deck.albumInternetSlang');
  }
  return album.name;
}

export function getTagsArray(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (typeof tags === 'string') {
    const trimmed = tags.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
    } catch {
      return trimmed
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
  }

  return [];
}

async function getDeckAlbumPrefsKey(expectedUserId?: string): Promise<string> {
  const userId = expectedUserId || (await getCurrentSessionUserId());
  return `${DECK_ALBUM_PREFS_KEY}:${userId ?? 'guest'}`;
}

export async function loadDeckAlbumPreferences(
  expectedUserId?: string
): Promise<DeckAlbumPreferences> {
  try {
    const raw = await AsyncStorage.getItem(
      await getDeckAlbumPrefsKey(expectedUserId)
    );
    if (!raw) {
      return {
        customAlbums: [],
        albumNameOverrides: {},
        albumEmojiOverrides: {},
        albumColorOverrides: {},
        albumCoverOverrides: {},
        deletedAlbumIds: [],
      };
    }

    const parsed = JSON.parse(raw) as Partial<DeckAlbumPreferences>;
    return {
      customAlbums: Array.isArray(parsed.customAlbums)
        ? parsed.customAlbums
        : [],
      albumNameOverrides:
        parsed.albumNameOverrides &&
        typeof parsed.albumNameOverrides === 'object'
          ? (parsed.albumNameOverrides as Record<string, string>)
          : {},
      albumEmojiOverrides:
        parsed.albumEmojiOverrides &&
        typeof parsed.albumEmojiOverrides === 'object'
          ? (parsed.albumEmojiOverrides as Record<string, string>)
          : {},
      albumColorOverrides:
        parsed.albumColorOverrides &&
        typeof parsed.albumColorOverrides === 'object'
          ? (parsed.albumColorOverrides as Record<string, string>)
          : {},
      albumCoverOverrides:
        parsed.albumCoverOverrides &&
        typeof parsed.albumCoverOverrides === 'object'
          ? (parsed.albumCoverOverrides as Record<string, string>)
          : {},
      deletedAlbumIds: Array.isArray(parsed.deletedAlbumIds)
        ? parsed.deletedAlbumIds
        : [],
    };
  } catch (error) {
    console.warn('[DeckAlbums] load preferences failed:', error);
    return {
      customAlbums: [],
      albumNameOverrides: {},
      albumEmojiOverrides: {},
      albumColorOverrides: {},
      albumCoverOverrides: {},
      deletedAlbumIds: [],
    };
  }
}

export async function saveDeckAlbumPreferences(
  payload: DeckAlbumPreferences,
  expectedUserId?: string
): Promise<void> {
  const userId = expectedUserId || (await getCurrentSessionUserId());
  await AsyncStorage.setItem(
    `${DECK_ALBUM_PREFS_KEY}:${userId ?? 'guest'}`,
    JSON.stringify(payload)
  );
  deckAlbumPreferencesListeners.forEach((listener) => {
    listener(payload, userId ?? undefined);
  });
}

export function buildPreviewCards(
  cards: Card[],
  cardImageMap: Record<string, string>
) {
  return cards.slice(0, 3).map((card) => {
    const imageUrl = cardImageMap[card.id];
    return {
      ...(imageUrl ? { imageUrl } : {}),
      cardTypeText: card.partOfSpeech || 'word',
      previewText: (card.targetWord || card.definition || 'card').trim(),
      createdAtMs: new Date(card.createdAt).getTime(),
    };
  });
}

export function createCustomAlbum(name: string): DeckAlbum {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    emoji: DEFAULT_CUSTOM_ALBUM_EMOJI,
    color: DEFAULT_CUSTOM_ALBUM_COLOR,
    cardIds: [],
    wordCount: 0,
    latestCards: [],
  };
}

export function buildDeckAlbums(
  allCards: Card[],
  cardImageMap: Record<string, string>,
  prefs: DeckAlbumPreferences
): DeckAlbum[] {
  const favoriteCards: Card[] = [];
  const slangCards: Card[] = [];
  const customAlbumCards = new Map<string, Card[]>(
    prefs.customAlbums.map((album) => [album.id, []])
  );

  allCards.forEach((card) => {
    const tags = getTagsArray(card.tags).map((t) => t.toLowerCase());
    const albumTagIds = tags
      .filter((tag) => tag.startsWith(ALBUM_TAG_PREFIX))
      .map((tag) => tag.slice(ALBUM_TAG_PREFIX.length).trim());
    const text =
      `${card.targetWord || ''} ${card.definition || ''}`.toLowerCase();

    if (albumTagIds.includes(FAVORITES_ALBUM_ID)) {
      favoriteCards.push(card);
    }

    if (
      tags.some((t) => ['slang', 'internet', 'social'].includes(t)) ||
      albumTagIds.includes('slang') ||
      /slang|internet|meme/.test(text)
    ) {
      slangCards.push(card);
    }

    albumTagIds.forEach((albumId) => {
      const bucket = customAlbumCards.get(albumId);
      if (bucket) bucket.push(card);
    });
  });

  const defaultAlbums: DeckAlbum[] = [
    {
      id: ALL_CARDS_ALBUM_ID,
      name: 'All cards',
      emoji: '📌',
      color: '#D94A4A',
      cardIds: allCards.map((card) => card.id),
      wordCount: allCards.length,
      latestCards: buildPreviewCards(allCards, cardImageMap),
      isDefault: true,
    },
    {
      id: FAVORITES_ALBUM_ID,
      name: 'My Favorites',
      emoji: '⭐',
      color: '#F4C542',
      cardIds: Array.from(new Set(favoriteCards.map((card) => card.id))),
      wordCount: favoriteCards.length,
      latestCards: buildPreviewCards(favoriteCards, cardImageMap),
      isDefault: true,
    },
    {
      id: 'slang',
      name: 'Internet Slang',
      emoji: '💬',
      color: '#4EAFF4',
      cardIds: Array.from(new Set(slangCards.map((card) => card.id))),
      wordCount: slangCards.length,
      latestCards: buildPreviewCards(slangCards, cardImageMap),
    },
  ];

  const computedCustomAlbums = prefs.customAlbums.map((album) => {
    const cards = customAlbumCards.get(album.id) ?? [];
    return {
      ...album,
      cardIds: cards.map((card) => card.id),
      wordCount: cards.length,
      latestCards: buildPreviewCards(cards, cardImageMap),
    };
  });

  const customAlbumIds = new Set(prefs.customAlbums.map((album) => album.id));
  return [...defaultAlbums, ...computedCustomAlbums]
    .map((album) => {
      const customName = (prefs.albumNameOverrides[album.id] || '').trim();
      return {
        ...album,
        name: customName || album.name,
        isNameCustomized: Boolean(customName) || customAlbumIds.has(album.id),
        emoji: prefs.albumEmojiOverrides[album.id] || album.emoji,
        color: prefs.albumColorOverrides[album.id] || album.color,
        coverImageUri:
          prefs.albumCoverOverrides[album.id] || album.coverImageUri,
      };
    })
    .filter((album) => !prefs.deletedAlbumIds.includes(album.id));
}
