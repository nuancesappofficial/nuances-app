import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Alert, AppState, type AppStateStatus } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { Q } from '@nozbe/watermelondb';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import { pasteTextFromClipboard } from '@services/clipboard/clipboardService';
import { getCurrentAuthUserId } from '@services/auth/userIdentity';
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
  cachedItem: CachedItem;
};

export default function CacheScreenFlow({ navigation }: Props) {
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const [cacheItems, setCacheItems] = useState<CachedItem[]>([]);
  const [animationSeed, setAnimationSeed] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'text' | 'image'>('text');
  const [manualText, setManualText] = useState('');
  const [creatingImage, setCreatingImage] = useState(false);
  const [showQuickCamera, setShowQuickCamera] = useState(false);
  const [quickCameraFacing, setQuickCameraFacing] = useState<CameraType>('back');
  const [showUploadCropper, setShowUploadCropper] = useState(false);
  const [pendingOriginalImageUri, setPendingOriginalImageUri] = useState<string | null>(null);
  const [pendingOriginalImageSize, setPendingOriginalImageSize] = useState<{ width: number; height: number } | null>(null);
  const [pendingOpenCropperAfterAddDismiss, setPendingOpenCropperAfterAddDismiss] = useState(false);
  const [suppressAddModalAnimation, setSuppressAddModalAnimation] = useState(false);
  const quickCameraRef = React.useRef<CameraView | null>(null);
  const [quickCameraPermission, requestQuickCameraPermission] = useCameraPermissions();
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);
  const deletingItemIdsRef = React.useRef(new Set<string>());

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
    return [...cacheItems].reverse().map((item) => {
      const text = (
        item.contentText?.trim() ||
        item.userKeywords?.trim() ||
        item.contentUrl?.trim() ||
        'No content'
      );
      const imageUri =
        item.imageStoragePath ||
        item.mediaUri ||
        (item.contentType === 'image' ? item.contentUrl || undefined : undefined);

      return {
        id: item.id,
        imageUri,
        text,
        cachedItem: item,
      };
    });
  }, [cacheItems]);

  const stackCards = useMemo(() => {
    return cards.map((item) => ({
      id: item.id,
      imageUri: item.imageUri,
      text: item.text,
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
      Alert.alert('成功', '已新增文字快取');
    } catch (error) {
      console.error('[CacheList] quick add text failed:', error);
      Alert.alert('新增失敗', '無法新增文字快取，請稍後再試。');
    }
  }, [manualText]);

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
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const picked = result.assets[0];
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
  }, []);

  const handleCaptureImage = React.useCallback(async () => {
    if (!quickCameraPermission?.granted) {
      const permission = await requestQuickCameraPermission();
      if (!permission.granted) {
        Alert.alert('需要相機權限', '請允許相機權限後再拍照。');
        return;
      }
    }
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
      navigation.navigate('AddCacheItem', {
        startMode: 'library',
        initialImageUri: photo.uri,
        originalImageUri: photo.uri,
        autoOpenCropper: true,
      });
    } catch (error) {
      console.error('[CacheList] quick camera capture failed:', error);
      Alert.alert('拍照失敗', '請再試一次');
    }
  }, [navigation]);

  const handleUploadCropCancel = React.useCallback(() => {
    setShowUploadCropper(false);
    setPendingOriginalImageUri(null);
    setPendingOriginalImageSize(null);
    setAddTab('image');
    setShowAddModal(true);
  }, []);

  const handleUploadCropConfirm = React.useCallback(
    (croppedUri: string) => {
      const originalUri = pendingOriginalImageUri;
      setShowUploadCropper(false);
      setPendingOriginalImageUri(null);
      setPendingOriginalImageSize(null);
      navigation.navigate('AddCacheItem', {
        startMode: 'library',
        initialImageUri: croppedUri,
        originalImageUri: originalUri,
        openOcrOnLoad: true,
      });
    },
    [navigation, pendingOriginalImageUri]
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

  const softDeleteCacheItem = React.useCallback(async (item: CachedItem) => {
    if (deletingItemIdsRef.current.has(item.id)) return;
    deletingItemIdsRef.current.add(item.id);
    try {
      await database.write(async () => {
        await item.update((record) => {
          record.deletedAt = new Date();
        });
      });
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
        navigation.navigate('CreateCard', { cachedItem: target.cachedItem });
      }

      void softDeleteCacheItem(target.cachedItem);
    },
    [cards, navigation, softDeleteCacheItem]
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <CacheStackUI
        cards={stackCards}
        animationSeed={animationSeed}
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
    backgroundColor: '#91c9f9',
  },
});
