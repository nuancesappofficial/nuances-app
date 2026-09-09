import React from 'react';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import type Card from '@database/models/Card';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import {
  ensureDefaultExperienceCard,
  isDefaultExperienceCard,
} from '../../../../features/cache/defaultExperienceCard';

export type CacheCardRecord = {
  id: string;
  imageUri?: string;
  text: string;
  detectedPreview?: string;
  sourceLabel: string;
  importedAtLabel: string;
  isDefaultExperienceCard: boolean;
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
  isTutorialActive?: boolean;
};

export function useCacheListDataSource(params: Params) {
  const {
    getDetectedPreview,
    toSourceLabel,
    toRelativeImportTime,
    normalizeStickerText,
    toDayKey,
    optimisticallyHiddenCacheIds,
    isTutorialActive,
  } = params;

  const [cacheItems, setCacheItems] = React.useState<CachedItem[]>([]);
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const hasInitialLoadedRef = React.useRef(false);
  const hasAttemptedHealRef = React.useRef(false);

  React.useEffect(() => {
    hasAttemptedHealRef.current = false;
  }, [isTutorialActive]);

  React.useEffect(() => {
    let sub: { unsubscribe: () => void } | undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const userId = await getCurrentSessionUserId();
        if (!userId) {
          if (!cancelled) setCacheItems([]);
          return;
        }
        if (isTutorialActive) {
          await ensureDefaultExperienceCard(userId, { force: true });
        }
        const query = database
          .get<CachedItem>('cached_items')
          .query(
            Q.where('user_id', userId),
            Q.where('deleted_at', null),
            Q.sortBy('created_at', Q.desc),
            Q.sortBy('id', Q.desc)
          );
        const data = await query.fetch();
        if (cancelled) return;
        hasInitialLoadedRef.current = true;
        console.log(
          `[FirstRunTrace] cache_list.loaded userId=${userId} count=${data.length} defaultCard=${data.some((i) => isDefaultExperienceCard(i))}`
        );
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
  }, [isTutorialActive]);

  React.useEffect(() => {
    if (!isTutorialActive || !hasInitialLoadedRef.current || hasAttemptedHealRef.current) return;
    const hasDemoCard = cacheItems.some((item) => isDefaultExperienceCard(item));
    if (hasDemoCard) return;

    hasAttemptedHealRef.current = true;
    let cancelled = false;
    const healDemoCard = async () => {
      try {
        const userId = await getCurrentSessionUserId();
        if (!userId || cancelled) return;
        await ensureDefaultExperienceCard(userId, { force: true });
      } catch (error) {
        console.warn('[CacheList] self-heal demo card failed:', error);
      }
    };

    void healDemoCard();
    return () => {
      cancelled = true;
    };
  }, [isTutorialActive, cacheItems]);

  React.useEffect(() => {
    let sub: { unsubscribe: () => void } | undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const userId = await getCurrentSessionUserId();
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
    const list = [...cacheItems].reverse().reduce<CacheCardRecord[]>((acc, item) => {
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
        isDefaultExperienceCard: isDefaultExperienceCard(item),
        cachedItem: item,
      });
      return acc;
    }, []);

    if (isTutorialActive) {
      const demoCard = list.find((c) => c.isDefaultExperienceCard);
      return demoCard ? [demoCard] : [];
    }
    return list.filter((c) => !c.isDefaultExperienceCard);
  }, [cacheItems, getDetectedPreview, isTutorialActive, optimisticallyHiddenCacheIds, toRelativeImportTime, toSourceLabel]);

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
