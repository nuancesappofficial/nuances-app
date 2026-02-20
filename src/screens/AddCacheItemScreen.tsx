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
import ImageOCRViewer from '../components/ImageOCRViewer';
import ImageCropperModal from '../components/ImageCropperModal';
import {
  buildKeywordsWithSelectionMarker,
  extractKeywordText,
  parseSelectedBlockIndexes,
} from '../services/ocr/selectionMarkers';
import {
  getEffectiveLearningGoal,
  loadUserSettings,
} from '../services/settings/userSettings';
import { type OCRBlock } from '../services/ocr/ocrService';
import { requireCurrentAuthUserId } from '@services/auth/userIdentity';

type Props = {
  navigation: any;
  route?: any;
};

export default function AddCacheItemScreen({ navigation, route }: Props) {
  const editingItem: CachedItem | undefined = route?.params?.cachedItem;
  const isEditMode = !!editingItem;
  const openCropOnLoad = Boolean(route?.params?.openCropOnLoad);

  const [contentType, setContentType] = React.useState<
    'text' | 'url' | 'image'
  >('text');
  const [contentText, setContentText] = React.useState('');
  const [contentUrl, setContentUrl] = React.useState('');
  const [keywords, setKeywords] = React.useState('');
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
  
  // Tech Stack v1.5.0: 儲存 OCR blocks 而非手動標註
  const [ocrBlocks, setOCRBlocks] = React.useState<OCRBlock[]>([]);
  const [selectedBlockIndexes, setSelectedBlockIndexes] = React.useState<number[]>([]);
  
  const [showOCRViewer, setShowOCRViewer] = React.useState(false);
  const [showCamera, setShowCamera] = React.useState(false);
  const [cameraFacing, setCameraFacing] = React.useState<CameraType>('back');
  const [showCropper, setShowCropper] = React.useState(false);
  const [pendingCropImage, setPendingCropImage] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [aiAnalysisResult, setAIAnalysisResult] = React.useState<any>(null);
  const [learningGoal, setLearningGoal] = React.useState<'ielts' | 'casual' | 'professional'>('ielts');
  const cameraRef = React.useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

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
    setContentType((editingItem.contentType as 'text' | 'url' | 'image') ?? 'text');
    setContentText(editingItem.contentText ?? '');
    setContentUrl(editingItem.contentUrl ?? '');

    // 關鍵字：移除 [block:X]/[blocks:X,Y] 標記只顯示純文字
    if (editingItem.userKeywords) {
      setKeywords(extractKeywordText(editingItem.userKeywords));
      setSelectedBlockIndexes(parseSelectedBlockIndexes(editingItem.userKeywords));
    }

    // 圖片：Share Extension 使用 mediaUri，手動新增使用 imageStoragePath
    const imgPath = editingItem.imageStoragePath ?? editingItem.mediaUri;
    if (imgPath) {
      setSelectedImage(imgPath);
      // 如果 contentUrl 為空（Share Extension 情況），回填圖片路徑以通過驗證
      if (!editingItem.contentUrl) {
        setContentUrl(imgPath);
      }
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

  /**
   * OCR 完成後儲存 blocks（AI 推薦詞彙功能暫時關閉）
   */
  const handleOCRComplete = React.useCallback((blocks: OCRBlock[]) => {
    setOCRBlocks(blocks);
    // 保留於本地，待後續擴充推薦詞功能
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
    }
  };

  const takePhoto = async () => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert('權限需求', '需要相機權限才能拍照');
        return;
      }
    }

    setShowCamera(true);
  };

  const closeCamera = React.useCallback(() => {
    setShowCamera(false);
  }, []);

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
    setContentUrl(croppedUri);
    setContentType('image');
    setTimeout(() => {
      setShowOCRViewer(true);
    }, 250);
  }, []);

  const handleCropCancel = React.useCallback(() => {
    setShowCropper(false);
    setPendingCropImage(null);
  }, []);

  const handleSave = async () => {
    if (!contentText && !contentUrl && !selectedImage) {
      Alert.alert('錯誤', '請輸入內容、URL 或選擇圖片');
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
    item.contentUrl = contentUrl || undefined;
    item.userKeywords = extractKeywordText(keywords) || undefined;

    if (ocrBlocks.length > 0) {
      item.imageAnnotations = ocrBlocks as any;
    }

    item.userKeywords = buildKeywordsWithSelectionMarker(keywords, selectedBlockIndexes) || undefined;
    item.aiHighlightedTerms = selectedBlockIndexes
      .map((index) => ocrBlocks[index]?.text?.trim())
      .filter((text): text is string => Boolean(text));

    if (aiAnalysisResult) {
      item.aiAnalysisCompleted = true;
    }

    if (selectedImage) {
      item.imageStoragePath = selectedImage;
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
            expiresAt.setHours(expiresAt.getHours() + 24);
            item.expiresAt = expiresAt;
          });
        }
      });

      // 由 Cache 圖片流程進入（openCropOnLoad）時，保存後直接前往 Create Card
      if (isEditMode && editingItem && openCropOnLoad) {
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
          onPress: () => navigation.goBack(),
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
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditMode ? '編輯快取' : 'Add to Cache'}</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={styles.saveButton}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? '保存中...' : '保存'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.label}>Content Type</Text>
        <View style={styles.typeSelector}>
          {(['text', 'url', 'image'] as const).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeButton,
                contentType === type && styles.typeButtonActive,
              ]}
              onPress={() => setContentType(type)}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  contentType === type && styles.typeButtonTextActive,
                ]}
              >
                {type.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {contentType === 'text' && (
          <>
            <Text style={styles.label}>Content *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="輸入文字內容..."
              value={contentText}
              onChangeText={setContentText}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </>
        )}

        {contentType === 'url' && (
          <>
            <Text style={styles.label}>URL *</Text>
            <TextInput
              style={styles.input}
              placeholder="https://example.com"
              value={contentUrl}
              onChangeText={setContentUrl}
              keyboardType="url"
              autoCapitalize="none"
            />
          </>
        )}

        {contentType === 'image' && (
          <>
            <Text style={styles.label}>選擇圖片</Text>
            
            <View style={styles.imageButtonRow}>
              <TouchableOpacity
                style={styles.imageButton}
                onPress={pickImage}
              >
                <Text style={styles.imageButtonText}>📷 從相簿選擇</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.imageButton}
                onPress={takePhoto}
              >
                <Text style={styles.imageButtonText}>📸 拍照</Text>
              </TouchableOpacity>
            </View>

            {selectedImage && (
              <View style={styles.imagePreview}>
                <RNImage
                  source={{ uri: selectedImage }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
                <View style={styles.imageActions}>
                  <TouchableOpacity
                    style={styles.annotateButton}
                    onPress={() => setShowOCRViewer(true)}
                  >
                    <Text style={styles.annotateButtonText}>
                      🔍 識別文字 {ocrBlocks.length > 0 && `(${ocrBlocks.length} 個區域)`}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cropButton}
                    onPress={() => {
                      setPendingCropImage(selectedImage);
                      setShowCropper(true);
                    }}
                  >
                    <Text style={styles.cropButtonText}>✂️ 重新裁切</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => {
                      setSelectedImage(null);
                      setContentUrl('');
                      setOCRBlocks([]);
                      setSelectedBlockIndexes([]);
                      setAIAnalysisResult(null);
                    }}
                  >
                    <Text style={styles.removeImageText}>✕ 移除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={styles.label}>或輸入圖片 URL</Text>
            <TextInput
              style={styles.input}
              placeholder="輸入圖片 URL..."
              value={contentUrl}
              onChangeText={setContentUrl}
              keyboardType="url"
              autoCapitalize="none"
            />
          </>
        )}

        <Text style={styles.label}>
          Keywords (Optional)
        </Text>
        <TextInput
          style={styles.input}
          placeholder="例如：explain grammar, IELTS context"
          value={keywords}
          onChangeText={setKeywords}
          autoCapitalize="none"
        />
        {selectedBlockIndexes.length > 0 && (
          <Text style={styles.ocrHint}>
            ✨ 已選擇 {selectedBlockIndexes.length} 個區域
          </Text>
        )}
        {/* [AI 推薦詞彙功能暫時停用] analyzing 指示和推薦詞彙 UI 隱藏中
        {analyzing && (
          <View style={styles.analyzingContainer}>
            <ActivityIndicator size="small" color="#4CAF50" />
            <Text style={styles.analyzingText}>AI 正在推薦詞彙...</Text>
          </View>
        )}
        {recommendedWords.length > 0 && (
          <View style={styles.recommendedWordsContainer}>
            <Text style={styles.recommendedWordsTitle}>💡 AI 推薦詞彙：</Text>
            <View style={styles.recommendedWordsList}>
              {recommendedWords.map((word, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.recommendedWordChip}
                  onPress={() => setKeywords(word)}
                >
                  <Text style={styles.recommendedWordText}>{word}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        */}
        <Text style={styles.hint}>
          添加關鍵字來指導 AI 分析這段內容
        </Text>
      </ScrollView>

      {/* OCR Viewer Modal（Tech Stack v1.5.0）*/}
      {showOCRViewer && (
        <Modal
          visible={showOCRViewer}
          animationType="slide"
          onRequestClose={() => setShowOCRViewer(false)}
          presentationStyle="fullScreen"
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  console.log('[AddCache] Closing OCR viewer, blocks:', ocrBlocks.length);
                  setShowOCRViewer(false);
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
                recommendedCount={5}
                learningGoal={learningGoal}
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
  recommendedWordsContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  recommendedWordsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 8,
  },
  recommendedWordsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recommendedWordChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  recommendedWordText: {
    fontSize: 13,
    color: '#1976D2',
    fontWeight: '500',
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
