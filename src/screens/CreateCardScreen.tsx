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
  Animated,
  Modal,
  Image as RNImage,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import type Card from '@database/models/Card';
import { generateContentForWord, isUsingRealAPI } from '../services/ai';
import { extractTextFromImage, isOCRAvailable, buildContextPayload, analyzeTextWithAI } from '../services/ocr';
import { AIAuthError } from '../services/ai/edgeAiClient';
import { supabase } from '../services/supabase/client';
import {
  extractKeywordText,
  parseSelectedBlockIndexes,
} from '../services/ocr/selectionMarkers';
import {
  getEffectiveAIPersonalization,
  loadUserSettings,
} from '../services/settings/userSettings';
import type { AIPersonalizationOptions } from '../services/ai/types';

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
  partOfSpeech: string;
  contextualExplanation: string;
  frequentCollocations: string;
  phoneticTranscription: string;
  tags: string;
  showAnalysisChoice: boolean;
  showAdvancedFields?: boolean;
  showDetailEditor?: boolean;
  selectedDraftWord?: string | null;
  multiCardDrafts?: MultiCardDraft[];
  suggestedWords?: string[];
  editableKeywords?: string;
  usingRealAPI: boolean;
  updatedAt: number;
};
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type MultiCardDraft = {
  targetWord: string;
  definition: string;
  partOfSpeech?: string;
  contextualExplanation?: string;
  frequentCollocations?: string;
  phoneticTranscription?: string;
  tags: string[];
};

type AnalysisProgress = {
  current: number;
  total: number;
  currentWord: string;
};

function parseKeywordsInput(raw: string): string[] {
  if (!raw.trim()) return [];
  const normalized = raw
    .split(/[,\u3001\n]+/)
    .map((term) => term.trim())
    .filter(Boolean);
  return Array.from(new Map(normalized.map((term) => [term.toLowerCase(), term])).values());
}

function buildFollowupSuggestions(
  selectedWord: string,
  topRecommendedWords: string[]
): string[] {
  const normalizedSelected = selectedWord.trim().toLowerCase();
  const normalizedTop = topRecommendedWords
    .map((word) => word.trim())
    .filter(Boolean);
  const uniqueTop = Array.from(
    new Map(normalizedTop.map((word) => [word.toLowerCase(), word])).values()
  );
  if (uniqueTop.length === 0) return [];

  const selectedInTop = uniqueTop.some(
    (word) => word.toLowerCase() === normalizedSelected
  );
  if (!selectedInTop) {
    return uniqueTop.slice(0, 4);
  }
  return uniqueTop
    .filter((word) => word.toLowerCase() !== normalizedSelected)
    .slice(0, 3);
}

function readableAIErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (error instanceof AIAuthError) {
    return '你目前尚未登入，請先登入再使用 AI 分析。';
  }
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

async function redirectToLogin() {
  await supabase.auth.signOut();
}

async function hasLocalSession(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return Boolean(session?.access_token);
}

