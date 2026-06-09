import React from 'react';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import type Card from '@database/models/Card';
import { getCurrentAuthUserId } from '@services/auth/userIdentity';

export type CacheCardRecord = {
  id: string;
  imageUri?: string;
  text: string;
  detectedPreview?: string;
  sourceLabel: string;
  importedAtLabel: string;
  cachedItem: CachedItem;
};

export type TodayUploadSticker = {
  key: string;
  cardId?: string;
  label: string;
};

type Params = {
  getDetectedPreview: (annotations: unknown) => string | undefined;
  toSourceLabel: (sourceApp?: string | null) => string;
  toRelativeImportTime: (createdAt?: Date | null) => string;
  normalizeStickerText: (value: string) => string;
  toDayKey: (input: Date | string) => string;
  optimisticallyHiddenCacheIds: Set<string>;
};

export function useCacheListDataSource(params: Params) {
  const {
    getDetectedPreview,
    toSourceLabel,
    toRelativeImportTime,
    normalizeStickerText,
    toDayKey,
    optimisticallyHiddenCacheIds,
  } = params;

  const [cacheItems, setCacheItems] = React.useState<CachedItem[]>([]);
  const [allCards, setAllCards] = React.useState<Card[]>([]);

  React.useEffect(() => {
    let sub: { unsubscribe: () => void } | undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const userId = await getCurrentAuthUserId();
        if (!userId) {
          if (!cancelled) setCacheItems([]);
          return;
        }
        const query = database
          .get<CachedItem>('cached_items')
          .query(Q.where('user_id', userId), Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));
        const data = await query.fetch();
        if (cancelled) return;
        setCacheItems(data);
        sub = query.observe().subscribe((nextData) => setCacheItems(nextData));
      } catch (error) {
        console.error('[CacheList] load cached items failed:', error);
        if (!cancelled) setCacheItems([]);
      }
    };

    void load();
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    let sub: { unsubscribe: () => void } | undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const userId = await getCurrentAuthUserId();
        if (!userId) {
          if (!cancelled) setAllCards([]);
          return;
        }
        const queryCards = database
          .get<Card>('cards')
          .query(Q.where('user_id', userId), Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));
        const data = await queryCards.fetch();
        if (cancelled) return;
        setAllCards(data);
        sub = queryCards.observe().subscribe((nextData) => setAllCards(nextData));
      } catch (error) {
        console.error('[CacheList] load cards failed:', error);
        if (!cancelled) setAllCards([]);
      }
    };

    void load();
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, []);

  const cards = React.useMemo<CacheCardRecord[]>(() => {
    return [...cacheItems].reverse().reduce<CacheCardRecord[]>((acc, item) => {
      if (optimisticallyHiddenCacheIds.has(item.id)) {
        return acc;
      }

      const text = item.contentText?.trim() || item.userKeywords?.trim() || item.contentUrl?.trim() || '';
      const imageUri =
        item.imageStoragePath ||
        item.mediaUri ||
        (item.contentType === 'image' ? item.contentUrl || undefined : undefined);
      const detectedPreview = imageUri ? getDetectedPreview(item.imageAnnotations) : undefined;

      const hasText = text.length > 0;
      const hasImageSource = Boolean(imageUri);
      if (!hasText && !hasImageSource) {
        return acc;
      }

      acc.push({
        id: item.id,
        imageUri,
        text: hasText ? text : 'Image unavailable',
        detectedPreview,
        sourceLabel: toSourceLabel(item.sourceApp),
        importedAtLabel: toRelativeImportTime(item.createdAt),
        cachedItem: item,
      });
      return acc;
    }, []);
  }, [cacheItems, getDetectedPreview, optimisticallyHiddenCacheIds, toRelativeImportTime, toSourceLabel]);

  const todayStickerWords = React.useMemo(() => {
    const todayKey = toDayKey(new Date());
    const seen = new Set<string>();
    const output: TodayUploadSticker[] = [];

    allCards.forEach((card) => {
      if (!card.createdAt) return;
      if (toDayKey(card.createdAt) !== todayKey) return;
      const raw = normalizeStickerText(card.targetPhrase || card.targetWord || '');
      const value = raw.length > 26 ? `${raw.slice(0, 26)}…` : raw;
      if (!value) return;
      const dedupeKey = value.toLowerCase();
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      output.push({
        key: card.id,
        cardId: card.id,
        label: value,
      });
    });

    return output;
  }, [allCards, normalizeStickerText, toDayKey]);

  const todayUploadedCardIds = React.useMemo(() => {
    const todayKey = toDayKey(new Date());
    return allCards
      .filter((card) => !!card.createdAt && toDayKey(card.createdAt) === todayKey)
      .map((card) => card.id);
  }, [allCards, toDayKey]);

  return {
    cacheItems,
    allCards,
    cards,
    todayStickerWords,
    todayUploadedCardIds,
  };
}
