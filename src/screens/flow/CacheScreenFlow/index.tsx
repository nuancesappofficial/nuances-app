import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, AppState, type AppStateStatus } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { Q } from '@nozbe/watermelondb';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import { pasteTextFromClipboard } from '@services/clipboard/clipboardService';
import { getCurrentAuthUserId } from '@services/auth/userIdentity';
import { syncWithRetry } from '@services/sync';
import ImageCropperModal from '../../../components/ImageCropperModal';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import CacheStackUI from '../../../components/UI/CacheScreenUI/CacheStackUI';
import CacheInputModalUI from '../../../components/UI/CacheScreenUI/CacheInputModalUI';
import CameraModalUI from '../../../components/UI/CacheScreenUI/CameraModalUI';

type Props = {
  navigation: any;
};

type CacheCardRecord = {
  id: string;
  imageUri?: string;
  text: string;
  sourceLabel: string;
  importedAtLabel: string;
  cachedItem: CachedItem;
};

type CropperFlowTarget = 'quick-add' | 'swipe-image';

function toSourceLabel(sourceApp?: string | null): string {
  const value = (sourceApp || '').trim().toLowerCase();
  if (!value) return 'Unknown';

  if (value === 'share_sheet' || value === 'share sheet') return 'Share Sheet';
  if (value === 'clipboard') return 'Clipboard';
  if (value === 'manual entry') return 'Manual Entry';
  if (value === 'quick add') return 'Quick Add';
  if (value === 'camera') return 'Camera';

  return sourceApp || 'Unknown';
}

function toRelativeImportTime(createdAt?: Date | null): string {
  if (!createdAt) return 'Unknown time';
  const ts = createdAt.getTime();
  if (!Number.isFinite(ts)) return 'Unknown time';

  const diffMs = Date.now() - ts;
  if (diffMs < 0) return 'Just now';

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'Just now';

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;

  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} hr ago`;

  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} d ago`;

  const week = Math.floor(day / 7);
  if (week < 5) return `${week} wk ago`;

  const month = Math.floor(day / 30);
  if (month < 12) return `${month} mo ago`;

  const year = Math.floor(day / 365);
  return `${year} yr ago`;
}

