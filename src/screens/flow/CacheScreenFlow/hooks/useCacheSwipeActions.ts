import React from 'react';
import { Alert } from 'react-native';
import type CachedItem from '@database/models/CachedItem';
import type { CacheCardRecord } from './useCacheListDataSource';

type Params = {
  cards: CacheCardRecord[];
  navigation: any;
  appTour: { step?: string; nextStep: () => void };
  hideCacheCardImmediately: (itemId: string) => void;
  deleteCacheItemPermanently: (item: CachedItem, options?: { silent?: boolean }) => Promise<void>;
  openCropperForSwipeImage: (params: { item: CachedItem; imageUri: string; imageSize: { width: number; height: number } | null }) => void;
};

export function useCacheSwipeActions(params: Params) {
  const {
    cards,
    navigation,
    appTour,
    hideCacheCardImmediately,
    deleteCacheItemPermanently,
    openCropperForSwipeImage,
  } = params;

  const handleCardImageError = React.useCallback(
    (itemId: string) => {
      const target = cards.find((card) => card.id === itemId);
      if (!target) return;
      hideCacheCardImmediately(itemId);
      void deleteCacheItemPermanently(target.cachedItem, { silent: true });
    },
    [cards, deleteCacheItemPermanently, hideCacheCardImmediately]
  );

  const handleCardSwipeStart = React.useCallback(
    (itemId: string, direction: 'left' | 'right') => {
      if (direction !== 'left') return;
      hideCacheCardImmediately(itemId);
    },
    [hideCacheCardImmediately]
  );

  const handleCardSwipe = React.useCallback(
    (itemId: string, direction: 'left' | 'right') => {
      const target = cards.find((card) => card.id === itemId);
      if (!target) return;

      if (direction === 'right') {
        const isImageCard =
          target.cachedItem.contentType === 'image' ||
          Boolean(target.cachedItem.mediaUri || target.cachedItem.imageStoragePath);

        if (isImageCard) {
          const imageUri =
            target.cachedItem.imageStoragePath ||
            target.cachedItem.mediaUri ||
            target.cachedItem.contentUrl ||
            target.imageUri ||
            null;
          if (!imageUri) {
            Alert.alert('找不到圖片', '這張圖片卡沒有可裁切的圖片來源。');
            return;
          }
          openCropperForSwipeImage({
            item: target.cachedItem,
            imageUri,
            imageSize: null,
          });
          return;
        }

        if (appTour.step === 'STEP_5_PROCESS_CACHE_CARD') {
          appTour.nextStep();
        }
        navigation.navigate('CreateCard', {
          cachedItem: target.cachedItem,
          generationMode: appTour.step === 'STEP_5_PROCESS_CACHE_CARD' ? 'ai-assisted' : undefined,
        });
        return;
      }

      hideCacheCardImmediately(itemId);
      void deleteCacheItemPermanently(target.cachedItem);
    },
    [appTour, cards, deleteCacheItemPermanently, hideCacheCardImmediately, navigation, openCropperForSwipeImage]
  );

  return {
    handleCardImageError,
    handleCardSwipeStart,
    handleCardSwipe,
  };
}
