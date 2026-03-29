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
import OCRViewerModalUI from '../../../components/UI/CacheScreenUI/OCRViewerModalUI';
import {
  buildKeywordsWithSelectionMarker,
  extractKeywordText,
  parseSelectedBlockIndexes,
} from '../../../services/ocr/selectionMarkers';
import {
  getEffectiveLearningGoal,
  loadUserSettings,
} from '../../../services/settings/userSettings';
import { type OCRBlock } from '../../../services/ocr/ocrService';
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
  const openOcrOnLoad = Boolean(route?.params?.openOcrOnLoad);
  const isQuickImageFlow = !isEditMode && (startMode === 'camera' || startMode === 'library');
  const isNoShellQuickFlow = true;

  const [contentType, setContentType] = React.useState<'text' | 'image'>(
    isQuickImageFlow ? 'image' : 'text'
  );
  const [contentText, setContentText] = React.useState('');
  const [keywords, setKeywords] = React.useState('');
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
  
  // Tech Stack v1.5.0: 儲存 OCR blocks 而非手動標註
  const [ocrBlocks, setOCRBlocks] = React.useState<OCRBlock[]>([]);
  const [selectedBlockIndexes, setSelectedBlockIndexes] = React.useState<number[]>([]);
  
  const [showOCRViewer, setShowOCRViewer] = React.useState(false);
  const [showCamera, setShowCamera] = React.useState(false);
  const [cameraFacing, setCameraFacing] = React.useState<CameraType>('back');
  const [showCropper, setShowCropper] = React.useState(Boolean(initialImageUri && autoOpenCropper));
  const [pendingCropImage, setPendingCropImage] = React.useState<string | null>(initialImageUri ?? null);
  const [saving, setSaving] = React.useState(false);
  const [aiAnalysisResult, setAIAnalysisResult] = React.useState<any>(null);
  const [learningGoal, setLearningGoal] = React.useState<'ielts' | 'casual' | 'professional'>('ielts');
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
    let active = true;
    const loadGoal = async () => {
      const settings = await loadUserSettings();
      if (!active) return;
      setLearningGoal(getEffectiveLearningGoal(settings));
    };
    void loadGoal();
    return () => {
      active = false;
    };
  }, []);

  // 編輯模式：預填現有資料
  React.useEffect(() => {
    if (!editingItem) return;
    const nextContentType = editingItem.contentType === 'image' ? 'image' : 'text';
    setContentType(nextContentType);
    setContentText(editingItem.contentText ?? editingItem.contentUrl ?? '');

    // 關鍵字：移除 [block:X]/[blocks:X,Y] 標記只顯示純文字
    if (editingItem.userKeywords) {
      setKeywords(extractKeywordText(editingItem.userKeywords));
      setSelectedBlockIndexes(parseSelectedBlockIndexes(editingItem.userKeywords));
    }

    // 圖片：Share Extension 使用 mediaUri，手動新增使用 imageStoragePath
    const imgPath = editingItem.imageStoragePath ?? editingItem.mediaUri;
    if (imgPath) {
      setSelectedImage(imgPath);
    }

    // OCR blocks
    const annotations = editingItem.imageAnnotations;
    if (Array.isArray(annotations) && annotations.length > 0) {
      setOCRBlocks(annotations as unknown as OCRBlock[]);
    } else if (typeof annotations === 'string') {
      try {
        const parsed = JSON.parse(annotations);
        if (Array.isArray(parsed)) setOCRBlocks(parsed as OCRBlock[]);
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!isEditMode || !openCropOnLoad) return;
    const imgPath = editingItem?.imageStoragePath ?? editingItem?.mediaUri;
    if (!imgPath) return;
    setPendingCropImage(imgPath);
    setShowOCRViewer(false);
    setShowCropper(true);
  }, [isEditMode, openCropOnLoad, editingItem]);

  React.useEffect(() => {
    if (isEditMode) return;
    if (isQuickImageFlow) {
      setContentType('image');
    }
    if (initialImageUri && openOcrOnLoad) {
      setSelectedImage(initialImageUri);
      setShowOCRViewer(true);
      return;
    }
    if (initialImageUri && autoOpenCropper) {
      setPendingCropImage(initialImageUri);
      setShowOCRViewer(false);
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
  }, [autoOpenCropper, initialImageUri, isEditMode, isQuickImageFlow, openOcrOnLoad, startMode]);

  /**
   * OCR 完成後儲存 blocks，不再自動預選任何文字
   */
  const handleOCRComplete = React.useCallback((blocks: OCRBlock[]) => {
    setOCRBlocks(blocks);
  }, []);

  /**
   * 處理用戶點擊 OCR 文字塊（Tech Stack v1.5.0 第 146-150 行）
   */
  const handleSelectionChange = React.useCallback((indexes: number[], blocks: OCRBlock[]) => {
    setSelectedBlockIndexes(indexes);
    const selectedTexts = indexes
      .map((index) => blocks[index]?.text?.trim())
      .filter((text): text is string => Boolean(text));
    setKeywords(selectedTexts.join(', '));
  }, []);

  const pickImage = async () => {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('權限需求', '需要相簿權限才能選擇圖片');
      return;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1, // 高品質以利 OCR
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
    console.log('[AddCache] Crop confirmed:', croppedUri);
    setShowCropper(false);
    setPendingCropImage(null);
    setSelectedImage(croppedUri);
    setContentType('image');
    setTimeout(() => {
      setShowOCRViewer(true);
    }, 250);
  }, []);

  const handleCropCancel = React.useCallback(() => {
    setShowCropper(false);
    setPendingCropImage(null);
    if (isNoShellQuickFlow && !selectedImage) {
      goToCacheHome();
    }
  }, [goToCacheHome, isNoShellQuickFlow, selectedImage]);

  const handleSave = async () => {
    if (!contentText.trim() && !selectedImage) {
      Alert.alert('錯誤', '請輸入內容或選擇圖片');
      return;
    }

    // 圖片類型且未選擇文字時，提示用戶
    if (contentType === 'image' && selectedImage && selectedBlockIndexes.length === 0) {
      Alert.alert(
        '提示',
        '您還沒有選擇要學習的文字。要繼續嗎？',
        [
          { text: '選擇文字', style: 'cancel' },
          { 
            text: '直接保存', 
            onPress: () => performSave() 
          },
        ]
      );
      return;
    }

    await performSave();
  };

  const applyItemFields = (item: CachedItem) => {
    item.contentType = contentType;
    item.contentText = contentText || undefined;
    item.contentUrl = undefined;
    item.userKeywords = extractKeywordText(keywords) || undefined;

    if (ocrBlocks.length > 0) {
      item.imageAnnotations = ocrBlocks as any;
    }

    item.userKeywords = buildKeywordsWithSelectionMarker(keywords, selectedBlockIndexes) || undefined;
    item.aiHighlightedTerms = undefined;

    if (aiAnalysisResult) {
      item.aiAnalysisCompleted = true;
    }

    if (selectedImage) {
      item.imageStoragePath = selectedImage;
      if (originalImageUri) {
        item.mediaUri = originalImageUri;
      }
    }
  };

  const performSave = async () => {
    setSaving(true);

    try {
      const userId = await requireCurrentAuthUserId();
      let createdItem: CachedItem | null = null;
      await database.write(async () => {
        if (isEditMode && editingItem) {
          // 編輯模式：更新現有項目
          await editingItem.update((item) => {
            applyItemFields(item);
          });
        } else {
          // 新增模式：建立新項目
          const collection = database.get<CachedItem>('cached_items');
          createdItem = await collection.create((item) => {
            item.userId = userId;
            item.sourceApp = 'Manual Entry';
            item.convertedToCard = false;
            applyItemFields(item);

            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 10);
            item.expiresAt = expiresAt;
          });
        }
      });

      // 由 Cache 圖片流程進入（openCropOnLoad）時，保存後直接前往 Create Card
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

      <OCRViewerModalUI
        visible={showOCRViewer}
        noShellQuickFlow={isNoShellQuickFlow}
        selectedImage={selectedImage}
        ocrBlocks={ocrBlocks}
        selectedBlockIndexes={selectedBlockIndexes}
        learningGoal={learningGoal}
        keywords={keywords}
        onCloseRequest={() => setShowOCRViewer(false)}
        onDonePress={() => {
          console.log('[AddCache] Closing OCR viewer, blocks:', ocrBlocks.length);
          setShowOCRViewer(false);
          if (isNoShellQuickFlow) {
            void handleSave();
          }
        }}
        onSelectionChange={handleSelectionChange}
        onOCRComplete={handleOCRComplete}
        onKeywordsChange={setKeywords}
      />

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
