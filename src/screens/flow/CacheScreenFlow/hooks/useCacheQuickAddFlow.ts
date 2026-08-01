import React from 'react';
import { Alert, AppState } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import { isDefaultExperienceCard } from '../../../../features/cache/defaultExperienceCard';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import { getRemainingCacheCapacity } from '@services/cache/cacheLimitService';

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

  const quickCameraRef = React.useRef<CameraView | null>(null);
  const pickerRequestActiveRef = React.useRef(false);
  const cameraCaptureActiveRef = React.useRef(false);
  const cropConfirmActiveRef = React.useRef(false);
  const [quickCameraPermission, requestQuickCameraPermission] = useCameraPermissions();

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') return;
      cameraCaptureActiveRef.current = false;
      setShowQuickCamera(false);
      setPendingOpenCameraAfterAddDismiss(false);
    });
    return () => subscription.remove();
  }, []);

  const createQuickImageCachedItems = React.useCallback(
    async (imageUris: string[]): Promise<string[]> => {
      const userId = await getCurrentSessionUserId();
      if (!userId) {
        Alert.alert('需要登入', '請先登入後再建立圖片卡片。');
        return [];
      }

      const remainingCapacity = await getRemainingCacheCapacity(userId);
      if (remainingCapacity <= 0) {
        Alert.alert('暫存區已滿', '請先處理或刪除部分暫存卡片後再新增。');
        return [];
      }
      const validUris = Array.from(new Set(imageUris.filter(Boolean))).slice(
        0,
        Math.min(10, remainingCapacity)
      );
      if (validUris.length === 0) return [];

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
      if (newUris.length === 0) return [];

      const preparedItems = newUris.map((uri) =>
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

          const expiresAt = new Date();
          expiresAt.setMinutes(expiresAt.getMinutes() + 10);
          item.expiresAt = expiresAt;
        })
      );
      const createdIds = preparedItems.map((item) => item.id);
      onBatchQuickAddCreated?.(createdIds);

      await database.write(async () => {
        await database.batch(...preparedItems);
      });

      return createdIds;
    },
    [onBatchQuickAddCreated]
  );

  const queueQuickAddCropperAfterModalDismiss = React.useCallback(
    (params: { imageUri: string; imageSize?: { width: number; height: number } | null }) => {
      setCropperFlowTarget('quick-add');
      setPendingSwipeImageItem(null);
      setPendingOriginalImageUri(params.imageUri);
      setPendingOriginalImageSize(params.imageSize ?? null);
      setPendingOpenCropperAfterAddDismiss(true);
      setSuppressAddModalAnimation(true);
      setShowAddModal(false);
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

    try {
      // iOS PHPicker grants access only to the photos the user chooses and does
      // not require a full-library permission prompt. Keep the input modal
      // mounted underneath, matching the original interaction.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.length) return;

      const pickedAssets = result.assets.filter((asset) => Boolean(asset.uri));
      if (pickedAssets.length === 0) {
        Alert.alert('圖片選擇失敗', '沒有取得可使用的圖片。');
        return;
      }

      setCreatingImage(true);
      setSuppressAddModalAnimation(true);
      setShowAddModal(false);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        const createdItemIds = await createQuickImageCachedItems(
          pickedAssets.map((asset) => asset.uri).filter(Boolean) as string[]
        );
        if (createdItemIds.length > 0) {
          // The pending ids were registered before the DB batch, so the stack
          // is ready before WatermelonDB emits the newly inserted rows.
        } else {
          Alert.alert('新增失敗', '沒有成功新增任何圖片快取。');
        }
      } catch (error) {
        onBatchQuickAddCreated?.([]);
        console.error('[CacheList] batch image create failed:', error);
        Alert.alert('新增失敗', '批次新增圖片快取失敗，請稍後再試。');
      }
    } catch (error) {
      console.error('[CacheList] upload picker failed:', error);
      Alert.alert('圖片選擇失敗', '無法開啟相簿，請稍後再試。');
    } finally {
      clearTimeout(requestGuard);
      pickerRequestActiveRef.current = false;
      setCreatingImage(false);
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

  const handleUploadCropCancel = React.useCallback(() => {
    const shouldReopenAddModal = cropperFlowTarget === 'quick-add';
    const cancelledSwipeItemId =
      cropperFlowTarget === 'swipe-image' ? pendingSwipeImageItem?.id ?? null : null;
    setShowUploadCropper(false);
    setPendingOriginalImageUri(null);
    setPendingOriginalImageSize(null);
    setPendingSwipeImageItem(null);
    setCropperFlowTarget('quick-add');
    setAddTab('image');
    if (cancelledSwipeItemId) {
      onSwipeImageCropCancel?.(cancelledSwipeItemId);
    }
    if (shouldReopenAddModal) {
      setShowAddModal(true);
    }
  }, [cropperFlowTarget, onSwipeImageCropCancel, pendingSwipeImageItem, setAddTab, setShowAddModal]);

  const handleUploadCropConfirm = React.useCallback(
    async (croppedUri: string) => {
      if (cropConfirmActiveRef.current) return;
      cropConfirmActiveRef.current = true;
      const originalUri = pendingOriginalImageUri;
      setShowUploadCropper(false);
      setPendingOriginalImageUri(null);
      setPendingOriginalImageSize(null);
      setPendingOpenCropperAfterAddDismiss(false);
      try {
        if (cropperFlowTarget === 'swipe-image' && pendingSwipeImageItem) {
          navigation.navigate('CreateCard', {
            cachedItem: pendingSwipeImageItem,
            croppedImageUri: croppedUri,
            originalImageUri: originalUri,
            runOcrOnLoad: true,
            isDefaultExperienceTutorial:
              isDefaultExperienceCard(pendingSwipeImageItem) || undefined,
          });
        } else {
          const quickItem = await createQuickImageCachedItem(croppedUri, originalUri);
          if (!quickItem) return;
          navigation.navigate('CreateCard', {
            cachedItem: quickItem,
            croppedImageUri: croppedUri,
            originalImageUri: originalUri,
            runOcrOnLoad: true,
          });
        }
        setPendingSwipeImageItem(null);
        setCropperFlowTarget('quick-add');
      } catch (error) {
        console.error('[CacheList] create quick image item failed:', error);
        Alert.alert('建立失敗', '無法建立圖片卡片，請稍後再試。');
      } finally {
        cropConfirmActiveRef.current = false;
      }
    },
    [
      createQuickImageCachedItem,
      cropperFlowTarget,
      navigation,
      pendingOriginalImageUri,
      pendingSwipeImageItem,
    ]
  );

  const handleInputModalDismiss = React.useCallback(() => {
    if (pendingOpenCropperAfterAddDismiss && pendingOriginalImageUri) {
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
    pendingOpenCameraAfterAddDismiss,
    pendingOpenCropperAfterAddDismiss,
    pendingOriginalImageUri,
    suppressAddModalAnimation,
  ]);

  const showConfirmTutorialArrow =
    cropperFlowTarget === 'swipe-image' &&
    pendingSwipeImageItem !== null &&
    isDefaultExperienceCard(pendingSwipeImageItem);

  return {
    creatingImage,
    showQuickCamera,
    quickCameraFacing,
    showUploadCropper,
    pendingOriginalImageUri,
    pendingOriginalImageSize,
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
    handleInputModalDismiss,
    queueQuickAddCropperAfterModalDismiss,
    openCropperForSwipeImage,
  };
}
