// Create Card from Cached Item
import React from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import type Card from '@database/models/Card';
import { analyzeText, isUsingRealAPI } from '../services/ai';
import { extractTextFromImage, isOCRAvailable, buildContextPayload, analyzeTextWithAI } from '../services/ocr';

/** WatermelonDB @json 讀出時可能已是陣列，避免對陣列做 JSON.parse 導致閃退 */
function getAnnotationsArray(val: unknown): { text?: string }[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }
  return [];
}

type Props = {
  navigation: any;
  route: any;
};

type CreateCardDraft = {
  targetWord: string;
  targetPhrase: string;
  definition: string;
  contextualExplanation: string;
  phoneticTranscription: string;
  tags: string;
  showAnalysisChoice: boolean;
  usingRealAPI: boolean;
  updatedAt: number;
};

function readableAIErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (message.includes('401') || message.toLowerCase().includes('unauthorized')) {
    return 'AI 服務需要登入授權，請重新登入後再試。';
  }
  if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
    return 'AI 服務目前請求過多，請稍後再試。';
  }
  if (message.toLowerCase().includes('network')) {
    return '網路連線異常，請檢查網路後重試。';
  }
  if (message.includes('Edge Function returned a non-2xx status code')) {
    return 'AI 服務暫時異常，請稍後重試。';
  }
  return '無法分析文本，請稍後重試或改用手動輸入。';
}

