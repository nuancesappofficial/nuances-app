import React from 'react';
import { Alert, AppState, Image, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import { isDefaultExperienceCard } from '../../../../features/cache/defaultExperienceCard';
import { useAppTour } from '../../../../contexts/AppTourContext';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import { getRemainingCacheCapacity } from '@services/cache/cacheLimitService';
import { buildStaggeredCreationDates } from '../../../../features/cache/cacheStaggerOrdering';

export type CropperFlowTarget = 'quick-add' | 'swipe-image';

type UseCacheQuickAddFlowArgs = {
  navigation: any;
  setShowAddModal: React.Dispatch<React.SetStateAction<boolean>>;
  setAddTab: React.Dispatch<React.SetStateAction<'text' | 'image'>>;
  onBatchQuickAddCreated?: (createdItemIds: string[]) => void;
  onSwipeImageCropCancel?: (itemId: string) => void;
};

export function useCacheQuickAddFlow({
  navigation,
  setShowAddModal,
  setAddTab,
  onBatchQuickAddCreated,
  onSwipeImageCropCancel,
}: UseCacheQuickAddFlowArgs) {
  const appTour = useAppTour();
  const [creatingImage, setCreatingImage] = React.useState(false);
  const [showQuickCamera, setShowQuickCamera] = React.useState(false);
  const [quickCameraFacing, setQuickCameraFacing] = React.useState<CameraType>('back');
  const [showUploadCropper, setShowUploadCropper] = React.useState(false);
  const [cropperFlowTarget, setCropperFlowTarget] = React.useState<CropperFlowTarget>('quick-add');
  const [pendingOriginalImageUri, setPendingOriginalImageUri] = React.useState<string | null>(null);
  const [pendingOriginalImageSize, setPendingOriginalImageSize] = React.useState<{ width: number; height: number } | null>(null);
  const [pendingSwipeImageItem, setPendingSwipeImageItem] = React.useState<CachedItem | null>(null);
  const [pendingOpenCropperAfterAddDismiss, setPendingOpenCropperAfterAddDismiss] = React.useState(false);
  const [pendingOpenCameraAfterAddDismiss, setPendingOpenCameraAfterAddDismiss] = React.useState(false);
  const [suppressAddModalAnimation, setSuppressAddModalAnimation] = React.useState(false);
  const [isPendingImageNormalized, setIsPendingImageNormalized] = React.useState(false);
  const pendingOriginalPickedUriRef = React.useRef<string | null>(null);
  const cropperWatchdogTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const pendingCropperOpenTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const cropperShownRef = React.useRef(false);

  const quickCameraRef = React.useRef<CameraView | null>(null);
  const pickerRequestActiveRef = React.useRef(false);
  const cameraCaptureActiveRef = React.useRef(false);
  const cropConfirmActiveRef = React.useRef(false);
  const pendingCropperParamsRef = React.useRef<{
    target: CropperFlowTarget;
    item: CachedItem | null;
    imageUri: string;
    imageSize: { width: number; height: number } | null;
  } | null>(null);
  const [quickCameraPermission, requestQuickCameraPermission] = useCameraPermissions();

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') return;
      cameraCaptureActiveRef.current = false;
      setShowQuickCamera(false);
      setPendingOpenCameraAfterAddDismiss(false);
    });
    return () => {
      subscription.remove();
      if (cropperWatchdogTimerRef.current) {
        clearTimeout(cropperWatchdogTimerRef.current);
        cropperWatchdogTimerRef.current = null;
      }
      if (pendingCropperOpenTimerRef.current) {
        clearTimeout(pendingCropperOpenTimerRef.current);
        pendingCropperOpenTimerRef.current = null;
      }
    };
  }, []);

  const createQuickImageCachedItems = React.useCallback(
    async (
      imageUris: string[]
    ): Promise<{ createdItems: CachedItem[]; topItem: CachedItem | null }> => {
      const userId = await getCurrentSessionUserId();
      if (!userId) {
        onBatchQuickAddCreated?.([]);
        Alert.alert('需要登入', '請先登入後再建立圖片卡片。');
        return { createdItems: [], topItem: null };
      }

      const remainingCapacity = await getRemainingCacheCapacity(userId);
      if (remainingCapacity <= 0) {
        onBatchQuickAddCreated?.([]);
        Alert.alert('暫存區已滿', '請先處理或刪除部分暫存卡片後再新增。');
        return { createdItems: [], topItem: null };
      }
      const validUris = Array.from(new Set(imageUris.filter(Boolean))).slice(
        0,
        Math.min(10, remainingCapacity)
      );
      if (validUris.length === 0) {
        onBatchQuickAddCreated?.([]);
        return { createdItems: [], topItem: null };
      }

      const collection = database.get<CachedItem>('cached_items');
      const existingItems = await collection
        .query(
          Q.where('user_id', userId),
          Q.where('deleted_at', null),
          Q.or(
            Q.where('image_storage_path', Q.oneOf(validUris)),
            Q.where('media_uri', Q.oneOf(validUris))
          )
        )
        .fetch();
      const existingUris = new Set(
        existingItems.flatMap((item) => [item.imageStoragePath, item.mediaUri]).filter(Boolean)
      );
      const newUris = validUris.filter((uri) => !existingUris.has(uri));
      if (newUris.length === 0) {
        onBatchQuickAddCreated?.([]);
        Alert.alert('已在暫存區', '所選取的圖片均已存在於暫存區中。');
        return { createdItems: [], topItem: null };
      }

      const creationDates = buildStaggeredCreationDates(newUris.length);
      const preparedItems = newUris.map((uri, index) =>
        collection.prepareCreate((item) => {
          item.userId = userId;
          item.contentType = 'image';
          item.type = 'image';
          item.contentText = undefined;
          item.contentUrl = undefined;
          item.mediaUri = uri;
          item.imageStoragePath = uri;
          item.sourceApp = 'Quick Add';
          item.userKeywords = undefined;
          item.aiAnalysisCompleted = false;
          item.convertedToCard = false;
          item.imageAnnotations = undefined;

          // 1st selected image (index 0) gets the highest createdAt, so it will be the top card
          // Note: item.createdAt is @readonly on CachedItem model, so assign to _raw directly
          const createdAt = creationDates[index] || new Date();
          (item._raw as any).created_at = createdAt.getTime();
          (item._raw as any).updated_at = createdAt.getTime();
          const expiresAt = new Date(createdAt);
          expiresAt.setMinutes(expiresAt.getMinutes() + 10);
          item.expiresAt = expiresAt;
        })
      );
      const createdIds = preparedItems.map((item) => item.id);
      onBatchQuickAddCreated?.(createdIds);

      await database.write(async () => {
        await database.batch(...preparedItems);
      });

      return {
        createdItems: preparedItems,
        topItem: preparedItems[0] || null,
      };
    },
    [onBatchQuickAddCreated]
  );

  const queueQuickAddCropperAfterModalDismiss = React.useCallback(
    (params: { imageUri: string; imageSize?: { width: number; height: number } | null }) => {
      const cropperParams = {
        target: 'quick-add' as const,
        item: null,
        imageUri: params.imageUri,
        imageSize: params.imageSize ?? null,
      };
      pendingCropperParamsRef.current = cropperParams;
      setCropperFlowTarget('quick-add');
      setPendingSwipeImageItem(null);
      setPendingOriginalImageUri(params.imageUri);
      setPendingOriginalImageSize(params.imageSize ?? null);
      setPendingOpenCropperAfterAddDismiss(true);
      setSuppressAddModalAnimation(true);
      setShowAddModal(false);

      setTimeout(() => {
        if (pendingCropperParamsRef.current) {
          const pending = pendingCropperParamsRef.current;
          pendingCropperParamsRef.current = null;
          setCropperFlowTarget(pending.target);
          setPendingSwipeImageItem(pending.item);
          setPendingOriginalImageUri(pending.imageUri);
          setPendingOriginalImageSize(pending.imageSize);
          setPendingOpenCropperAfterAddDismiss(false);
          setShowUploadCropper(true);
        }
      }, 300);
    },
    [setShowAddModal]
  );

  const openCropperForSwipeImage = React.useCallback((params: {
    item: CachedItem;
    imageUri: string;
    imageSize?: { width: number; height: number } | null;
  }) => {
    setCropperFlowTarget('swipe-image');
    setPendingSwipeImageItem(params.item);
    setPendingOriginalImageUri(params.imageUri);
    setPendingOriginalImageSize(params.imageSize ?? null);
    setShowUploadCropper(true);
  }, []);

  const handleUploadImageDirect = React.useCallback(async () => {
    if (pickerRequestActiveRef.current || creatingImage) return;
    pickerRequestActiveRef.current = true;
    const requestGuard = setTimeout(() => {
      // If iOS failed to present PHPicker and left the native promise pending,
      // allow another tap without leaving the UI in "processing" forever.
      pickerRequestActiveRef.current = false;
    }, 1500);

    // On iOS, tearing down the add sheet together with the picker takes ~0.5-0.7s, and UIKit drops
    // any modal presented in that window. Close the sheet first so nothing is left to close when the
    // picker returns and the cropper can present right away. Reopened below if nothing gets picked.
    const closedSheetBeforePicker = Platform.OS === 'ios';
    let pickerHandedOff = false;

    try {
      if (closedSheetBeforePicker) {
        setSuppressAddModalAnimation(true);
        setShowAddModal(false);
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
      // iOS PHPicker grants access only to the photos the user chooses.
      // Use quality: 1.0 to eliminate expensive native software JPEG transcoding
      // so multiple high-res photos resolve into JS in zero delay.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 1.0,
      });
      if (result.canceled || !result.assets?.length) {
        return;
      }

      const pickedAssets = result.assets.filter((asset) => Boolean(asset.uri));
      if (pickedAssets.length === 0) {
        Alert.alert('圖片選擇失敗', '沒有取得可使用的圖片。');
        return;
      }

      pickerHandedOff = true;

      const isSingleUpload = pickedAssets.length === 1;
      const singleAsset = pickedAssets[0];
      const singleImageSize =
        isSingleUpload && singleAsset?.width && singleAsset?.height
          ? { width: singleAsset.width, height: singleAsset.height }
          : null;

      // Set creating indicator so the button lock is active during processing
      setCreatingImage(true);

      if (isSingleUpload) {
        // Clear any pending timers and ensure cropper is reset
        if (pendingCropperOpenTimerRef.current) {
          clearTimeout(pendingCropperOpenTimerRef.current);
          pendingCropperOpenTimerRef.current = null;
        }
        if (cropperWatchdogTimerRef.current) {
          clearTimeout(cropperWatchdogTimerRef.current);
          cropperWatchdogTimerRef.current = null;
        }
        setShowUploadCropper(false);

        // Record time when native picker returned to ensure iOS modal dismissal finishes before presenting cropper
        const pickerDismissStartTime = Date.now();

        // Dismiss the input modal immediately without animation BEFORE any async work,
        // so the upload modal never lingers on screen on iOS or re-rises on Android
        setSuppressAddModalAnimation(true);
        setShowAddModal(false);

        const userId = await getCurrentSessionUserId();
        if (!userId) {
          Alert.alert('需要登入', '請先登入後再建立圖片卡片。');
          return;
        }

        const collection = database.get<CachedItem>('cached_items');
        const [remainingCapacity, existingItems] = await Promise.all([
          getRemainingCacheCapacity(userId),
          collection
            .query(
              Q.where('user_id', userId),
              Q.where('deleted_at', null),
              Q.or(
                Q.where('image_storage_path', singleAsset.uri),
                Q.where('media_uri', singleAsset.uri)
              ),
              Q.take(1)
            )
            .fetch(),
        ]);

        if (remainingCapacity <= 0) {
          Alert.alert('暫存區已滿', '請先處理或刪除部分暫存卡片後再新增。');
          return;
        }

        if (existingItems.length > 0) {
          Alert.alert('已在暫存區', '所選取的圖片已存在於暫存區中。');
          return;
        }

        let finalUri = singleAsset.uri;
        let finalSize = singleImageSize;
        let isNormalized = false;

        if (Platform.OS === 'android') {
          try {
            const normalized = await ImageManipulator.manipulateAsync(singleAsset.uri, [], {
              compress: 1,
              format: ImageManipulator.SaveFormat.JPEG,
            });
            if (normalized.uri && normalized.width > 0 && normalized.height > 0) {
              finalUri = normalized.uri;
              finalSize = { width: normalized.width, height: normalized.height };
              isNormalized = true;
            }
          } catch (err) {
            console.warn('[CacheList] pre-cropper manipulateAsync failed, using raw asset:', err);
          }
        } else {
          // iOS PHPicker output requires no EXIF rotation workaround; pass raw asset directly
          isNormalized = Boolean(singleImageSize && singleImageSize.width > 0 && singleImageSize.height > 0);
        }

        void Image.prefetch(finalUri);

        pendingOriginalPickedUriRef.current = singleAsset.uri;
        setIsPendingImageNormalized(isNormalized);
        setCropperFlowTarget('quick-add');
        setPendingSwipeImageItem(null);
        setPendingOriginalImageUri(finalUri);
        setPendingOriginalImageSize(finalSize);
        setPendingOpenCropperAfterAddDismiss(false);
        pendingCropperParamsRef.current = null;

        // UIKit silently drops a Modal present while the native picker is still animating out,
        // and no onShow ever fires. Instead of trusting one fixed delay, re-present until onShow
        // confirms it; only after every attempt fails fall back to creating the card directly.
        const MAX_PRESENT_ATTEMPTS = 3;
        const PRESENT_CONFIRM_TIMEOUT_MS = 1800;
        cropperShownRef.current = false;

        const fallbackCreateCardDirectly = async () => {
          console.warn('[CacheList] cropper presentation failed after retries; creating card directly');
          setShowUploadCropper(false);
          const originalUri = pendingOriginalPickedUriRef.current || finalUri;
          pendingOriginalPickedUriRef.current = null;
          setPendingOriginalImageUri(null);
          setPendingOriginalImageSize(null);
          setIsPendingImageNormalized(false);
          setCropperFlowTarget('quick-add');
          if (originalUri) {
            try {
              await createQuickImageCachedItem(originalUri, originalUri);
            } catch (e) {
              console.error('[CacheList] fallback direct card create failed:', e);
            }
          }
        };

        const scheduleCropperPresentation = (attempt: number) => {
          setShowUploadCropper(true);

          if (cropperWatchdogTimerRef.current) {
            clearTimeout(cropperWatchdogTimerRef.current);
          }
          cropperWatchdogTimerRef.current = setTimeout(() => {
            cropperWatchdogTimerRef.current = null;
            if (cropperShownRef.current) return;
            if (attempt >= MAX_PRESENT_ATTEMPTS) {
              void fallbackCreateCardDirectly();
              return;
            }
            // Toggle visibility off then on so RN issues a fresh native present.
            setShowUploadCropper(false);
            pendingCropperOpenTimerRef.current = setTimeout(() => {
              pendingCropperOpenTimerRef.current = null;
              scheduleCropperPresentation(attempt + 1);
            }, 150);
          }, PRESENT_CONFIRM_TIMEOUT_MS);
        };

        if (Platform.OS === 'ios') {
          // The add sheet was already closed before the picker opened, so only the picker's own
          // teardown is left. Without that early close (700ms), UIKit drops a present made while
          // the sheet and picker are still tearing down together.
          const elapsed = Date.now() - pickerDismissStartTime;
          const iosDelay = Math.max(50, (closedSheetBeforePicker ? 150 : 700) - elapsed);
          pendingCropperOpenTimerRef.current = setTimeout(() => {
            pendingCropperOpenTimerRef.current = null;
            scheduleCropperPresentation(1);
          }, iosDelay);
        } else {
          requestAnimationFrame(() => {
            scheduleCropperPresentation(1);
          });
        }
        return;
      }

      // Multi-image upload: batch create items immediately and dismiss add modal
      try {
        await createQuickImageCachedItems(
          pickedAssets.map((asset) => asset.uri).filter(Boolean) as string[]
        );
        setSuppressAddModalAnimation(true);
        setShowAddModal(false);
      } catch (error) {
        onBatchQuickAddCreated?.([]);
        console.error('[CacheList] batch image create failed:', error);
        Alert.alert('新增失敗', '批次新增圖片快取失敗，請稍後再試。');
        setSuppressAddModalAnimation(false);
        setShowAddModal(true);
      }
    } catch (error) {
      console.error('[CacheList] upload picker failed:', error);
      Alert.alert('圖片選擇失敗', '無法開啟相簿，請稍後再試。');
    } finally {
      clearTimeout(requestGuard);
      pickerRequestActiveRef.current = false;
      setCreatingImage(false);
      if (closedSheetBeforePicker && !pickerHandedOff) {
        setSuppressAddModalAnimation(false);
        setShowAddModal(true);
      }
    }
  }, [
    createQuickImageCachedItems,
    creatingImage,
    onBatchQuickAddCreated,
    setShowAddModal,
  ]);

  const handleCaptureImage = React.useCallback(async () => {
    if (!quickCameraPermission?.granted) {
      const permission = await requestQuickCameraPermission();
      if (!permission.granted) {
        Alert.alert('需要相機權限', '請允許相機權限後再拍照。');
        return;
      }
    }
    setCropperFlowTarget('quick-add');
    setPendingSwipeImageItem(null);
    setPendingOpenCropperAfterAddDismiss(false);
    setPendingOpenCameraAfterAddDismiss(true);
    setSuppressAddModalAnimation(true);
    setShowAddModal(false);
  }, [quickCameraPermission?.granted, requestQuickCameraPermission, setShowAddModal]);

  const closeQuickCamera = React.useCallback(() => {
    setShowQuickCamera(false);
    setPendingOpenCameraAfterAddDismiss(false);
  }, []);

  const toggleQuickCameraFacing = React.useCallback(() => {
    setQuickCameraFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  }, []);

  const captureQuickPhoto = React.useCallback(async () => {
    if (cameraCaptureActiveRef.current) return;
    cameraCaptureActiveRef.current = true;
    try {
      const photo = await quickCameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) {
        Alert.alert('拍照失敗', '請再試一次');
        return;
      }
      setShowQuickCamera(false);
      setShowAddModal(false);
      setCropperFlowTarget('quick-add');
      setPendingSwipeImageItem(null);
      setPendingOpenCameraAfterAddDismiss(false);
      pendingOriginalPickedUriRef.current = photo.uri;
      setIsPendingImageNormalized(false);
      setPendingOriginalImageUri(photo.uri);
      setPendingOriginalImageSize(
        typeof photo.width === 'number' && typeof photo.height === 'number'
          ? { width: photo.width, height: photo.height }
          : null
      );
      setPendingOpenCropperAfterAddDismiss(false);
      setShowUploadCropper(true);
    } catch (error) {
      console.error('[CacheList] quick camera capture failed:', error);
      Alert.alert('拍照失敗', '請再試一次');
    } finally {
      cameraCaptureActiveRef.current = false;
    }
  }, [setShowAddModal]);

  const createQuickImageCachedItem = React.useCallback(
    async (croppedUri: string, originalUri?: string | null): Promise<CachedItem | null> => {
      const userId = await getCurrentSessionUserId();
      if (!userId) {
        Alert.alert('需要登入', '請先登入後再建立圖片卡片。');
        return null;
      }

      if ((await getRemainingCacheCapacity(userId)) <= 0) {
        Alert.alert('暫存區已滿', '請先處理或刪除部分暫存卡片後再新增。');
        return null;
      }

      let createdItem: CachedItem | null = null;
      await database.write(async () => {
        const collection = database.get<CachedItem>('cached_items');
        const duplicate = await collection
          .query(
            Q.where('user_id', userId),
            Q.where('deleted_at', null),
            Q.where('content_type', 'image'),
            Q.where('image_storage_path', croppedUri),
            Q.take(1)
          )
          .fetch();
        if (duplicate.length > 0) return;
        createdItem = await collection.create((item) => {
          item.userId = userId;
          item.contentType = 'image';
          item.type = 'image';
          item.contentText = undefined;
          item.contentUrl = undefined;
          item.mediaUri = originalUri || undefined;
          item.imageStoragePath = croppedUri;
          item.sourceApp = 'Quick Add';
          item.userKeywords = undefined;
          item.aiAnalysisCompleted = false;
          item.convertedToCard = false;
          item.imageAnnotations = undefined;

          const expiresAt = new Date();
          expiresAt.setMinutes(expiresAt.getMinutes() + 10);
          item.expiresAt = expiresAt;
        });
      });
      return createdItem;
    },
    []
  );

  const handleUploadCropCancel = React.useCallback(async () => {
    if (cropperWatchdogTimerRef.current) {
      clearTimeout(cropperWatchdogTimerRef.current);
      cropperWatchdogTimerRef.current = null;
    }
    if (pendingCropperOpenTimerRef.current) {
      clearTimeout(pendingCropperOpenTimerRef.current);
      pendingCropperOpenTimerRef.current = null;
    }
    if (
      appTour.isActive &&
      cropperFlowTarget === 'swipe-image' &&
      pendingSwipeImageItem &&
      isDefaultExperienceCard(pendingSwipeImageItem)
    ) {
      return;
    }
    const isDeferredQuickAdd = cropperFlowTarget === 'quick-add';
    const originalPickedUri = pendingOriginalPickedUriRef.current || pendingOriginalImageUri;
    const cancelledSwipeItemId =
      cropperFlowTarget === 'swipe-image' ? pendingSwipeImageItem?.id ?? null : null;
    pendingCropperParamsRef.current = null;
    pendingCroppedNavigationRef.current = null;
    pendingOriginalPickedUriRef.current = null;
    setShowUploadCropper(false);
    setPendingOriginalImageUri(null);
    setPendingOriginalImageSize(null);
    setIsPendingImageNormalized(false);
    setPendingSwipeImageItem(null);
    setCropperFlowTarget('quick-add');
    setAddTab('image');
    if (cancelledSwipeItemId) {
      onSwipeImageCropCancel?.(cancelledSwipeItemId);
    }
    if (isDeferredQuickAdd && originalPickedUri) {
      try {
        await createQuickImageCachedItem(originalPickedUri, originalPickedUri);
      } catch (err) {
        console.error('[CacheList] create card on cancel failed:', err);
      }
    }
  }, [
    appTour.isActive,
    createQuickImageCachedItem,
    cropperFlowTarget,
    onSwipeImageCropCancel,
    pendingOriginalImageUri,
    pendingSwipeImageItem,
    setAddTab,
  ]);

  const pendingCroppedNavigationRef = React.useRef<(() => void) | null>(null);

  const executePendingCroppedNavigation = React.useCallback(() => {
    const action = pendingCroppedNavigationRef.current;
    pendingCroppedNavigationRef.current = null;
    if (action) {
      // Allow one frame for native UIKit hierarchy to settle before mounting Reanimated heavy tree
      requestAnimationFrame(() => {
        action();
      });
    }
  }, []);

  const handleUploadCropDismiss = React.useCallback(() => {
    executePendingCroppedNavigation();
  }, [executePendingCroppedNavigation]);

  const handleUploadCropConfirm = React.useCallback(
    async (croppedUri: string) => {
      if (cropperWatchdogTimerRef.current) {
        clearTimeout(cropperWatchdogTimerRef.current);
        cropperWatchdogTimerRef.current = null;
      }
      if (pendingCropperOpenTimerRef.current) {
        clearTimeout(pendingCropperOpenTimerRef.current);
        pendingCropperOpenTimerRef.current = null;
      }
      if (cropConfirmActiveRef.current) return;
      cropConfirmActiveRef.current = true;
      const originalPickedUri = pendingOriginalPickedUriRef.current || pendingOriginalImageUri;
      const originalUri = originalPickedUri;
      try {
        if (cropperFlowTarget === 'swipe-image' && pendingSwipeImageItem) {
          const swipeItem = pendingSwipeImageItem;
          if (
            appTour.step === 'STEP_5_CROP_IMAGE' ||
            appTour.step === 'STEP_5_PROCESS_CACHE_CARD'
          ) {
            appTour.nextStep();
          }
          pendingCroppedNavigationRef.current = () => {
            navigation.navigate('CreateCard', {
              cachedItem: swipeItem,
              croppedImageUri: croppedUri,
              originalImageUri: originalUri,
              runOcrOnLoad: true,
              isDefaultExperienceTutorial:
                isDefaultExperienceCard(swipeItem) || undefined,
            });
          };
        } else {
          const quickItem = await createQuickImageCachedItem(croppedUri, originalUri);
          if (!quickItem) {
            setShowUploadCropper(false);
            setPendingOriginalImageUri(null);
            setPendingOriginalImageSize(null);
            setIsPendingImageNormalized(false);
            setPendingOpenCropperAfterAddDismiss(false);
            setPendingSwipeImageItem(null);
            pendingOriginalPickedUriRef.current = null;
            pendingCropperParamsRef.current = null;
            return;
          }
          pendingCroppedNavigationRef.current = () => {
            navigation.navigate('CreateCard', {
              cachedItem: quickItem,
              croppedImageUri: croppedUri,
              originalImageUri: originalUri,
              runOcrOnLoad: true,
            });
          };
        }
        pendingOriginalPickedUriRef.current = null;
        setPendingOriginalImageUri(null);
        setPendingOriginalImageSize(null);
        setIsPendingImageNormalized(false);
        setPendingOpenCropperAfterAddDismiss(false);
        setPendingSwipeImageItem(null);
        setCropperFlowTarget('quick-add');
        setShowUploadCropper(false);

        if (Platform.OS === 'android') {
          // Android Modal does not trigger onDismiss; wait for modal slide-down animation to finish (~180ms)
          // so CreateCard's horizontal slide-in transition is fully visible and not hidden behind the fading modal
          setTimeout(() => {
            executePendingCroppedNavigation();
          }, 180);
        } else {
          // iOS safety fallback in case onDismiss does not fire
          setTimeout(() => {
            executePendingCroppedNavigation();
          }, 350);
        }
      } catch (error) {
        console.error('[CacheList] create quick image item failed:', error);
        setShowUploadCropper(false);
        setPendingOriginalImageUri(null);
        setPendingOriginalImageSize(null);
        setIsPendingImageNormalized(false);
        setPendingOpenCropperAfterAddDismiss(false);
        setPendingSwipeImageItem(null);
        pendingOriginalPickedUriRef.current = null;
        pendingCropperParamsRef.current = null;
        Alert.alert('建立失敗', '無法建立圖片卡片，請稍後再試。');
      } finally {
        cropConfirmActiveRef.current = false;
      }
    },
    [
      appTour,
      createQuickImageCachedItem,
      cropperFlowTarget,
      executePendingCroppedNavigation,
      navigation,
      pendingOriginalImageUri,
      pendingSwipeImageItem,
    ]
  );

  const pendingCreateCardItemAfterDismissRef = React.useRef<CachedItem | null>(null);

  const queueCreateCardAfterAddDismiss = React.useCallback(
    (item: CachedItem) => {
      pendingCreateCardItemAfterDismissRef.current = item;
      setSuppressAddModalAnimation(true);
      setShowAddModal(false);
      if (Platform.OS === 'android') {
        setTimeout(() => {
          if (pendingCreateCardItemAfterDismissRef.current) {
            const toOpen = pendingCreateCardItemAfterDismissRef.current;
            pendingCreateCardItemAfterDismissRef.current = null;
            navigation.navigate('CreateCard', { cachedItem: toOpen });
          }
        }, 180);
      }
    },
    [navigation, setShowAddModal]
  );

  const handleInputModalDismiss = React.useCallback(() => {
    if (pendingCreateCardItemAfterDismissRef.current) {
      const toOpen = pendingCreateCardItemAfterDismissRef.current;
      pendingCreateCardItemAfterDismissRef.current = null;
      requestAnimationFrame(() => {
        navigation.navigate('CreateCard', { cachedItem: toOpen });
      });
    }
    if (pendingCropperParamsRef.current) {
      const cropperParams = pendingCropperParamsRef.current;
      pendingCropperParamsRef.current = null;
      setCropperFlowTarget(cropperParams.target);
      setPendingSwipeImageItem(cropperParams.item);
      setPendingOriginalImageUri(cropperParams.imageUri);
      setPendingOriginalImageSize(cropperParams.imageSize);
      setPendingOpenCropperAfterAddDismiss(false);
      requestAnimationFrame(() => {
        if (Platform.OS === 'ios') {
          setTimeout(() => {
            setShowUploadCropper(true);
          }, 500);
        } else {
          setShowUploadCropper(true);
        }
      });
    } else if (pendingOpenCropperAfterAddDismiss && pendingOriginalImageUri) {
      setShowUploadCropper(true);
      setPendingOpenCropperAfterAddDismiss(false);
    }
    if (pendingOpenCameraAfterAddDismiss) {
      setShowQuickCamera(true);
      setPendingOpenCameraAfterAddDismiss(false);
    }
    if (suppressAddModalAnimation) {
      setSuppressAddModalAnimation(false);
    }
  }, [
    navigation,
    pendingOpenCameraAfterAddDismiss,
    pendingOpenCropperAfterAddDismiss,
    pendingOriginalImageUri,
    suppressAddModalAnimation,
  ]);

  const showConfirmTutorialArrow =
    cropperFlowTarget === 'swipe-image' &&
    pendingSwipeImageItem !== null &&
    isDefaultExperienceCard(pendingSwipeImageItem);

  const handleUploadCropShow = React.useCallback(() => {
    cropperShownRef.current = true;
    if (cropperWatchdogTimerRef.current) {
      clearTimeout(cropperWatchdogTimerRef.current);
      cropperWatchdogTimerRef.current = null;
    }
  }, []);

  const forceCloseUploadCropper = React.useCallback(() => {
    if (cropperWatchdogTimerRef.current) {
      clearTimeout(cropperWatchdogTimerRef.current);
      cropperWatchdogTimerRef.current = null;
    }
    if (pendingCropperOpenTimerRef.current) {
      clearTimeout(pendingCropperOpenTimerRef.current);
      pendingCropperOpenTimerRef.current = null;
    }
    pendingCropperParamsRef.current = null;
    pendingOriginalPickedUriRef.current = null;
    setShowUploadCropper(false);
    setPendingOriginalImageUri(null);
    setPendingOriginalImageSize(null);
    setIsPendingImageNormalized(false);
    setPendingOpenCropperAfterAddDismiss(false);
  }, []);

  return {
    creatingImage,
    showQuickCamera,
    quickCameraFacing,
    showUploadCropper,
    pendingOriginalImageUri,
    pendingOriginalImageSize,
    isPendingImageNormalized,
    showConfirmTutorialArrow,
    suppressAddModalAnimation,
    quickCameraRef,
    quickCameraPermission,
    handleUploadImageDirect,
    handleCaptureImage,
    closeQuickCamera,
    toggleQuickCameraFacing,
    captureQuickPhoto,
    handleUploadCropCancel,
    handleUploadCropConfirm,
    handleUploadCropDismiss,
    handleUploadCropShow,
    handleInputModalDismiss,
    queueQuickAddCropperAfterModalDismiss,
    queueCreateCardAfterAddDismiss,
    openCropperForSwipeImage,
    forceCloseUploadCropper,
  };
}
