import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image as RNImage,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import ImageOCRViewer from '../../../components/ImageOCRViewer';
import LocalAiKeywordSuggestions from '../../../components/LocalAiKeywordSuggestions';
import ImageCropperModal from '../../../components/ImageCropperModal';
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

      {/* OCR Viewer Modal（Tech Stack v1.5.0）*/}
      {showOCRViewer && (
        <Modal
          visible={showOCRViewer}
          animationType={isNoShellQuickFlow ? 'none' : 'slide'}
          onRequestClose={() => setShowOCRViewer(false)}
          presentationStyle="fullScreen"
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  console.log('[AddCache] Closing OCR viewer, blocks:', ocrBlocks.length);
                  setShowOCRViewer(false);
                  if (isNoShellQuickFlow) {
                    void handleSave();
                  }
                }}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✓ 完成</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>選擇要學習的文字</Text>
              <Text style={styles.modalCloseText}>
                {selectedBlockIndexes.length > 0 ? `已選 ${selectedBlockIndexes.length}` : `${ocrBlocks.length} 個`}
              </Text>
            </View>

            {selectedImage ? (
              <ImageOCRViewer
                imageUri={selectedImage}
                onSelectionChange={handleSelectionChange}
                onOCRComplete={handleOCRComplete}
                initialSelectedIndexes={selectedBlockIndexes}
                learningGoal={learningGoal}
                keywords={keywords}
                onKeywordsChange={setKeywords}
              />
            ) : (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>⚠️ 圖片載入失敗</Text>
              </View>
            )}
          </View>
        </Modal>
      )}

      <Modal
        visible={showCamera}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeCamera}
      >
        <View style={styles.cameraContainer}>
          {cameraPermission?.granted ? (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={cameraFacing}
            />
          ) : (
            <View style={styles.cameraPermissionFallback}>
              <Text style={styles.cameraPermissionText}>需要相機權限才能拍照</Text>
            </View>
          )}

          <View style={styles.cameraTopBar}>
            <TouchableOpacity style={styles.cameraTopButton} onPress={closeCamera}>
              <Text style={styles.cameraTopButtonText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cameraTopButton} onPress={toggleCameraFacing}>
              <Text style={styles.cameraTopButtonText}>↺</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cameraBottomBar}>
            <TouchableOpacity
              style={styles.shutterOuter}
              onPress={capturePhoto}
              disabled={!cameraPermission?.granted}
            >
              <View style={styles.shutterInner} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  quickFlowBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  typeButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 150,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  imageButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  imageButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
  },
  imageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  imagePreview: {
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#f0f0f0',
  },
  ocrHint: {
    fontSize: 12,
    color: '#2196F3',
    backgroundColor: '#E3F2FD',
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
    fontStyle: 'italic',
  },
  analyzingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    marginTop: 8,
  },
  analyzingText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '500',
  },
  aiResultContainer: {
    backgroundColor: '#f1f8e9',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  aiResultTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#33691e',
    marginBottom: 4,
  },
  aiResultText: {
    fontSize: 12,
    color: '#558b2f',
    lineHeight: 18,
  },
  imageActions: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'column',
    gap: 8,
  },
  annotateButton: {
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  annotateButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  cropButton: {
    backgroundColor: 'rgba(33, 150, 243, 0.92)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  cropButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  removeImageButton: {
    backgroundColor: 'rgba(244, 67, 54, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  removeImageText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalCloseButton: {
    paddingVertical: 8,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraPermissionFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  cameraPermissionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraTopBar: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  cameraTopButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraTopButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  cameraBottomBar: {
    position: 'absolute',
    bottom: 42,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutterOuter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
});