export default function CreateCardScreen({ navigation, route }: Props) {
  const { cachedItem } = route.params as { cachedItem: CachedItem };
  const draftStorageKey = React.useMemo(
    () => `create_card_draft:${cachedItem.id}`,
    [cachedItem.id]
  );
  
  const [targetWord, setTargetWord] = React.useState('');
  const [targetPhrase, setTargetPhrase] = React.useState('');
  const [definition, setDefinition] = React.useState('');
  const [contextualExplanation, setContextualExplanation] = React.useState('');
  const [phoneticTranscription, setPhoneticTranscription] = React.useState('');
  const [tags, setTags] = React.useState('');
  const [suggestedWords, setSuggestedWords] = React.useState<string[]>([]);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [usingRealAPI, setUsingRealAPI] = React.useState(false);
  const [showAnalysisChoice, setShowAnalysisChoice] = React.useState(true);
  const [hasPersistedDraft, setHasPersistedDraft] = React.useState(false);
  const restoringDraftRef = React.useRef(false);

  const persistDraft = React.useCallback(
    async (draft: CreateCardDraft) => {
      await AsyncStorage.setItem(draftStorageKey, JSON.stringify(draft));
      setHasPersistedDraft(true);
    },
    [draftStorageKey]
  );

  React.useEffect(() => {
    // 預填關鍵字（從 userKeywords 提取，移除 [block:X] 標記）
    if (cachedItem.userKeywords) {
      const keywordOnly = cachedItem.userKeywords.replace(/\s*\[block:\d+\]/, '').trim();
      setTargetWord(keywordOnly);
    }
    // 不自動執行分析，等用戶選擇
  }, [cachedItem]);

  React.useEffect(() => {
    let active = true;
    const restoreDraft = async () => {
      try {
        const raw = await AsyncStorage.getItem(draftStorageKey);
        if (!raw || !active) return;

        const draft = JSON.parse(raw) as Partial<CreateCardDraft>;
        restoringDraftRef.current = true;
        if (typeof draft.targetWord === 'string') setTargetWord(draft.targetWord);
        if (typeof draft.targetPhrase === 'string') setTargetPhrase(draft.targetPhrase);
        if (typeof draft.definition === 'string') setDefinition(draft.definition);
        if (typeof draft.contextualExplanation === 'string') {
          setContextualExplanation(draft.contextualExplanation);
        }
        if (typeof draft.phoneticTranscription === 'string') {
          setPhoneticTranscription(draft.phoneticTranscription);
        }
        if (typeof draft.tags === 'string') setTags(draft.tags);
        if (typeof draft.usingRealAPI === 'boolean') setUsingRealAPI(draft.usingRealAPI);
        setShowAnalysisChoice(false);
        setHasPersistedDraft(true);
      } catch (error) {
        console.error('[CreateCard] Failed to restore draft:', error);
      } finally {
        setTimeout(() => {
          restoringDraftRef.current = false;
        }, 0);
      }
    };

    void restoreDraft();
    return () => {
      active = false;
    };
  }, [draftStorageKey]);

  React.useEffect(() => {
    if (!hasPersistedDraft || restoringDraftRef.current) return;

    const draft: CreateCardDraft = {
      targetWord,
      targetPhrase,
      definition,
      contextualExplanation,
      phoneticTranscription,
      tags,
      showAnalysisChoice: false,
      usingRealAPI,
      updatedAt: Date.now(),
    };
    void persistDraft(draft);
  }, [
    targetWord,
    targetPhrase,
    definition,
    contextualExplanation,
    phoneticTranscription,
    tags,
    usingRealAPI,
    hasPersistedDraft,
    persistDraft,
  ]);

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
            '需要 ML Kit OCR',
            '圖片文字識別功能需要 Google ML Kit。請確保已安裝相關依賴。'
          );
          setAnalyzing(false);
          return;
        }

        // 安全取得 annotations（DB 讀出時可能已是陣列）
        const annotations = getAnnotationsArray(cachedItem.imageAnnotations);

        if (annotations.length > 0) {
          // 解析 userKeywords 中的 block 索引（格式：關鍵字 [block:索引]）
          let selectedBlockIndex: number | null = null;
          if (cachedItem.userKeywords) {
            const match = cachedItem.userKeywords.match(/\[block:(\d+)\]/);
            if (match) {
              selectedBlockIndex = parseInt(match[1], 10);
            }
          }

          if (selectedBlockIndex !== null && selectedBlockIndex < annotations.length) {
            // 使用上下文分析（Tech Stack v1.5.0）
            console.log('[CreateCard] Using context-based analysis for block:', selectedBlockIndex);
            const payload = buildContextPayload(annotations as any[], selectedBlockIndex);
            const result = await analyzeTextWithAI(payload);
            
            // 直接設定分析結果，跳過舊的 analyzeText
            setTargetWord(result.keyword);
            setDefinition(result.definition);
            setContextualExplanation(result.example);
            setPhoneticTranscription(result.pronunciation || '');
            setTags(result.tags.join(', '));
            // setSuggestedWords([result.keyword]); // [推薦字功能暫時停用]
            await persistDraft({
              targetWord: result.keyword,
              targetPhrase,
              definition: result.definition,
              contextualExplanation: result.example,
              phoneticTranscription: result.pronunciation || '',
              tags: result.tags.join(', '),
              showAnalysisChoice: false,
              usingRealAPI: isUsingRealAPI(),
              updatedAt: Date.now(),
            });
            
            setAnalyzing(false);
            return;
          } else {
            // 舊資料或無索引：拼成全文
            textToAnalyze = annotations
              .map((a) => a.text)
              .filter(Boolean)
              .join(' ');
            console.log('[CreateCard] No block index, using full OCR text:', textToAnalyze);
          }
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
      // 使用智能 AI 服務（自動選擇 Gemini 或 Mock）
      const analysis = await analyzeText(
        textToAnalyze,
        cachedItem.userKeywords,
        'ielts' // TODO: 從用戶 profile 獲取
      );
      
      // setSuggestedWords(analysis.keywords); // [推薦字功能暫時停用]

      // 自動填入分析結果
      if (analysis.suggestedWord) {
        const nextTargetWord = analysis.suggestedWord;
        const nextDefinition = analysis.definition;
        const nextContextualExplanation = analysis.contextualExplanation;
        const nextPhoneticTranscription = analysis.phoneticTranscription || '';
        const nextTags = analysis.tags.join(', ');

        setTargetWord(nextTargetWord);
        setDefinition(nextDefinition);
        setContextualExplanation(nextContextualExplanation);
        setPhoneticTranscription(nextPhoneticTranscription);
        setTags(nextTags);
        await persistDraft({
          targetWord: nextTargetWord,
          targetPhrase,
          definition: nextDefinition,
          contextualExplanation: nextContextualExplanation,
          phoneticTranscription: nextPhoneticTranscription,
          tags: nextTags,
          showAnalysisChoice: false,
          usingRealAPI: isUsingRealAPI(),
          updatedAt: Date.now(),
        });
      }
    } catch (error) {
      console.error('Analysis error:', error);
      Alert.alert(
        '分析失敗',
        readableAIErrorMessage(error),
        [
          {
            text: '手動輸入',
            style: 'cancel',
          },
          {
            text: '重試',
            onPress: () => {
              void performAnalysis();
            },
          },
        ]
      );
    } finally {
      setAnalyzing(false);
    }
  };

  // [推薦字功能暫時停用] handleWordSelection 保留但不呼叫 API
  // const handleWordSelection = async (word: string) => {
  //   setTargetWord(word);
  //   setAnalyzing(true);
  //   try {
  //     const content = await generateContentForWord(word, cachedItem.contentText || '', 'ielts');
  //     setDefinition(content.definition);
  //     setContextualExplanation(content.contextualExplanation);
  //     setPhoneticTranscription(content.phoneticTranscription || '');
  //     setTags(content.tags.join(', '));
  //   } catch (error) {
  //     console.error('Error generating content for word:', error);
  //   } finally {
  //     setAnalyzing(false);
  //   }
  // };

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
          card.tags = tags.trim() ? tags.split(',').map(t => t.trim()) : undefined;
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
      await AsyncStorage.removeItem(draftStorageKey);
      setHasPersistedDraft(false);

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
              {getAnnotationsArray(cachedItem.imageAnnotations).length > 0 && (
                <Text style={styles.annotationHint}>
                  ✏️ {getAnnotationsArray(cachedItem.imageAnnotations).length} 個單字
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

        {/* AI 分析選擇對話框 */}
        {showAnalysisChoice && (
          <View style={styles.choiceContainer}>
            <Text style={styles.choiceTitle}>建立卡片方式</Text>
            <View style={styles.choiceButtons}>
              <TouchableOpacity
                style={[styles.choiceButton, styles.aiButton]}
                onPress={() => {
                  setShowAnalysisChoice(false);
                  performAnalysis();
                }}
              >
                <Text style={styles.choiceButtonText}>🤖 AI 分析</Text>
                <Text style={styles.choiceButtonHint}>自動生成定義和例句</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.choiceButton, styles.manualButton]}
                onPress={() => {
                  setShowAnalysisChoice(false);
                }}
              >
                <Text style={styles.choiceButtonText}>✏️ 手動輸入</Text>
                <Text style={styles.choiceButtonHint}>自己填寫卡片內容</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Loading Indicator */}
        {analyzing && (
          <View style={styles.analyzingContainer}>
            <ActivityIndicator size="small" color="#4CAF50" />
            <Text style={styles.analyzingText}>
              {'🤖 AI 分析中...'}
            </Text>
          </View>
        )}

        {/* API Status Indicator */}
        {!analyzing && (
          <View style={styles.apiStatusContainer}>
            <Text style={styles.apiStatusText}>
              {usingRealAPI 
                ? '✨ 使用 AI 分析' 
                : '💡 使用基礎 AI'}
            </Text>
          </View>
        )}

        {/* [推薦字功能暫時停用] AI 建議關鍵字 chips 隱藏中
        {!analyzing && suggestedWords.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <Text style={styles.label}>💡 AI 建議的關鍵字（點擊自動填入）</Text>
            <View style={styles.suggestionsRow}>
              {suggestedWords.map((word, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.suggestionChip, targetWord === word && styles.suggestionChipActive]}
                  onPress={() => handleWordSelection(word)}
                >
                  <Text style={[styles.suggestionChipText, targetWord === word && styles.suggestionChipTextActive]}>
                    {word}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        */}

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
  choiceContainer: {
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderRadius: 12,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  choiceTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  choiceButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  choiceButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
  },
  aiButton: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196F3',
  },
  manualButton: {
    backgroundColor: '#fff3e0',
    borderColor: '#FF9800',
  },
  choiceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  choiceButtonHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});
