import React from 'react';
import { Alert } from 'react-native';
import type CachedItem from '@database/models/CachedItem';
import type { CacheCardRecord } from './useCacheListDataSource';
import { shouldBlockTutorialCacheDeletion } from '../../../../features/tour/tutorialCachePolicy';
import { DEFAULT_EXPERIENCE_CARD_IMAGE_SIZE } from '../../../../features/cache/defaultExperienceCard';

type Params = {
  cards: CacheCardRecord[];
  navigation: any;
  appTour: { step?: string; isActive?: boolean; nextStep: () => void };
  hideCacheCardFromStack: (itemId: string) => void;
  restoreCacheCardToStack: (itemId: string) => void;
  hideCacheCardImmediately: (itemId: string) => void;
  deleteCacheItemPermanently: (item: CachedItem, options?: { silent?: boolean }) => Promise<void>;
  openCropperForSwipeImage: (params: { item: CachedItem; imageUri: string; imageSize: { width: number; height: number } | null }) => void;
};

export function useCacheSwipeActions(params: Params) {
  const {
    cards,
    navigation,
    appTour,
    hideCacheCardFromStack,
    restoreCacheCardToStack,
    hideCacheCardImmediately,
    deleteCacheItemPermanently,
    openCropperForSwipeImage,
  } = params;

  const isImageCacheCard = React.useCallback((target: CacheCardRecord) => {
    return (
      target.cachedItem.contentType === 'image' ||
      Boolean(target.cachedItem.mediaUri || target.cachedItem.imageStoragePath)
    );
  }, []);

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
      const target = cards.find((card) => card.id === itemId);
      if (!target) return;

      if (
        shouldBlockTutorialCacheDeletion({
          isTutorialActive: appTour.isActive,
          tourStep: appTour.step,
          isDefaultExperienceCard: target.isDefaultExperienceCard,
          direction,
        })
      ) {
        return;
      }

      if (direction === 'left') {
        hideCacheCardImmediately(itemId);
        return;
      }

      if (isImageCacheCard(target)) {
        hideCacheCardFromStack(itemId);
      }
    },
    [appTour, cards, hideCacheCardFromStack, hideCacheCardImmediately, isImageCacheCard]
  );

  const handleCardSwipe = React.useCallback(
    (itemId: string, direction: 'left' | 'right') => {
      const target = cards.find((card) => card.id === itemId);
      if (!target) return;

      if (
        shouldBlockTutorialCacheDeletion({
          isTutorialActive: appTour.isActive,
          tourStep: appTour.step,
          isDefaultExperienceCard: target.isDefaultExperienceCard,
          direction,
        })
      ) {
        restoreCacheCardToStack(itemId);
        return;
      }

      if (direction === 'right') {
        if (isImageCacheCard(target)) {
          const imageUri =
            target.cachedItem.imageStoragePath ||
            target.cachedItem.mediaUri ||
            target.cachedItem.contentUrl ||
            target.imageUri ||
            null;
          if (!imageUri) {
            restoreCacheCardToStack(itemId);
            Alert.alert('找不到圖片', '這張圖片卡沒有可裁切的圖片來源。');
            return;
          }
          if (appTour.step === 'STEP_5_PROCESS_CACHE_CARD') {
            appTour.nextStep();
          }
          openCropperForSwipeImage({
            item: target.cachedItem,
            imageUri,
            // The demo card is a bundled static asset; its size is known at
            // build time, so skip the slow Image.getSize() asset-URI resolution
            // that otherwise flashes a spinner in the cropper.
            imageSize: target.isDefaultExperienceCard
              ? DEFAULT_EXPERIENCE_CARD_IMAGE_SIZE
              : null,
          });
          return;
        }

        if (appTour.step === 'STEP_5_PROCESS_CACHE_CARD') {
          appTour.nextStep();
        }
        navigation.navigate('CreateCard', {
          cachedItem: target.cachedItem,
          generationMode: appTour.step === 'STEP_5_PROCESS_CACHE_CARD' ? 'ai-assisted' : undefined,
          isDefaultExperienceTutorial: target.isDefaultExperienceCard || undefined,
        });
        return;
      }

      hideCacheCardImmediately(itemId);
      void deleteCacheItemPermanently(target.cachedItem);
    },
    [
      appTour,
      cards,
      deleteCacheItemPermanently,
      hideCacheCardFromStack,
      hideCacheCardImmediately,
      isImageCacheCard,
      navigation,
      openCropperForSwipeImage,
      restoreCacheCardToStack,
    ]
  );

  return {
    handleCardImageError,
    handleCardSwipeStart,
    handleCardSwipe,
  };
}
