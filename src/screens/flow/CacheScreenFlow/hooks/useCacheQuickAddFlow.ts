import React from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import { getCurrentAuthUserId } from '@services/auth/userIdentity';

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
  const [suppressAddModalAnimation, setSuppressAddModalAnimation] = React.useState(false);

  const quickCameraRef = React.useRef<CameraView | null>(null);
  const [quickCameraPermission, requestQuickCameraPermission] = useCameraPermissions();

  const createQuickImageCachedItems = React.useCallback(
    async (imageUris: string[]): Promise<string[]> => {
      const userId = await getCurrentAuthUserId();
      if (!userId) {
        Alert.alert('需要登入', '請先登入後再建立圖片卡片。');
        return [];
      }

      const validUris = imageUris.filter(Boolean);
      if (validUris.length === 0) return [];

      const collection = database.get<CachedItem>('cached_items');
      const preparedItems = validUris.map((uri) =>
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
    try {
      setCreatingImage(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('需要相簿權限', '請允許相簿權限後再上傳圖片。');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 20,
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;

      const pickedAssets = result.assets.filter((asset) => Boolean(asset.uri));
      if (pickedAssets.length === 0) return;

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
      setCreatingImage(false);
    }
  }, [createQuickImageCachedItems, onBatchQuickAddCreated, setShowAddModal]);

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
    setShowAddModal(false);
    setShowQuickCamera(true);
  }, [quickCameraPermission?.granted, requestQuickCameraPermission, setShowAddModal]);

  const closeQuickCamera = React.useCallback(() => {
    setShowQuickCamera(false);
  }, []);

  const toggleQuickCameraFacing = React.useCallback(() => {
    setQuickCameraFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  }, []);

  const captureQuickPhoto = React.useCallback(async () => {
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
    }
  }, [setShowAddModal]);

  const createQuickImageCachedItem = React.useCallback(
    async (croppedUri: string, originalUri?: string | null): Promise<CachedItem | null> => {
      const userId = await getCurrentAuthUserId();
      if (!userId) {
        Alert.alert('需要登入', '請先登入後再建立圖片卡片。');
        return null;
      }

      let createdItem: CachedItem | null = null;
      await database.write(async () => {
        const collection = database.get<CachedItem>('cached_items');
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
      const originalUri = pendingOriginalImageUri;
      setShowUploadCropper(false);
      setPendingOriginalImageUri(null);
      setPendingOriginalImageSize(null);
      setPendingOpenCropperAfterAddDismiss(false);
      if (cropperFlowTarget === 'swipe-image' && pendingSwipeImageItem) {
        navigation.navigate('CreateCard', {
          cachedItem: pendingSwipeImageItem,
          croppedImageUri: croppedUri,
          originalImageUri: originalUri,
          runOcrOnLoad: true,
        });
      } else {
        try {
          const quickItem = await createQuickImageCachedItem(croppedUri, originalUri);
          if (!quickItem) return;
          navigation.navigate('CreateCard', {
            cachedItem: quickItem,
            croppedImageUri: croppedUri,
            originalImageUri: originalUri,
          });
        } catch (error) {
          console.error('[CacheList] create quick image item failed:', error);
          Alert.alert('建立失敗', '無法建立圖片卡片，請稍後再試。');
          return;
        }
      }
      setPendingSwipeImageItem(null);
      setCropperFlowTarget('quick-add');
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
    if (suppressAddModalAnimation) {
      setSuppressAddModalAnimation(false);
    }
  }, [pendingOpenCropperAfterAddDismiss, pendingOriginalImageUri, suppressAddModalAnimation]);

  return {
    creatingImage,
    showQuickCamera,
    quickCameraFacing,
    showUploadCropper,
    pendingOriginalImageUri,
    pendingOriginalImageSize,
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
