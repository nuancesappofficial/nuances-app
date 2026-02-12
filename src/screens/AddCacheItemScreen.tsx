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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import ImageAnnotation, { type BoundingBox } from '../components/ImageAnnotation';

type Props = {
  navigation: any;
};

export default function AddCacheItemScreen({ navigation }: Props) {
  const [contentType, setContentType] = React.useState<
    'text' | 'url' | 'image'
  >('text');
  const [contentText, setContentText] = React.useState('');
  const [contentUrl, setContentUrl] = React.useState('');
  const [keywords, setKeywords] = React.useState('');
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
  const [imageAnnotations, setImageAnnotations] = React.useState<BoundingBox[]>([]);
  const [showAnnotationTool, setShowAnnotationTool] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [ocrPreviewText, setOCRPreviewText] = React.useState(''); // OCR 預覽文字

  // 使用 useCallback 避免每次渲染都創建新函數
  const handleAnnotationsChange = React.useCallback((annotations: BoundingBox[]) => {
    console.log('[AddCache] Annotations updated:', annotations.length);
    setImageAnnotations(annotations);
  }, []);

  // OCR 預覽回調
  const handleOCRPreview = React.useCallback((text: string) => {
    console.log('[AddCache] OCR preview:', text);
    setOCRPreviewText(text);
    // 自動填入到 keywords 欄位
    if (text && !keywords) {
      setKeywords(text.substring(0, 100)); // 限制長度
    }
  }, [keywords]);

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
      allowsEditing: false, // 不預裁剪，讓用戶標註
      quality: 1, // 高品質以利 OCR
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setContentUrl(result.assets[0].uri);
      setContentType('image');
      
      // 自動開啟標註工具
      setTimeout(() => {
        setShowAnnotationTool(true);
      }, 300);
    }
  };

  const takePhoto = async () => {
    // Request permissions
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('權限需求', '需要相機權限才能拍照');
      return;
    }

    // Launch camera
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setContentUrl(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!contentText && !contentUrl) {
      Alert.alert('錯誤', '請輸入內容或 URL');
      return;
    }

    // 圖片類型且有標註時，提示用戶
    if (contentType === 'image' && selectedImage && imageAnnotations.length === 0) {
      Alert.alert(
        '提示',
        '您還沒有標註圖片上的關鍵區域。要繼續嗎？',
        [
          { text: '標註', style: 'cancel' },
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

  const performSave = async () => {
    setSaving(true);

    try {
      const collection = database.get<CachedItem>('cached_items');

      await database.write(async () => {
        await collection.create((item) => {
          item.userId = 'demo-user'; // TODO: Replace with actual user ID
          item.contentType = contentType;
          item.contentText = contentText || undefined;
          item.contentUrl = contentUrl || undefined;
          item.userKeywords = keywords || undefined;
          item.sourceApp = 'Manual Entry';
          item.aiAnalysisCompleted = false;
          item.convertedToCard = false;
          
          // 儲存圖片標註
          if (imageAnnotations.length > 0) {
            item.imageAnnotations = JSON.stringify(imageAnnotations);
          }
          
          // 儲存圖片路徑
          if (selectedImage) {
            item.imageStoragePath = selectedImage;
          }
          
          // Set expiration for free tier (24 hours)
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);
          item.expiresAt = expiresAt;
        });
      });

      Alert.alert('成功', '已保存到快取！', [
        {
          text: '確定',
          onPress: () => {
            navigation.goBack();
          },
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
        <Text style={styles.headerTitle}>Add to Cache</Text>
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
                    onPress={() => setShowAnnotationTool(true)}
                  >
                    <Text style={styles.annotateButtonText}>
                      ✏️ 標註關鍵區域 {imageAnnotations.length > 0 && `(${imageAnnotations.length})`}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => {
                      setSelectedImage(null);
                      setContentUrl('');
                      setImageAnnotations([]);
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
        {ocrPreviewText && (
          <Text style={styles.ocrHint}>
            💡 圖片識別：{ocrPreviewText.substring(0, 50)}{ocrPreviewText.length > 50 ? '...' : ''}
          </Text>
        )}
        <Text style={styles.hint}>
          添加關鍵字來指導 AI 分析這段內容
        </Text>
      </ScrollView>

      {/* 圖片標註工具 Modal */}
      {showAnnotationTool && (
        <Modal
          visible={showAnnotationTool}
          animationType="slide"
          onRequestClose={() => setShowAnnotationTool(false)}
          presentationStyle="fullScreen"
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  console.log('[AddCache] Closing annotation tool, annotations:', imageAnnotations.length);
                  setShowAnnotationTool(false);
                }}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✓ 完成</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>標註圖片</Text>
              <Text style={styles.modalCloseText}>{imageAnnotations.length} 個</Text>
            </View>

            {selectedImage ? (
              <ImageAnnotation
                imageUri={selectedImage}
                onAnnotationsChange={handleAnnotationsChange}
                onOCRPreview={handleOCRPreview}
                initialAnnotations={imageAnnotations}
              />
            ) : (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>⚠️ 圖片載入失敗</Text>
              </View>
            )}
          </View>
        </Modal>
      )}
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
});
