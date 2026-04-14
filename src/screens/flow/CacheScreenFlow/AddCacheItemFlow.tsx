import React from 'react';
import {
  View,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import ImageCropperModal from '../../../components/ImageCropperModal';
import CameraModalUI from '../../../components/UI/CacheScreenUI/CameraModalUI';
import { requireCurrentAuthUserId } from '@services/auth/userIdentity';

type Props = {
  navigation: any;
  route?: any;
};

export default function AddCacheItemScreen({ navigation, route }: Props) {
  const editingItem: CachedItem | undefined = route?.params?.cachedItem;
  const isEditMode = !!editingItem;
  const openCropOnLoad = Boolean(route?.params?.openCropOnLoad);
  const startMode = route?.params?.startMode as 'camera' | 'library' | undefined;
  const initialImageUri = route?.params?.initialImageUri as string | undefined;
  const originalImageUri = route?.params?.originalImageUri as string | undefined;
  const autoOpenCropper = Boolean(route?.params?.autoOpenCropper);
  const isQuickImageFlow = !isEditMode && (startMode === 'camera' || startMode === 'library');
  const isNoShellQuickFlow = true;

  const [contentType, setContentType] = React.useState<'text' | 'image'>(
    isQuickImageFlow ? 'image' : 'text'
  );
  const [contentText, setContentText] = React.useState('');
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);

  const [showCamera, setShowCamera] = React.useState(false);
  const [cameraFacing, setCameraFacing] = React.useState<CameraType>('back');
  const [showCropper, setShowCropper] = React.useState(Boolean(initialImageUri && autoOpenCropper));
  const [pendingCropImage, setPendingCropImage] = React.useState<string | null>(initialImageUri ?? null);
  const [saving, setSaving] = React.useState(false);
  const cameraRef = React.useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const goToCacheHome = React.useCallback(() => {
    if (typeof navigation?.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('CacheList');
  }, [navigation]);

  React.useEffect(() => {
    if (!editingItem) return;
    const nextContentType = editingItem.contentType === 'image' ? 'image' : 'text';
    setContentType(nextContentType);
    setContentText(editingItem.contentText ?? editingItem.contentUrl ?? '');

    const imgPath = editingItem.imageStoragePath ?? editingItem.mediaUri;
    if (imgPath) {
      setSelectedImage(imgPath);
    }
  }, [editingItem]);

  React.useEffect(() => {
    if (!isEditMode || !openCropOnLoad) return;
    const imgPath = editingItem?.imageStoragePath ?? editingItem?.mediaUri;
    if (!imgPath) return;
    setPendingCropImage(imgPath);
    setShowCropper(true);
  }, [isEditMode, openCropOnLoad, editingItem]);

  React.useEffect(() => {
    if (isEditMode) return;

    if (isQuickImageFlow) {
      setContentType('image');
    }

    if (initialImageUri && autoOpenCropper) {
      setPendingCropImage(initialImageUri);
      setShowCropper(true);
      return;
    }

    if (startMode === 'camera') {
      void takePhoto();
      return;
    }

    if (startMode === 'library') {
      void pickImage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenCropper, initialImageUri, isEditMode, isQuickImageFlow, startMode]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('權限需求', '需要相簿權限才能選擇圖片');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setPendingCropImage(result.assets[0].uri);
      setShowCropper(true);
      return;
    }

    if (isNoShellQuickFlow && !selectedImage) {
      goToCacheHome();
    }
  };

  const takePhoto = async () => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert('權限需求', '需要相機權限才能拍照', [
          {
            text: '確定',
            onPress: () => {
              if (isNoShellQuickFlow) {
                goToCacheHome();
              }
            },
          },
        ]);
        return;
      }
    }

    setShowCamera(true);
  };

  const closeCamera = React.useCallback(() => {
    setShowCamera(false);
    if (isNoShellQuickFlow && startMode === 'camera' && !selectedImage) {
      goToCacheHome();
    }
  }, [goToCacheHome, isNoShellQuickFlow, selectedImage, startMode]);

  const toggleCameraFacing = React.useCallback(() => {
    setCameraFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  }, []);

  const capturePhoto = React.useCallback(async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) {
        Alert.alert('拍照失敗', '請再試一次');
        return;
      }
      setShowCamera(false);
      setPendingCropImage(photo.uri);
      setShowCropper(true);
    } catch (error) {
      console.error('[AddCache] capture photo failed:', error);
      Alert.alert('拍照失敗', '請再試一次');
    }
  }, []);

  const handleCropConfirm = React.useCallback((croppedUri: string) => {
    setShowCropper(false);
    setPendingCropImage(null);
    setSelectedImage(croppedUri);
    setContentType('image');

    if (isNoShellQuickFlow) {
      void handleSave(croppedUri);
    }
  }, [isNoShellQuickFlow]);

  const handleCropCancel = React.useCallback(() => {
    setShowCropper(false);
    setPendingCropImage(null);
    if (isNoShellQuickFlow && !selectedImage) {
      goToCacheHome();
    }
  }, [goToCacheHome, isNoShellQuickFlow, selectedImage]);

  const handleSave = async (overrideImageUri?: string) => {
    const effectiveImage = overrideImageUri ?? selectedImage;

    if (!contentText.trim() && !effectiveImage) {
      Alert.alert('錯誤', '請輸入內容或選擇圖片');
      return;
    }

    await performSave(effectiveImage);
  };

  const applyItemFields = (item: CachedItem, effectiveImage: string | null) => {
    item.contentType = contentType;
    item.contentText = contentText || undefined;
    item.contentUrl = undefined;
    item.userKeywords = undefined;
    item.aiHighlightedTerms = undefined;

    if (effectiveImage) {
      item.imageStoragePath = effectiveImage;
      if (originalImageUri) {
        item.mediaUri = originalImageUri;
      }
    }
  };

  const performSave = async (effectiveImage: string | null) => {
    if (saving) return;
    setSaving(true);

    try {
      const userId = await requireCurrentAuthUserId();
      let createdItem: CachedItem | null = null;

      await database.write(async () => {
        if (isEditMode && editingItem) {
          await editingItem.update((item) => {
            applyItemFields(item, effectiveImage);
          });
        } else {
          const collection = database.get<CachedItem>('cached_items');
          createdItem = await collection.create((item) => {
            item.userId = userId;
            item.sourceApp = 'Manual Entry';
            item.convertedToCard = false;
            applyItemFields(item, effectiveImage);

            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 10);
            item.expiresAt = expiresAt;
          });
        }
      });

      if (isEditMode && editingItem) {
        navigation.replace('CreateCard', { cachedItem: editingItem });
        return;
      }

      if (!isEditMode && createdItem) {
        navigation.replace('CreateCard', { cachedItem: createdItem });
        return;
      }

      Alert.alert('成功', '已更新快取！', [
        {
          text: '確定',
          onPress: goToCacheHome,
        },
      ]);
    } catch (error) {
      console.error('Error saving cached item:', error);
      Alert.alert('錯誤', '保存失敗，請重試');
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, isNoShellQuickFlow && styles.quickFlowContainer]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.quickFlowBackdrop} pointerEvents="none" />

      <CameraModalUI
        visible={showCamera}
        hasPermission={Boolean(cameraPermission?.granted)}
        cameraRef={cameraRef}
        facing={cameraFacing}
        onClose={closeCamera}
        onToggleFacing={toggleCameraFacing}
        onCapture={capturePhoto}
      />

      <ImageCropperModal
        visible={showCropper}
        imageUri={pendingCropImage}
        modalAnimationType="slide"
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  quickFlowContainer: {
    backgroundColor: 'transparent',
  },
  quickFlowBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
