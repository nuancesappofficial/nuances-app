// Create Card from Cached Item
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image as RNImage,
} from 'react-native';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import type Card from '@database/models/Card';
import { analyzeText, generateContentForWord, isUsingRealAPI } from '../services/ai';
import { extractTextFromImage, extractTextFromAnnotations, isOCRAvailable } from '../services/ocr';

type Props = {
  navigation: any;
  route: any;
};

export default function CreateCardScreen({ navigation, route }: Props) {
  const { cachedItem } = route.params as { cachedItem: CachedItem };
  
  const [targetWord, setTargetWord] = useState('');
  const [targetPhrase, setTargetPhrase] = useState('');
  const [definition, setDefinition] = useState('');
  const [contextualExplanation, setContextualExplanation] = useState('');
  const [phoneticTranscription, setPhoneticTranscription] = useState('');
  const [tags, setTags] = useState('');
  const [suggestedWords, setSuggestedWords] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usingRealAPI, setUsingRealAPI] = useState(false);

  useEffect(() => {
    // AI 分析：提取可能的目標單字並生成內容
    if (cachedItem.contentText || cachedItem.contentType === 'image') {
      performAnalysis();
    }
  }, [cachedItem]);

  const performAnalysis = async () => {
    setAnalyzing(true);
    setUsingRealAPI(isUsingRealAPI());
    
    try {
      let textToAnalyze = cachedItem.contentText || '';

      // 如果是圖片類型，先進行 OCR
      if (cachedItem.contentType === 'image' && cachedItem.imageStoragePath) {
        console.log('[CreateCard] Performing OCR on image');
        
        if (!isOCRAvailable()) {
          Alert.alert(
            '需要 OpenAI API',
            '圖片文字識別需要 OpenAI API 金鑰。請在 .env 文件中配置 EXPO_PUBLIC_OPENAI_API_KEY。'
          );
          setAnalyzing(false);
          return;
        }

        // 檢查是否有標註
        const annotations = cachedItem.imageAnnotations 
          ? JSON.parse(cachedItem.imageAnnotations)
          : [];

        if (annotations.length > 0) {
          // 提取標註區域的文字
          console.log(`[CreateCard] Extracting text from ${annotations.length} annotations`);
          console.log('[CreateCard] Image path:', cachedItem.imageStoragePath);
          console.log('[CreateCard] Annotations:', JSON.stringify(annotations, null, 2));
          
          const results = await extractTextFromAnnotations(
            cachedItem.imageStoragePath,
            annotations
          );
          
          console.log('[CreateCard] OCR results:', JSON.stringify(results, null, 2));
          
          // 合併所有標註區域的文字
          textToAnalyze = results
            .map((r) => r.text)
            .filter((t) => t.trim())
            .join(' ');
          
          console.log('[CreateCard] Extracted text from annotations:', textToAnalyze);
        } else {
          // 提取整張圖片的文字
          console.log('[CreateCard] Extracting text from full image');
          console.log('[CreateCard] Image path:', cachedItem.imageStoragePath);
          
          const ocrResult = await extractTextFromImage(cachedItem.imageStoragePath);
          console.log('[CreateCard] OCR result:', JSON.stringify(ocrResult, null, 2));
          
          textToAnalyze = ocrResult.fullText;
          console.log('[CreateCard] Extracted text from image:', textToAnalyze);
        }

        if (!textToAnalyze.trim()) {
          Alert.alert('未識別到文字', '圖片中未識別到任何文字。請確保圖片清晰且包含文字內容。');
          setAnalyzing(false);
          return;
        }
      }

      if (!textToAnalyze) {
        setAnalyzing(false);
        return;
      }
      // 使用智能 AI 服務（自動選擇 OpenAI 或 Mock）
      const analysis = await analyzeText(
        textToAnalyze,
        cachedItem.userKeywords,
        'ielts' // TODO: 從用戶 profile 獲取
      );
      
      setSuggestedWords(analysis.keywords);
      
      // 自動填入分析結果
      if (analysis.suggestedWord) {
        setTargetWord(analysis.suggestedWord);
        setDefinition(analysis.definition);
        setContextualExplanation(analysis.contextualExplanation);
        setPhoneticTranscription(analysis.phoneticTranscription || '');
        setTags(analysis.tags.join(', '));
      }
    } catch (error) {
      console.error('Analysis error:', error);
      Alert.alert(
        '分析失敗',
        '無法分析文本。請手動輸入單字和定義。',
        [{ text: '確定' }]
      );
    } finally {
      setAnalyzing(false);
    }
  };

  // 當用戶選擇不同的單字時，重新生成內容
  const handleWordSelection = async (word: string) => {
    setTargetWord(word);
    setAnalyzing(true);
    
    try {
      const content = await generateContentForWord(
        word,
        cachedItem.contentText || '',
        'ielts'
      );
      
      setDefinition(content.definition);
      setContextualExplanation(content.contextualExplanation);
      setPhoneticTranscription(content.phoneticTranscription || '');
      setTags(content.tags.join(', '));
    } catch (error) {
      console.error('Error generating content for word:', error);
      // 保持當前單字，讓用戶手動編輯
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    // 驗證必填欄位
    if (!targetWord.trim()) {
      Alert.alert('錯誤', '請輸入目標單字');
      return;
    }

    if (!definition.trim()) {
      Alert.alert('錯誤', '請輸入定義');
      return;
    }

    setSaving(true);

    try {
      const cardsCollection = database.get<Card>('cards');

      await database.write(async () => {
        // 創建卡片
        await cardsCollection.create((card) => {
          card.userId = cachedItem.userId;
          card.cachedItemId = cachedItem.id;
          card.targetWord = targetWord.trim();
          card.targetPhrase = targetPhrase.trim() || undefined;
          card.originalSentence = cachedItem.contentText || cachedItem.contentUrl || '';
          card.definition = definition.trim();
          card.contextualExplanation = contextualExplanation.trim() || undefined;
          card.phoneticTranscription = phoneticTranscription.trim() || undefined;
          card.tags = tags.trim() ? JSON.stringify(tags.split(',').map(t => t.trim())) : undefined;
          card.sourceApp = cachedItem.sourceApp;
          
          // SRS 初始值
          card.easeFactor = 2.5;
          card.intervalDays = 1;
          card.repetitions = 0;
          card.nextReviewAt = new Date(); // 立即可複習
        });

        // 更新 CachedItem 狀態
        await cachedItem.update((item) => {
          item.convertedToCard = true;
        });
      });

      Alert.alert('成功', '卡片創建成功！', [
        {
          text: '確定',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('Error creating card:', error);
      Alert.alert('錯誤', '創建卡片失敗，請重試');
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
        <Text style={styles.headerTitle}>Create Card</Text>
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
        {/* 原始內容預覽 */}
        <View style={styles.previewContainer}>
          <Text style={styles.previewLabel}>原始內容</Text>
          
          {/* 圖片預覽 */}
          {cachedItem.contentType === 'image' && cachedItem.imageStoragePath && (
            <View style={styles.imagePreviewContainer}>
              <RNImage
                source={{ uri: cachedItem.imageStoragePath }}
                style={styles.previewImage}
                resizeMode="contain"
              />
              {cachedItem.imageAnnotations && JSON.parse(cachedItem.imageAnnotations).length > 0 && (
                <Text style={styles.annotationHint}>
                  ✏️ {JSON.parse(cachedItem.imageAnnotations).length} 個標註區域
                </Text>
              )}
            </View>
          )}
          
          {/* 文字預覽 */}
          {cachedItem.contentText && (
            <Text style={styles.previewText} numberOfLines={3}>
              {cachedItem.contentText}
            </Text>
          )}
          
          {cachedItem.contentUrl && !cachedItem.imageStoragePath && (
            <Text style={styles.previewText} numberOfLines={1}>
              {cachedItem.contentUrl}
            </Text>
          )}
        </View>

        {/* Loading Indicator */}
        {analyzing && (
          <View style={styles.analyzingContainer}>
            <ActivityIndicator size="small" color="#4CAF50" />
            <Text style={styles.analyzingText}>
              {usingRealAPI ? '🤖 OpenAI GPT-4 分析中...' : '🤖 AI 分析中...'}
            </Text>
          </View>
        )}

        {/* API Status Indicator */}
        {!analyzing && (
          <View style={styles.apiStatusContainer}>
            <Text style={styles.apiStatusText}>
              {usingRealAPI 
                ? '✨ 使用 OpenAI GPT-4 分析' 
                : '💡 使用基礎 AI（設置 API Key 啟用高級功能）'}
            </Text>
          </View>
        )}

        {/* AI 建議的關鍵字 */}
        {!analyzing && suggestedWords.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <Text style={styles.label}>💡 AI 建議的關鍵字（點擊自動填入）</Text>
            <View style={styles.suggestionsRow}>
              {suggestedWords.map((word, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.suggestionChip,
                    targetWord === word && styles.suggestionChipActive,
                  ]}
                  onPress={() => handleWordSelection(word)}
                >
                  <Text
                    style={[
                      styles.suggestionChipText,
                      targetWord === word && styles.suggestionChipTextActive,
                    ]}
                  >
                    {word}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* 目標單字 */}
        <Text style={styles.label}>Target Word *</Text>
        <TextInput
          style={styles.input}
          placeholder="例如：ephemeral"
          value={targetWord}
          onChangeText={setTargetWord}
          autoCapitalize="none"
        />

        {/* 目標短語 */}
        <Text style={styles.label}>Target Phrase (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="例如：ephemeral beauty"
          value={targetPhrase}
          onChangeText={setTargetPhrase}
          autoCapitalize="none"
        />

        {/* 定義 */}
        <Text style={styles.label}>Definition *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="短暫的；轉瞬即逝的 (lasting for a very short time)"
          value={definition}
          onChangeText={setDefinition}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* 情境解釋 */}
        <Text style={styles.label}>Contextual Explanation (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="用來描述持續時間很短、很快就會消失的事物..."
          value={contextualExplanation}
          onChangeText={setContextualExplanation}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* 音標 */}
        <Text style={styles.label}>Phonetic Transcription (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="/ɪˈfem.ər.əl/"
          value={phoneticTranscription}
          onChangeText={setPhoneticTranscription}
        />

        {/* 標籤 */}
        <Text style={styles.label}>Tags (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="IELTS, Advanced, Literature (用逗號分隔)"
          value={tags}
          onChangeText={setTags}
        />
        <Text style={styles.hint}>用逗號分隔多個標籤</Text>
      </ScrollView>
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
  previewContainer: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  imagePreviewContainer: {
    marginBottom: 12,
  },
  previewImage: {
    width: '100%',
    height: 150,
    borderRadius: 6,
    backgroundColor: '#000',
  },
  annotationHint: {
    fontSize: 11,
    color: '#4CAF50',
    marginTop: 6,
    fontWeight: '600',
  },
  previewText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  analyzingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    marginBottom: 16,
  },
  analyzingText: {
    fontSize: 14,
    color: '#4CAF50',
    marginLeft: 8,
    fontWeight: '600',
  },
  apiStatusContainer: {
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  apiStatusText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  suggestionsContainer: {
    marginBottom: 16,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  suggestionChipActive: {
    backgroundColor: '#4CAF50',
  },
  suggestionChipText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  suggestionChipTextActive: {
    color: '#fff',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
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
    minHeight: 80,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