export default function CreateCardScreen({ navigation, route }: Props) {
  const { cachedItem } = route.params as { cachedItem: CachedItem };
  const draftStorageKey = React.useMemo(
    () => `create_card_draft:${cachedItem.userId}:${cachedItem.id}`,
    [cachedItem.userId, cachedItem.id]
  );
  
  const [targetWord, setTargetWord] = React.useState('');
  const [targetPhrase, setTargetPhrase] = React.useState('');
  const [definition, setDefinition] = React.useState('');
  const [partOfSpeech, setPartOfSpeech] = React.useState('');
  const [contextualExplanation, setContextualExplanation] = React.useState('');
  const [frequentCollocations, setFrequentCollocations] = React.useState('');
  const [phoneticTranscription, setPhoneticTranscription] = React.useState('');
  const [tags, setTags] = React.useState('');
  const [editableKeywords, setEditableKeywords] = React.useState('');
  const [suggestedWords, setSuggestedWords] = React.useState<string[]>([]);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [usingRealAPI, setUsingRealAPI] = React.useState(false);
  const [showAnalysisChoice, setShowAnalysisChoice] = React.useState(true);
  const [showAdvancedFields, setShowAdvancedFields] = React.useState(false);
  const [showDetailEditor, setShowDetailEditor] = React.useState(false);
  const [selectedDraftWord, setSelectedDraftWord] = React.useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = React.useState<AnalysisProgress | null>(null);
  const [hasPersistedDraft, setHasPersistedDraft] = React.useState(false);
  const [multiCardDrafts, setMultiCardDrafts] = React.useState<MultiCardDraft[]>([]);
  const [aiPersonalization, setAIPersonalization] = React.useState<AIPersonalizationOptions>({
    learningGoal: 'ielts',
  });
  const progressOpacity = React.useRef(new Animated.Value(0)).current;
  const restoringDraftRef = React.useRef(false);
  const keywordEditedRef = React.useRef(false);
  const authRedirectingRef = React.useRef(false);
  const selectedBlockIndexes = React.useMemo(
    () => parseSelectedBlockIndexes(cachedItem.userKeywords),
    [cachedItem.userKeywords]
  );
  const topRecommendedWords = React.useMemo(
    () =>
      Array.isArray(cachedItem.aiHighlightedTerms)
        ? cachedItem.aiHighlightedTerms.map((term) => term.trim()).filter(Boolean)
        : [],
    [cachedItem.aiHighlightedTerms]
  );
  const selectedTerms = React.useMemo(() => {
    const annotations = getAnnotationsArray(cachedItem.imageAnnotations);
    const fromSelectedIndexes = selectedBlockIndexes
      .map((index) => annotations[index]?.text?.trim())
      .filter((term): term is string => Boolean(term));
    if (fromSelectedIndexes.length > 0) {
      return Array.from(
        new Map(fromSelectedIndexes.map((term) => [term.toLowerCase(), term])).values()
      );
    }

    const fromHighlightedTerms = Array.isArray(cachedItem.aiHighlightedTerms)
      ? cachedItem.aiHighlightedTerms.map((term) => term.trim()).filter(Boolean)
      : [];
    if (fromHighlightedTerms.length > 0) {
      return Array.from(
        new Map(fromHighlightedTerms.map((term) => [term.toLowerCase(), term])).values()
      );
    }

    const keywordText = extractKeywordText(cachedItem.userKeywords || '');
    if (!keywordText.trim()) return [];
    const fromKeywordText = keywordText
      .split(/[,\u3001\s\n]+/)
      .map((term) => term.trim())
      .filter(Boolean);
    return Array.from(
      new Map(fromKeywordText.map((term) => [term.toLowerCase(), term])).values()
    );
  }, [
    cachedItem.aiHighlightedTerms,
    cachedItem.imageAnnotations,
    cachedItem.userKeywords,
    selectedBlockIndexes,
  ]);
  const editableTerms = React.useMemo(
    () => parseKeywordsInput(editableKeywords),
    [editableKeywords]
  );

  const persistDraft = React.useCallback(
    async (draft: CreateCardDraft) => {
      await AsyncStorage.setItem(draftStorageKey, JSON.stringify(draft));
      setHasPersistedDraft(true);
    },
    [draftStorageKey]
  );

  React.useEffect(() => {
    let active = true;
    const restoreDraft = async () => {
      try {
        if (cachedItem.convertedToCard) {
          await AsyncStorage.removeItem(draftStorageKey);
          if (active) {
            setHasPersistedDraft(false);
          }
          return;
        }

        const raw = await AsyncStorage.getItem(draftStorageKey);
        if (!raw || !active) return;

        const draft = JSON.parse(raw) as Partial<CreateCardDraft>;
        if (
          typeof draft.updatedAt !== 'number' ||
          Date.now() - draft.updatedAt > DRAFT_TTL_MS
        ) {
          await AsyncStorage.removeItem(draftStorageKey);
          setHasPersistedDraft(false);
          return;
        }

        restoringDraftRef.current = true;
        if (typeof draft.targetWord === 'string') setTargetWord(draft.targetWord);
        if (typeof draft.targetPhrase === 'string') setTargetPhrase(draft.targetPhrase);
        if (typeof draft.definition === 'string') setDefinition(draft.definition);
        if (typeof draft.partOfSpeech === 'string') setPartOfSpeech(draft.partOfSpeech);
        if (typeof draft.contextualExplanation === 'string') {
          setContextualExplanation(draft.contextualExplanation);
        }
        if (typeof draft.frequentCollocations === 'string') {
          setFrequentCollocations(draft.frequentCollocations);
        }
        if (typeof draft.phoneticTranscription === 'string') {
          setPhoneticTranscription(draft.phoneticTranscription);
        }
        if (typeof draft.tags === 'string') setTags(draft.tags);
        if (typeof draft.editableKeywords === 'string') {
          keywordEditedRef.current = true;
          setEditableKeywords(draft.editableKeywords);
        }
        if (typeof draft.usingRealAPI === 'boolean') setUsingRealAPI(draft.usingRealAPI);
        if (Array.isArray(draft.suggestedWords)) {
          setSuggestedWords(
            draft.suggestedWords.map((word) => String(word || '').trim()).filter(Boolean)
          );
        }
        let restoredMultiDrafts: MultiCardDraft[] = [];
        if (Array.isArray(draft.multiCardDrafts)) {
          restoredMultiDrafts = draft.multiCardDrafts
            .map((item) => {
              const target = String(item?.targetWord || '').trim();
              if (!target) return null;
              return {
                targetWord: target,
                definition: String(item?.definition || ''),
                partOfSpeech: String(item?.partOfSpeech || ''),
                contextualExplanation: String(item?.contextualExplanation || ''),
                frequentCollocations: String(item?.frequentCollocations || ''),
                phoneticTranscription: String(item?.phoneticTranscription || ''),
                tags: Array.isArray(item?.tags)
                  ? item.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
                  : [],
              } as MultiCardDraft;
            })
            .filter((item): item is MultiCardDraft => Boolean(item));
          setMultiCardDrafts(restoredMultiDrafts);
        }
        const hasAnalysisResult = restoredMultiDrafts.length > 0;
        if (typeof draft.showAnalysisChoice === 'boolean') {
          setShowAnalysisChoice(hasAnalysisResult ? false : draft.showAnalysisChoice);
        } else {
          setShowAnalysisChoice(false);
        }
        if (typeof draft.showAdvancedFields === 'boolean') {
          setShowAdvancedFields(draft.showAdvancedFields);
        }
        // 回到分析結果頁時，一律不預選卡片也不自動開啟詳細彈窗
        if (hasAnalysisResult) {
          setSelectedDraftWord(null);
          setShowDetailEditor(false);
        } else {
          if (typeof draft.showDetailEditor === 'boolean') {
            setShowDetailEditor(draft.showDetailEditor);
          } else {
            setShowDetailEditor(false);
          }
          if (typeof draft.selectedDraftWord === 'string' || draft.selectedDraftWord === null) {
            setSelectedDraftWord(draft.selectedDraftWord ?? null);
          }
        }
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
  }, [draftStorageKey, cachedItem.convertedToCard]);

  React.useEffect(() => {
    if (keywordEditedRef.current) return;
    if (editableKeywords.trim()) return;
    if (selectedTerms.length === 0) return;
    setEditableKeywords(selectedTerms.join(', '));
  }, [editableKeywords, selectedTerms]);

  React.useEffect(() => {
    if (!hasPersistedDraft || restoringDraftRef.current) return;

    const draft: CreateCardDraft = {
      targetWord,
      targetPhrase,
      definition,
      partOfSpeech,
      contextualExplanation,
      frequentCollocations,
      phoneticTranscription,
      tags,
      editableKeywords,
      showAnalysisChoice,
      showAdvancedFields,
      showDetailEditor,
      selectedDraftWord,
      multiCardDrafts,
      suggestedWords,
      usingRealAPI,
      updatedAt: Date.now(),
    };
    void persistDraft(draft);
  }, [
    targetWord,
    targetPhrase,
    definition,
    partOfSpeech,
    contextualExplanation,
    frequentCollocations,
    phoneticTranscription,
    tags,
    editableKeywords,
    showAnalysisChoice,
    showAdvancedFields,
    showDetailEditor,
    selectedDraftWord,
    multiCardDrafts,
    suggestedWords,
    usingRealAPI,
    hasPersistedDraft,
    persistDraft,
  ]);

  React.useEffect(() => {
    if (targetPhrase || partOfSpeech || contextualExplanation || frequentCollocations || phoneticTranscription || tags) {
      setShowAdvancedFields(true);
    }
  }, [targetPhrase, partOfSpeech, contextualExplanation, frequentCollocations, phoneticTranscription, tags]);

  useFocusEffect(
    React.useCallback(() => {
      if (multiCardDrafts.length > 0) {
        setSelectedDraftWord(null);
        setShowDetailEditor(false);
      }
      return undefined;
    }, [multiCardDrafts.length])
  );

  React.useEffect(() => {
    Animated.timing(progressOpacity, {
      toValue: analyzing ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [analyzing, progressOpacity]);

  React.useEffect(() => {
    let active = true;
    const loadGoal = async () => {
      const settings = await loadUserSettings();
      if (!active) return;
      setAIPersonalization(getEffectiveAIPersonalization(settings));
    };
    void loadGoal();
    return () => {
      active = false;
    };
  }, []);

  const getSourceSentence = React.useCallback((): string => {
    if (cachedItem.contentText?.trim()) return cachedItem.contentText.trim();
    const annotations = getAnnotationsArray(cachedItem.imageAnnotations);
    const fromAnnotations = annotations
      .map((ann) => ann.text?.trim() || '')
      .filter(Boolean)
      .join(' ');
    if (fromAnnotations) return fromAnnotations;
    return cachedItem.contentUrl || '';
  }, [cachedItem.contentText, cachedItem.contentUrl, cachedItem.imageAnnotations]);

  const performAnalysis = async () => {
    setAnalyzing(true);
    setUsingRealAPI(isUsingRealAPI());

    try {
      const explicitTargetWord = targetWord.trim();
      const candidateWords =
        editableTerms.length > 0 ? editableTerms : explicitTargetWord ? [explicitTargetWord] : [];
      setAnalysisProgress({
        current: 0,
        total: Math.max(candidateWords.length, 1),
        currentWord: candidateWords[0] || '準備分析中',
      });
      if (candidateWords.length === 0) {
        Alert.alert('未選擇關鍵字', '你尚未選擇關鍵字，請先選擇要學習的字詞。');
        return;
      }

      let textToAnalyze = cachedItem.contentText || '';

      // 如果是圖片類型，先進行 OCR
      if (cachedItem.contentType === 'image' && cachedItem.imageStoragePath) {
        console.log('[CreateCard] Performing OCR on image');
        
        if (!isOCRAvailable()) {
          Alert.alert(
            '需要 Apple Vision OCR',
            '圖片文字識別功能需要 iOS Apple Vision（僅 iPhone/iPad 支援）。'
          );
          setAnalyzing(false);
          return;
        }

        // 安全取得 annotations（DB 讀出時可能已是陣列）
        const annotations = getAnnotationsArray(cachedItem.imageAnnotations);

        if (annotations.length > 0) {
          const validSelectedIndexes = selectedBlockIndexes.filter(
            (index) => Number.isInteger(index) && index >= 0 && index < annotations.length
          );
          if (validSelectedIndexes.length > 0) {
            console.log('[CreateCard] Using context-based analysis for blocks:', validSelectedIndexes);
            const nextDrafts: MultiCardDraft[] = [];
            const totalBlocks = validSelectedIndexes.length;

            for (let blockIndex = 0; blockIndex < validSelectedIndexes.length; blockIndex++) {
              const selectedIndex = validSelectedIndexes[blockIndex];
              const currentWord = annotations[selectedIndex]?.text?.trim() || `第 ${blockIndex + 1} 個字`;
              setAnalysisProgress({
                current: blockIndex + 1,
                total: totalBlocks,
                currentWord,
              });
              try {
                const payload = buildContextPayload(annotations as any[], selectedIndex);
                const result = await analyzeTextWithAI(payload, aiPersonalization);
                nextDrafts.push({
                  targetWord: result.keyword,
                  definition: result.definition,
                  partOfSpeech: result.partOfSpeech || '',
                  contextualExplanation:
                    result.contextualExplanation || result.example || undefined,
                  frequentCollocations: result.frequentCollocations || undefined,
                  phoneticTranscription: result.pronunciation || undefined,
                  tags: result.tags,
                });
              } catch (error) {
                const fallbackWord = annotations[selectedIndex]?.text || '';
                if (fallbackWord.trim()) {
                  nextDrafts.push({
                    targetWord: fallbackWord.trim(),
                    definition: `${fallbackWord.trim()}（待補充定義）`,
                    partOfSpeech: '',
                    contextualExplanation: undefined,
                    frequentCollocations: undefined,
                    phoneticTranscription: undefined,
                    tags: [],
                  });
                }
                console.error('[CreateCard] Block analysis failed, fallback to local word:', error);
              }
            }

            const dedupedDrafts = Array.from(
              new Map(nextDrafts.map((draft) => [draft.targetWord.toLowerCase(), draft])).values()
            );
            setMultiCardDrafts(dedupedDrafts);
            setSelectedDraftWord(null);

            if (dedupedDrafts.length > 0) {
              const first = dedupedDrafts[0];
              setTargetWord(first.targetWord);
              setDefinition(first.definition);
              setPartOfSpeech(first.partOfSpeech || '');
              setContextualExplanation(first.contextualExplanation || '');
              setFrequentCollocations(first.frequentCollocations || '');
              setPhoneticTranscription(first.phoneticTranscription || '');
              setTags(first.tags.join(', '));
              setShowDetailEditor(false);
              setShowAnalysisChoice(false);
              setSuggestedWords(buildFollowupSuggestions(first.targetWord, topRecommendedWords));
              await persistDraft({
                targetWord: first.targetWord,
                targetPhrase,
                definition: first.definition,
                partOfSpeech: first.partOfSpeech || '',
                contextualExplanation: first.contextualExplanation || '',
                frequentCollocations: first.frequentCollocations || '',
                phoneticTranscription: first.phoneticTranscription || '',
                tags: first.tags.join(', '),
                editableKeywords,
                showAnalysisChoice: false,
                showAdvancedFields: true,
                showDetailEditor: false,
                selectedDraftWord: null,
                multiCardDrafts: dedupedDrafts,
                suggestedWords: buildFollowupSuggestions(first.targetWord, topRecommendedWords),
                usingRealAPI: isUsingRealAPI(),
                updatedAt: Date.now(),
              });
            }
            setAnalyzing(false);
            return;
          } else if (candidateWords.length === 0) {
            Alert.alert('未選擇關鍵字', '你尚未選擇關鍵字，請先回上一頁選擇要學習的字詞。');
            return;
          }
        } else {
          // 提取整張圖片的文字
          console.log('[CreateCard] Extracting text from full image');
          console.log('[CreateCard] Image path:', cachedItem.imageStoragePath);
          if (!cachedItem.imageStoragePath) {
            throw new Error('Missing imageStoragePath for OCR analysis');
          }
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
        return;
      }

      if (candidateWords.length > 0) {
        const analyzedDrafts: MultiCardDraft[] = [];
        const total = candidateWords.length;
        for (let index = 0; index < candidateWords.length; index++) {
          const word = candidateWords[index];
          setAnalysisProgress({
            current: index + 1,
            total,
            currentWord: word,
          });
          try {
            const generated = await generateContentForWord(
              word,
              textToAnalyze || getSourceSentence(),
              aiPersonalization
            );
            analyzedDrafts.push({
              targetWord: word,
              definition: generated.definition || '',
              partOfSpeech: generated.partOfSpeech || '',
              contextualExplanation: generated.contextualExplanation || '',
              frequentCollocations: generated.frequentCollocations || '',
              phoneticTranscription: generated.phoneticTranscription || '',
              tags: generated.tags || [],
            });
          } catch (error) {
            console.error('[CreateCard] Keyword analysis fallback:', word, error);
            analyzedDrafts.push({
              targetWord: word,
              definition: `${word}（待補充定義）`,
              partOfSpeech: '',
              contextualExplanation: '',
              frequentCollocations: '',
              phoneticTranscription: '',
              tags: [],
            });
          }
        }
        const dedupedDrafts = Array.from(
          new Map(analyzedDrafts.map((draft) => [draft.targetWord.toLowerCase(), draft])).values()
        );
        if (dedupedDrafts.length === 0) {
          Alert.alert('分析失敗', '目前無法產生可用的字卡預覽，請稍後重試。');
          return;
        }
        const first = dedupedDrafts[0];
        setMultiCardDrafts(dedupedDrafts);
        setSelectedDraftWord(null);
        setTargetWord(first.targetWord);
        setDefinition(first.definition || '');
        setPartOfSpeech(first.partOfSpeech || '');
        setContextualExplanation(first.contextualExplanation || '');
        setFrequentCollocations(first.frequentCollocations || '');
        setPhoneticTranscription(first.phoneticTranscription || '');
        setTags((first.tags || []).join(', '));
        setShowDetailEditor(false);
        setShowAnalysisChoice(false);
        setSuggestedWords(buildFollowupSuggestions(first.targetWord, topRecommendedWords));
        await persistDraft({
          targetWord: first.targetWord,
          targetPhrase,
          definition: first.definition || '',
          partOfSpeech: first.partOfSpeech || '',
          contextualExplanation: first.contextualExplanation || '',
          frequentCollocations: first.frequentCollocations || '',
          phoneticTranscription: first.phoneticTranscription || '',
          tags: (first.tags || []).join(', '),
          editableKeywords,
          showAnalysisChoice: false,
          showAdvancedFields,
          showDetailEditor: false,
          selectedDraftWord: null,
          multiCardDrafts: dedupedDrafts,
          suggestedWords: buildFollowupSuggestions(first.targetWord, topRecommendedWords),
          usingRealAPI: isUsingRealAPI(),
          updatedAt: Date.now(),
        });
        return;
      }
      Alert.alert('未選擇關鍵字', '你尚未選擇關鍵字，請先輸入或選擇要學習的字詞。');
      return;
    } catch (error) {
      console.error('Analysis error:', error);
      if (error instanceof AIAuthError) {
        if (authRedirectingRef.current) {
          return;
        }
        const loggedIn = await hasLocalSession();
        if (!loggedIn) {
          authRedirectingRef.current = true;
          await redirectToLogin();
          return;
        }

        Alert.alert(
          '登入狀態異常',
          '目前登入憑證無法通過伺服器驗證，請點「重新登入」以修復。',
          [
            {
              text: '取消',
              style: 'cancel',
            },
            {
              text: '重新登入',
              onPress: () => {
                authRedirectingRef.current = true;
                void redirectToLogin();
              },
            },
          ]
        );
        return;
      }
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
      setAnalysisProgress(null);
    }
  };

  const handleSuggestedWordSelection = async (word: string) => {
    setTargetWord(word);
    setAnalyzing(true);
    setAnalysisProgress({
      current: 1,
      total: 1,
      currentWord: word,
    });
    try {
      const content = await generateContentForWord(word, getSourceSentence(), aiPersonalization);
      setMultiCardDrafts([
        {
          targetWord: word,
          definition: content.definition || '',
          partOfSpeech: content.partOfSpeech || '',
          contextualExplanation: content.contextualExplanation || '',
          frequentCollocations: content.frequentCollocations || '',
          phoneticTranscription: content.phoneticTranscription || '',
          tags: content.tags || [],
        },
      ]);
      setSelectedDraftWord(null);
      setDefinition(content.definition || '');
      setPartOfSpeech(content.partOfSpeech || '');
      setContextualExplanation(content.contextualExplanation || '');
      setFrequentCollocations(content.frequentCollocations || '');
      setPhoneticTranscription(content.phoneticTranscription || '');
      setTags((content.tags || []).join(', '));
      setShowDetailEditor(false);
      setShowAnalysisChoice(false);
      setSuggestedWords(buildFollowupSuggestions(word, topRecommendedWords));
      await persistDraft({
        targetWord: word,
        targetPhrase,
        definition: content.definition || '',
        partOfSpeech: content.partOfSpeech || '',
        contextualExplanation: content.contextualExplanation || '',
        frequentCollocations: content.frequentCollocations || '',
        phoneticTranscription: content.phoneticTranscription || '',
        tags: (content.tags || []).join(', '),
        editableKeywords,
        showAnalysisChoice: false,
        showAdvancedFields,
        showDetailEditor: false,
        selectedDraftWord: null,
        multiCardDrafts: [
          {
            targetWord: word,
            definition: content.definition || '',
            partOfSpeech: content.partOfSpeech || '',
            contextualExplanation: content.contextualExplanation || '',
            frequentCollocations: content.frequentCollocations || '',
            phoneticTranscription: content.phoneticTranscription || '',
            tags: content.tags || [],
          },
        ],
        suggestedWords: buildFollowupSuggestions(word, topRecommendedWords),
        usingRealAPI: isUsingRealAPI(),
        updatedAt: Date.now(),
      });
    } catch (error) {
      console.error('Error generating content for selected word:', error);
      Alert.alert('分析失敗', readableAIErrorMessage(error));
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
    }
  };

  const handleSave = async () => {
    // 驗證必填欄位
    if (!targetWord.trim() && editableTerms.length === 0 && multiCardDrafts.length === 0) {
      Alert.alert('錯誤', '請輸入目標單字');
      return;
    }

    if (!definition.trim() && editableTerms.length <= 1 && multiCardDrafts.length === 0) {
      Alert.alert('錯誤', '請輸入定義');
      return;
    }

    setSaving(true);

    try {
      const cardsCollection = database.get<Card>('cards');
      const uniqueTerms = Array.from(new Set(editableTerms.map((term) => term.trim()).filter(Boolean)));
      const draftsToCreate: MultiCardDraft[] =
        multiCardDrafts.length > 0
          ? multiCardDrafts
          : uniqueTerms.map((term) => ({
              targetWord: term,
              definition: definition.trim() || `${term}（待補充定義）`,
              partOfSpeech: partOfSpeech.trim() || undefined,
              contextualExplanation: contextualExplanation.trim() || undefined,
              frequentCollocations: frequentCollocations.trim() || undefined,
              phoneticTranscription: phoneticTranscription.trim() || undefined,
              tags: tags.trim() ? tags.split(',').map((t) => t.trim()) : [],
            }));
      const shouldBatchCreate =
        draftsToCreate.length > 1 || (!targetWord.trim() && draftsToCreate.length > 0);

      await database.write(async () => {
        if (shouldBatchCreate) {
          for (const draft of draftsToCreate) {
            await cardsCollection.create((card) => {
              card.userId = cachedItem.userId;
              card.cachedItemId = cachedItem.id;
              card.targetWord = draft.targetWord;
              card.targetPhrase = targetPhrase.trim() || undefined;
              card.originalSentence = cachedItem.contentText || cachedItem.contentUrl || '';
              card.definition = draft.definition.trim() || `${draft.targetWord}（待補充定義）`;
              card.partOfSpeech = draft.partOfSpeech || undefined;
              card.contextualExplanation = draft.contextualExplanation || undefined;
              card.frequentCollocations = draft.frequentCollocations || undefined;
              card.phoneticTranscription = draft.phoneticTranscription || undefined;
              card.tags = draft.tags.length > 0 ? draft.tags : undefined;
              card.sourceApp = cachedItem.sourceApp;
              card.easeFactor = 2.5;
              card.intervalDays = 1;
              card.repetitions = 0;
              card.nextReviewAt = new Date();
            });
          }
        } else {
          await cardsCollection.create((card) => {
            card.userId = cachedItem.userId;
            card.cachedItemId = cachedItem.id;
            card.targetWord = targetWord.trim();
            card.targetPhrase = targetPhrase.trim() || undefined;
            card.originalSentence = cachedItem.contentText || cachedItem.contentUrl || '';
            card.definition = definition.trim();
            card.partOfSpeech = partOfSpeech.trim() || undefined;
            card.contextualExplanation = contextualExplanation.trim() || undefined;
            card.frequentCollocations = frequentCollocations.trim() || undefined;
            card.phoneticTranscription = phoneticTranscription.trim() || undefined;
            card.tags = tags.trim() ? tags.split(',').map((t) => t.trim()) : undefined;
            card.sourceApp = cachedItem.sourceApp;
            card.easeFactor = 2.5;
            card.intervalDays = 1;
            card.repetitions = 0;
            card.nextReviewAt = new Date();
          });
        }

        // 更新 CachedItem 狀態
        await cachedItem.update((item) => {
          item.convertedToCard = true;
        });
      });
      await AsyncStorage.removeItem(draftStorageKey);
      setHasPersistedDraft(false);

      const createdCount = shouldBatchCreate ? draftsToCreate.length : 1;
      Alert.alert('成功', createdCount > 1 ? `已建立 ${createdCount} 張卡片` : '卡片創建成功！', [
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

  const handlePreviewDraftPress = (draft: MultiCardDraft) => {
    setSelectedDraftWord(draft.targetWord);
    setTargetWord(draft.targetWord);
    setDefinition(draft.definition || '');
    setPartOfSpeech(draft.partOfSpeech || '');
    setContextualExplanation(draft.contextualExplanation || '');
    setFrequentCollocations(draft.frequentCollocations || '');
    setPhoneticTranscription(draft.phoneticTranscription || '');
    setTags((draft.tags || []).join(', '));
    setShowDetailEditor(true);
    setShowAdvancedFields(true);
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
            {saving ? '建立中...' : '建立卡片'}
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
          {editableTerms.length > 1 && (
            <Text style={styles.batchHint}>
              🧩 已設定 {editableTerms.length} 個關鍵字，儲存時會一次建立多張卡片
            </Text>
          )}
          {multiCardDrafts.length > 0 && (
            <View style={styles.multiPreviewContainer}>
              {multiCardDrafts.map((draft, index) => (
                <TouchableOpacity
                  key={`${draft.targetWord}-${index}`}
                  style={[
                    styles.multiPreviewCard,
                    selectedDraftWord === draft.targetWord && styles.multiPreviewCardActive,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => handlePreviewDraftPress(draft)}
                >
                  <Text style={styles.multiPreviewTitle}>
                    字卡 {index + 1}: {draft.targetWord}
                  </Text>
                  <Text style={styles.multiPreviewText} numberOfLines={2}>
                    {draft.definition}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {multiCardDrafts.length > 0 && !showDetailEditor && (
            <Text style={styles.previewTapHint}>
              請先點擊上方字卡預覽按鈕，再查看詳細資訊。
            </Text>
          )}
        </View>

        {/* 分析方式選擇 */}
        {!analyzing && showAnalysisChoice && (
          <View style={styles.choiceContainer}>
            <Text style={styles.choiceTitle}>選擇填寫方式</Text>
            <View style={styles.choiceButtons}>
              <TouchableOpacity
                style={[styles.choiceButton, styles.aiButton]}
                onPress={() => {
                  void performAnalysis();
                }}
              >
                <Text style={styles.choiceButtonText}>🤖 AI 分析</Text>
                <Text style={styles.choiceButtonHint}>自動建議單字與定義</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.choiceButton, styles.manualButton]}
                onPress={() => {
                  const nextShowAnalysisChoice = false;
                  const nextShowDetailEditor = true;
                  setShowAnalysisChoice(false);
                  setShowDetailEditor(true);
                  setMultiCardDrafts([]);
                  setSelectedDraftWord(null);
                  void persistDraft({
                    targetWord,
                    targetPhrase,
                    definition,
                    partOfSpeech,
                    contextualExplanation,
                    frequentCollocations,
                    phoneticTranscription,
                    tags,
                    editableKeywords,
                    showAnalysisChoice: nextShowAnalysisChoice,
                    showAdvancedFields,
                    showDetailEditor: nextShowDetailEditor,
                    selectedDraftWord: null,
                    multiCardDrafts: [],
                    suggestedWords,
                    usingRealAPI: isUsingRealAPI(),
                    updatedAt: Date.now(),
                  });
                }}
              >
                <Text style={styles.choiceButtonText}>✍️ 手動輸入</Text>
                <Text style={styles.choiceButtonHint}>自行填寫卡片內容</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.apiStatusContainer}>
              <Text style={styles.apiStatusText}>💡 AI 會先填好主卡片，再推薦你可能也想學的其他字</Text>
            </View>
          </View>
        )}

        {analyzing && (
          <View style={styles.analyzingContainer}>
            <View style={styles.analyzingHeaderRow}>
              <ActivityIndicator size="small" color="#4CAF50" />
              <Text style={styles.analyzingText}>🤖 AI 分析中...</Text>
            </View>
            {analysisProgress && (
              <Animated.View style={[styles.progressContainer, { opacity: progressOpacity }]}>
                <Text style={styles.progressText}>
                  {analysisProgress.current}/{analysisProgress.total} · {analysisProgress.currentWord}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.max(
                          8,
                          Math.round(
                            (analysisProgress.current / Math.max(analysisProgress.total, 1)) * 100
                          )
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </Animated.View>
            )}
          </View>
        )}

        {!analyzing && !showAnalysisChoice && (
          <View style={styles.apiStatusContainer}>
            <Text style={styles.apiStatusText}>
              {usingRealAPI ? '✨ 目前使用真實 AI API' : '💡 目前使用本地 fallback'}
            </Text>
          </View>
        )}

        {!analyzing && suggestedWords.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <Text style={styles.label}>💡 你可能也會想知道...</Text>
            <View style={styles.suggestionsRow}>
              {suggestedWords.map((word, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.suggestionChip, targetWord === word && styles.suggestionChipActive]}
                  onPress={() => {
                    void handleSuggestedWordSelection(word);
                  }}
                >
                  <Text style={[styles.suggestionChipText, targetWord === word && styles.suggestionChipTextActive]}>
                    {word}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.bottomKeywordContainer}>
          <Text style={styles.bottomKeywordTitle}>關鍵字（可編輯）</Text>
          <TextInput
            style={styles.input}
            placeholder="例如：resilient, ambiguity"
            value={editableKeywords}
            onChangeText={(text) => {
              keywordEditedRef.current = true;
              setEditableKeywords(text);
            }}
            autoCapitalize="none"
          />
          <Text style={styles.hint}>用逗號分隔；這裡會決定 AI 分析與批次建立卡片的關鍵字</Text>
        </View>
      </ScrollView>

      <Modal
        visible={showDetailEditor}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDetailEditor(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            style={styles.modalContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>詳細資訊</Text>
              <TouchableOpacity
                onPress={() => setShowDetailEditor(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              {/* 目標單字 */}
              <Text style={styles.label}>Target Word *</Text>
              <TextInput
                style={styles.input}
                placeholder="例如：ephemeral"
                value={targetWord}
                onChangeText={setTargetWord}
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

              <TouchableOpacity
                style={styles.advancedToggle}
                onPress={() => setShowAdvancedFields((prev) => !prev)}
              >
                <Text style={styles.advancedToggleText}>
                  {showAdvancedFields ? '收起進階欄位' : '展開進階欄位'}
                </Text>
                <Text style={styles.advancedToggleHint}>
                  {showAdvancedFields ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {showAdvancedFields && (
                <>
                  {/* 目標短語 */}
                  <Text style={styles.label}>Target Phrase (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="例如：ephemeral beauty"
                    value={targetPhrase}
                    onChangeText={setTargetPhrase}
                    autoCapitalize="none"
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

                  {/* 詞性 */}
                  <Text style={styles.label}>Part of Speech (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="例如：noun, verb, adjective"
                    value={partOfSpeech}
                    onChangeText={setPartOfSpeech}
                  />

                  {/* 常見搭配詞 */}
                  <Text style={styles.label}>Frequent Collocations (Optional)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="例如：take responsibility; bear responsibility"
                    value={frequentCollocations}
                    onChangeText={setFrequentCollocations}
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
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e6e6e6',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2933',
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f0f2f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#52606d',
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
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
  batchHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '600',
  },
  multiPreviewContainer: {
    marginTop: 10,
    gap: 8,
  },
  multiPreviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dce3ea',
    padding: 10,
  },
  multiPreviewCardActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  multiPreviewTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 4,
  },
  multiPreviewText: {
    fontSize: 12,
    color: '#4f5d6b',
    lineHeight: 18,
  },
  previewTapHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '600',
  },
  analyzingContainer: {
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    marginBottom: 16,
  },
  analyzingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzingText: {
    fontSize: 14,
    color: '#4CAF50',
    marginLeft: 8,
    fontWeight: '600',
  },
  progressContainer: {
    marginTop: 10,
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 2,
  },
  progressText: {
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#c8e6c9',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2e7d32',
    borderRadius: 3,
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
  bottomKeywordContainer: {
    marginTop: 8,
    marginBottom: 24,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  bottomKeywordTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2f3e46',
    marginBottom: 8,
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
  advancedToggle: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#dfe4ea',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f8f9fb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  advancedToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
  },
  advancedToggleHint: {
    fontSize: 12,
    color: '#6c757d',
    fontWeight: '600',
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