export default function CacheScreenFlow({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const [cacheItems, setCacheItems] = useState<CachedItem[]>([]);
  const [animationSeed, setAnimationSeed] = useState(0);
  const [restoreSeed, setRestoreSeed] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'text' | 'image'>('text');
  const [manualText, setManualText] = useState('');
  const [creatingImage, setCreatingImage] = useState(false);
  const [showQuickCamera, setShowQuickCamera] = useState(false);
  const [quickCameraFacing, setQuickCameraFacing] = useState<CameraType>('back');
  const [showUploadCropper, setShowUploadCropper] = useState(false);
  const [cropperFlowTarget, setCropperFlowTarget] = useState<CropperFlowTarget>('quick-add');
  const [pendingOriginalImageUri, setPendingOriginalImageUri] = useState<string | null>(null);
  const [pendingOriginalImageSize, setPendingOriginalImageSize] = useState<{ width: number; height: number } | null>(null);
  const [pendingSwipeImageItem, setPendingSwipeImageItem] = useState<CachedItem | null>(null);
  const [pendingOpenCropperAfterAddDismiss, setPendingOpenCropperAfterAddDismiss] = useState(false);
  const [suppressAddModalAnimation, setSuppressAddModalAnimation] = useState(false);
  const quickCameraRef = React.useRef<CameraView | null>(null);
  const [quickCameraPermission, requestQuickCameraPermission] = useCameraPermissions();
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);
  const deletingItemIdsRef = React.useRef(new Set<string>());
  const hasFocusedOnceRef = React.useRef(false);

  const openAddModal = React.useCallback(() => {
    setShowAddModal(true);
  }, []);

  useEffect(() => {
    if (!tabSwipeContext) return;
    tabSwipeContext.setCacheAddActionHandler(openAddModal);
    return () => {
      tabSwipeContext.setCacheAddActionHandler(null);
    };
  }, [openAddModal, tabSwipeContext]);

  useEffect(() => {
    const query = database
      .get<CachedItem>('cached_items')
      .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

    const load = async () => {
      try {
        const data = await query.fetch();
        setCacheItems(data);
      } catch (error) {
        console.error('[CacheList] load cached items failed:', error);
        setCacheItems([]);
      }
    };

    void load();
    const sub = query.observe().subscribe((data) => setCacheItems(data));
    return () => sub.unsubscribe();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (hasFocusedOnceRef.current) {
        setRestoreSeed((prev) => prev + 1);
      } else {
        hasFocusedOnceRef.current = true;
      }
    }, [])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      if ((prevState === 'background' || prevState === 'inactive') && nextState === 'active') {
        setAnimationSeed((prev) => prev + 1);
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const cards = useMemo<CacheCardRecord[]>(() => {
    return [...cacheItems].reverse().reduce<CacheCardRecord[]>((acc, item) => {
        const text = (
          item.contentText?.trim() ||
          item.userKeywords?.trim() ||
          item.contentUrl?.trim() ||
          ''
        );
        const imageUri =
          item.imageStoragePath ||
          item.mediaUri ||
          (item.contentType === 'image' ? item.contentUrl || undefined : undefined);

        const hasText = text.length > 0;
        const hasImageSource = Boolean(imageUri);
        if (!hasText && !hasImageSource) {
          return acc;
        }

        acc.push({
          id: item.id,
          imageUri,
          text: hasText ? text : 'Image unavailable',
          sourceLabel: toSourceLabel(item.sourceApp),
          importedAtLabel: toRelativeImportTime(item.createdAt),
          cachedItem: item,
        });
        return acc;
      }, []);
  }, [cacheItems]);

  const stackCards = useMemo(() => {
    return cards.map((item) => ({
      id: item.id,
      imageUri: item.imageUri,
      text: item.text,
      sourceLabel: item.sourceLabel,
      importedAtLabel: item.importedAtLabel,
    }));
  }, [cards]);

  const handleQuickAddText = React.useCallback(async () => {
    const trimmed = manualText.trim();
    if (!trimmed) return;
    try {
      await Clipboard.setStringAsync(trimmed);
      const userId = await getCurrentAuthUserId();
      if (!userId) {
        Alert.alert('需要登入', '請先登入後再使用文字新增。');
        return;
      }
      const result = await pasteTextFromClipboard(userId);
      if (!result.success) {
        Alert.alert('新增失敗', result.message || '無法新增文字快取。');
        return;
      }
      setManualText('');
      setShowAddModal(false);
    } catch (error) {
      console.error('[CacheList] quick add text failed:', error);
      Alert.alert('新增失敗', '無法新增文字快取，請稍後再試。');
    }
  }, [manualText]);

  const createQuickImageCachedItems = React.useCallback(
    async (imageUris: string[]): Promise<number> => {
      const userId = await getCurrentAuthUserId();
      if (!userId) {
        Alert.alert('需要登入', '請先登入後再建立圖片卡片。');
        return 0;
      }

      const validUris = imageUris.filter(Boolean);
      if (validUris.length === 0) return 0;

      await database.write(async () => {
        const collection = database.get<CachedItem>('cached_items');
        for (const uri of validUris) {
          await collection.create((item) => {
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

            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 10);
            item.expiresAt = expiresAt;
          });
        }
      });

      return validUris.length;
    },
    []
  );

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

      if (pickedAssets.length > 1) {
        try {
          const createdCount = await createQuickImageCachedItems(
            pickedAssets.map((asset) => asset.uri).filter(Boolean) as string[]
          );
          if (createdCount > 0) {
            setShowAddModal(false);
          } else {
            Alert.alert('新增失敗', '沒有成功新增任何圖片快取。');
          }
        } catch (error) {
          console.error('[CacheList] batch image create failed:', error);
          Alert.alert('新增失敗', '批次新增圖片快取失敗，請稍後再試。');
        }
        return;
      }

      const picked = pickedAssets[0];
      setCropperFlowTarget('quick-add');
      setPendingSwipeImageItem(null);
      setPendingOriginalImageUri(picked.uri);
      setPendingOriginalImageSize(
        typeof picked.width === 'number' && typeof picked.height === 'number'
          ? { width: picked.width, height: picked.height }
          : null
      );
      setPendingOpenCropperAfterAddDismiss(true);
      setSuppressAddModalAnimation(true);
      setShowAddModal(false);
    } catch (error) {
      console.error('[CacheList] upload picker failed:', error);
      Alert.alert('圖片選擇失敗', '無法開啟相簿，請稍後再試。');
    } finally {
      setCreatingImage(false);
    }
  }, [createQuickImageCachedItems]);

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
  }, [quickCameraPermission?.granted, requestQuickCameraPermission]);

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
  }, []);

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
    setShowUploadCropper(false);
    setPendingOriginalImageUri(null);
    setPendingOriginalImageSize(null);
    setPendingSwipeImageItem(null);
    setCropperFlowTarget('quick-add');
    setAddTab('image');
    if (shouldReopenAddModal) {
      setShowAddModal(true);
    }
  }, [cropperFlowTarget]);

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
            runOcrOnLoad: true,
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

  const deleteCacheItemPermanently = React.useCallback(async (item: CachedItem) => {
    if (deletingItemIdsRef.current.has(item.id)) return;
    deletingItemIdsRef.current.add(item.id);
    try {
      await database.write(async () => {
        await item.markAsDeleted();
      });
      const syncResult = await syncWithRetry(2);
      if (!syncResult.success) {
        console.error('[CacheList] delete sync failed:', syncResult.message || syncResult.error);
      }
    } catch (error) {
      console.error('[CacheList] delete cache item failed:', error);
    } finally {
      deletingItemIdsRef.current.delete(item.id);
    }
  }, []);

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
          setCropperFlowTarget('swipe-image');
          setPendingSwipeImageItem(target.cachedItem);
          setPendingOriginalImageUri(imageUri);
          setPendingOriginalImageSize(null);
          setShowUploadCropper(true);
          return;
        }

        navigation.navigate('CreateCard', { cachedItem: target.cachedItem });
        return;
      }

      void deleteCacheItemPermanently(target.cachedItem);
    },
    [cards, deleteCacheItemPermanently, navigation]
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <View pointerEvents="none" style={[styles.brandWrap, { top: insets.top + 6 }]}>
        <Text style={styles.brandText}>Nuances</Text>
      </View>

      <CacheStackUI
        cards={stackCards}
        animationSeed={animationSeed}
        restoreSeed={restoreSeed}
        onCardSwipe={handleCardSwipe}
      />

      <CacheInputModalUI
        visible={showAddModal}
        suppressAnimation={suppressAddModalAnimation}
        addTab={addTab}
        manualText={manualText}
        creatingImage={creatingImage}
        onClose={() => setShowAddModal(false)}
        onDismiss={handleInputModalDismiss}
        onTabChange={setAddTab}
        onManualTextChange={setManualText}
        onSubmitText={handleQuickAddText}
        onUploadImage={() => void handleUploadImageDirect()}
        onCaptureImage={handleCaptureImage}
      />

      <ImageCropperModal
        visible={showUploadCropper}
        imageUri={pendingOriginalImageUri}
        initialImageSize={pendingOriginalImageSize}
        modalAnimationType="slide"
        onCancel={handleUploadCropCancel}
        onConfirm={handleUploadCropConfirm}
      />

      <CameraModalUI
        visible={showQuickCamera}
        hasPermission={Boolean(quickCameraPermission?.granted)}
        cameraRef={quickCameraRef}
        facing={quickCameraFacing}
        onClose={closeQuickCamera}
        onToggleFacing={toggleQuickCameraFacing}
        onCapture={() => void captureQuickPhoto()}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  brandWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 12,
    alignItems: 'center',
  },
  brandText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
