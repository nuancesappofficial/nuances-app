import type Card from '@database/models/Card';

type AlbumPreloadPayload = {
  cards: Card[];
  cardImageMap: Record<string, string>;
  seenCardIds: Set<string>;
};

const albumPreloadCache = new Map<string, AlbumPreloadPayload>();

export function primeAlbumPreload(albumId: string, payload: AlbumPreloadPayload) {
  albumPreloadCache.set(albumId, payload);
}

export function consumeAlbumPreload(albumId: string): AlbumPreloadPayload | null {
  const payload = albumPreloadCache.get(albumId) ?? null;
  albumPreloadCache.delete(albumId);
  return payload;
}
