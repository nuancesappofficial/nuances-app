import React from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect } from '@react-navigation/native';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import type Card from '@database/models/Card';
import { generateContentForWord } from '@services/ai';
import { isPremiumFeatureError } from '@services/ai/edgeAiClient';
import { speakEnglishNaturally } from '@services/tts/localSpeech';
import type { EntitlementSnapshot } from '@services/subscription/SubscriptionService';
import SubscriptionService from '@services/subscription/SubscriptionService';
import {
  AI_BREAKDOWN_MODE_OPTIONS,
  DEFAULT_USER_SETTINGS,
  getAIBreakdownModeLabel,
  loadUserSettings,
  normalizeAIBreakdownMode,
  saveUserSettings,
  type AIBreakdownMode,
} from '@services/settings/userSettings';
import { extractTextFromImage } from '@services/ocr/ocrService';
import { getLocalPhoneticTranscription } from '@services/pronunciation/localPhonetics';
import { supabase } from '@services/supabase/client';
import { persistLocalCardImage } from '@services/media/localCardImageStore';
import CardAlbumSheetModalUI from '../../../components/UI/DeckScreenUI/CardAlbumSheetModalUI';
import CreateAlbumModalUI from '../../../components/UI/DeckScreenUI/CreateAlbumModalUI';
import { loadCardStickyNotes, saveCardStickyNotes } from '../../../features/deck/cardStickyNotes';
import {
  ALBUM_TAG_PREFIX,
  ALL_CARDS_ALBUM_ID,
  FAVORITES_ALBUM_ID,
  buildDeckAlbums,
  createCustomAlbum,
  loadDeckAlbumPreferences,
  saveDeckAlbumPreferences,
  type DeckAlbumPreferences,
} from '../../../features/deck/albums';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import {
  CreateCardGhostPreviewScene as CreateCardPreviewScene,
  GHOST_CARD_STATUS_TEXT,
} from '../../../components/UI/CacheScreenUI/CreateCardGhostPreviewSceneUI';
import type { CompletedCard, PreviewPhase, PreviewRevealState } from './types';
import { buildManualCardDraft, buildTourSampleCard, TOUR_TARGET_WORD } from '../../../features/createCard/draftBuilders';
import { normalizeDisplayWord, normalizeSelectableTerm, pickSentenceContainingWord, tokenizeSourceText } from '../../../features/createCard/textTransforms';
import {
  COMPLETE_PREVIEW_REVEAL,
  EMPTY_PREVIEW_REVEAL,
  runCardRevealSequence as runPreviewRevealSequence,
} from '../../../features/createCard/revealSequence';
import TutorialSpotlight from '../../../components/UI/shared/TutorialSpotlight';
import { useAppTour } from '../../../contexts/AppTourContext';
import {
  CONTAINER_NEON_GLOW,
  CONTAINER_NEON_OUTLINE,
  MODAL_CTA_COLOR,
  MODAL_CTA_COLOR_BORDER,
  TEXT_ON_CTA,
  UPLOAD_CACHE_CTA_COLOR,
  UPLOAD_CACHE_CTA_COLOR_BORDER,
  resolveThemeColors,
} from '../../../theme/colors';

type Props = {
  navigation: any;
  route: any;
};

type GeneratingCard = {
  word: string;
  completed: boolean;
};

const albumIdToCategoryTag: Record<string, string> = {
  slang: 'slang',
  culture: 'culture',
  work: 'work',
};

const AI_MODE_ICON_BY_VALUE: Record<AIBreakdownMode, any> = {
  short_punchy: require('../../../../assets/onboarding_q3_assets/q3-lightning-cutout.png'),
  context: require('../../../../assets/onboarding_q3_assets/q3-bubble-cutout.png'),
  deep_dive: require('../../../../assets/onboarding_q3_assets/q3-nodes-cutout.png'),
};

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

function getCachedItemSourceText(cachedItem: CachedItem): string {
  if (cachedItem.contentText?.trim()) return cachedItem.contentText.trim();

  const annotations = getAnnotationsArray(cachedItem.imageAnnotations);
  const fromAnnotations = annotations
    .map((ann) => ann.text?.trim() || '')
    .filter(Boolean)
    .join(' ');
  if (fromAnnotations) return fromAnnotations;

  return cachedItem.contentUrl || '';
}

function triggerBuzzHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  setTimeout(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, 90);
}

async function uploadCardImageToSupabase(params: {
  imageUri: string;
  cachedItemId: string;
}): Promise<string | null> {
  const { imageUri, cachedItemId } = params;
  if (!imageUri.trim()) return null;
  if (/^https?:\/\//i.test(imageUri)) return imageUri;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    throw authError || new Error('尚未登入，無法上傳圖片');
  }

  // Normalize to JPEG before upload to avoid iOS Blob corruption / decoder issues.
  const normalized = await ImageManipulator.manipulateAsync(
    imageUri,
    [],
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
  );
  const base64 = await FileSystemLegacy.readAsStringAsync(normalized.uri, {
    encoding: 'base64',
  });
  if (!base64) {
    throw new Error('圖片轉碼失敗：無法讀取 base64');
  }
  const dataUrl = `data:image/jpeg;base64,${base64}`;
  const imageBytes = await fetch(dataUrl).then((res) => res.arrayBuffer());
  if (!imageBytes || imageBytes.byteLength === 0) {
    throw new Error('圖片轉碼失敗：位元組內容為空');
  }
  const storagePath = `${user.id}/${cachedItemId}/${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('cached-images')
    .upload(storagePath, imageBytes, {
      cacheControl: '3600',
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from('cached-images')
    .createSignedUrl(storagePath, 60 * 60);
  if (signedError || !signedData?.signedUrl) {
    throw new Error(
      `圖片已上傳，但無法建立讀取簽名網址（可能是 Storage 權限設定問題）: ${signedError?.message || 'unknown error'}`
    );
  }

  return storagePath;
}

export default function CreateCardScreen({ navigation, route }: Props) {
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const appTour = useAppTour();
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const isLight = colorScheme === 'light';
  const {
    cachedItem,
    croppedImageUri,
    originalImageUri: routeOriginalImageUri,
    runOcrOnLoad,
    generationMode,
  } = route.params as {
    cachedItem: CachedItem;
    croppedImageUri?: string;
    originalImageUri?: string;
    runOcrOnLoad?: boolean;
    generationMode?: 'manual' | 'ai-assisted';
  };
  const normalizedTourSampleTarget = React.useMemo(
    () => normalizeSelectableTerm(TOUR_TARGET_WORD),
    []
  );

  const goToCacheHome = React.useCallback(() => {
    if (typeof navigation?.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('CacheList');
  }, [navigation]);

  const baseSourceText = React.useMemo(() => getCachedItemSourceText(cachedItem), [cachedItem]);
  const ocrImageUri = React.useMemo(
    () => croppedImageUri || routeOriginalImageUri || cachedItem.mediaUri || cachedItem.imageStoragePath || null,
    [cachedItem.imageStoragePath, cachedItem.mediaUri, croppedImageUri, routeOriginalImageUri]
  );
  const originalImageUri = React.useMemo(
    () => routeOriginalImageUri || cachedItem.mediaUri || croppedImageUri || cachedItem.imageStoragePath || null,
    [cachedItem.imageStoragePath, cachedItem.mediaUri, croppedImageUri, routeOriginalImageUri]
  );
  const [ocrSourceText, setOcrSourceText] = React.useState('');
  const [isOcrRunning, setIsOcrRunning] = React.useState(false);
  const [ocrError, setOcrError] = React.useState<string | null>(null);
  const [aiReplyLanguage, setAiReplyLanguage] = React.useState(DEFAULT_USER_SETTINGS.aiReplyLanguage);
  const [aiBreakdownMode, setAiBreakdownMode] = React.useState<AIBreakdownMode>(
    DEFAULT_USER_SETTINGS.personalization.aiBreakdownMode
  );
  const [isAIModeDropdownOpen, setIsAIModeDropdownOpen] = React.useState(false);
  const selectedAIBreakdownOption = React.useMemo(
    () =>
      AI_BREAKDOWN_MODE_OPTIONS.find((option) => option.value === aiBreakdownMode) ??
      AI_BREAKDOWN_MODE_OPTIONS[1],
    [aiBreakdownMode]
  );
  const sourceText = React.useMemo(
    () => (ocrSourceText.trim() ? ocrSourceText : baseSourceText),
    [baseSourceText, ocrSourceText]
  );
  const sourceTokens = React.useMemo(() => {
    const fromText = sourceText.trim() ? tokenizeSourceText(sourceText) : [];
    if (fromText.length > 0) return fromText;

    const highlights = Array.isArray(cachedItem.aiHighlightedTerms)
      ? cachedItem.aiHighlightedTerms.filter(Boolean)
      : [];
    if (highlights.length > 0) return highlights;

    return ['example', 'word'];
  }, [cachedItem.aiHighlightedTerms, sourceText]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await loadUserSettings();
        if (!cancelled) {
          setAiReplyLanguage(settings.aiReplyLanguage);
          setAiBreakdownMode(normalizeAIBreakdownMode(settings.personalization.aiBreakdownMode));
        }
      } catch (error) {
        console.error('[CreateCard] load ai reply language failed:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectAIBreakdownMode = React.useCallback(async (mode: AIBreakdownMode) => {
    const nextMode = normalizeAIBreakdownMode(mode);
    setAiBreakdownMode(nextMode);
    setIsAIModeDropdownOpen(false);

    try {
      const settings = await loadUserSettings();
      await saveUserSettings({
        ...settings,
        personalization: {
          ...settings.personalization,
          aiBreakdownMode: nextMode,
        },
      });
    } catch (error) {
      console.error('[CreateCard] save AI mode failed:', error);
    }

    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) return;
        await supabase
          .from('profiles')
          .update({
            ai_breakdown_mode: nextMode,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);
      } catch (error) {
        console.error('[CreateCard] sync AI mode profile failed:', error);
      }
    })();
  }, []);

  const [selectedWords, setSelectedWords] = React.useState<string[]>([]);
  const [hasStarted, setHasStarted] = React.useState(false);
  const [generatingCards, setGeneratingCards] = React.useState<GeneratingCard[]>([]);
  const [completedCards, setCompletedCards] = React.useState<CompletedCard[]>([]);
  const [entitlementSnapshot, setEntitlementSnapshot] = React.useState<EntitlementSnapshot | null>(null);
  const [showCollocations, setShowCollocations] = React.useState<Record<string, boolean>>({});
  const [generatedWords, setGeneratedWords] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [albumPrefs, setAlbumPrefs] = React.useState<DeckAlbumPreferences>({
    customAlbums: [],
    albumNameOverrides: {},
    albumEmojiOverrides: {},
    albumColorOverrides: {},
    albumCoverOverrides: {},
    deletedAlbumIds: [],
  });
  const [showAlbumSheet, setShowAlbumSheet] = React.useState(false);
  const [albumTargetWord, setAlbumTargetWord] = React.useState<string | null>(null);
  const [isCreateAlbumModalVisible, setIsCreateAlbumModalVisible] = React.useState(false);
  const [newAlbumName, setNewAlbumName] = React.useState('');
  const [ghostStatusIndex, setGhostStatusIndex] = React.useState(0);
  const [previewWordAudioLoading, setPreviewWordAudioLoading] = React.useState<string | null>(null);
  const [generationFailure, setGenerationFailure] = React.useState<{ word: string; message: string } | null>(null);
  const scrollRef = React.useRef<ScrollView | null>(null);
  const previewSceneYRef = React.useRef<number>(0);
  const previewRunIdRef = React.useRef(0);
  const [activePreviewCard, setActivePreviewCard] = React.useState<CompletedCard | null>(null);
  const [previewPhase, setPreviewPhase] = React.useState<PreviewPhase>('frontThinking');
  const [previewRevealState, setPreviewRevealState] = React.useState<PreviewRevealState>(EMPTY_PREVIEW_REVEAL);
  const effectiveGenerationMode = React.useMemo<'manual' | 'ai-assisted'>(() => {
    if (generationMode) return generationMode;
    if (!entitlementSnapshot) return 'manual';
    return entitlementSnapshot.canUseAutoCardGeneration ? 'ai-assisted' : 'manual';
  }, [entitlementSnapshot?.canUseAutoCardGeneration, generationMode]);
  const isGhostGenerating = hasStarted && generatingCards.some((card) => !card.completed);
  const isPreviewSceneActive = Boolean(activePreviewCard) || isGhostGenerating;
  const shouldHideSourcePanels = hasStarted;
  const allAlbums = React.useMemo(
    () => buildDeckAlbums(allCards, {}, albumPrefs).filter((album) => album.id !== ALL_CARDS_ALBUM_ID),
    [albumPrefs, allCards]
  );
  const albumTargetCard = React.useMemo(
    () =>
      (albumTargetWord && completedCards.find((card) => card.word === albumTargetWord)) ||
      (albumTargetWord && activePreviewCard?.word === albumTargetWord ? activePreviewCard : null),
    [activePreviewCard, albumTargetWord, completedCards]
  );

  const selectTourSampleTarget = React.useCallback(() => {
    if (!normalizedTourSampleTarget) return;
    setSelectedWords((prev) =>
      prev.includes(normalizedTourSampleTarget) ? prev : [normalizedTourSampleTarget, ...prev]
    );
  }, [normalizedTourSampleTarget]);

  React.useEffect(() => {
    if (!hasStarted || !generatingCards.some((card) => !card.completed)) {
      setGhostStatusIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setGhostStatusIndex((prev) => (prev + 1) % GHOST_CARD_STATUS_TEXT.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [generatingCards, hasStarted]);

  React.useEffect(() => {
    let active = true;
    const runOCR = async () => {
      if (!runOcrOnLoad || !ocrImageUri) return;
      setIsOcrRunning(true);
      setOcrError(null);
      try {
        const result = await extractTextFromImage(ocrImageUri);
        if (!active) return;
        const textFromBlocks = result.blocks
          .map((block) => block.text?.trim() || '')
          .filter(Boolean)
          .join(' ');
        const nextText = (result.fullText || '').trim() || textFromBlocks;
        if (nextText) {
          setOcrSourceText(nextText);
        } else {
          setOcrError('OCR 沒有辨識到可用文字');
        }
      } catch (error) {
        if (!active) return;
        console.error('[CreateCard] OCR failed:', error);
        setOcrError('OCR 失敗，已使用原始內容');
      } finally {
        if (active) {
          setIsOcrRunning(false);
        }
      }
    };
    void runOCR();
    return () => {
      active = false;
    };
  }, [ocrImageUri, runOcrOnLoad]);

  const refreshEntitlementSnapshot = React.useCallback(
    async (options?: { cancelled?: () => boolean }) => {
      try {
        const snapshot = await SubscriptionService.getEntitlementSnapshot(cachedItem.userId);
        if (!options?.cancelled?.()) {
          setEntitlementSnapshot(snapshot);
        }
      } catch (error) {
        console.error('[CreateCard] load entitlement snapshot failed:', error);
      }
    },
    [cachedItem.userId]
  );

  React.useEffect(() => {
    let cancelled = false;
    void refreshEntitlementSnapshot({ cancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [refreshEntitlementSnapshot]);

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      void refreshEntitlementSnapshot({ cancelled: () => cancelled });
      return () => {
        cancelled = true;
      };
    }, [refreshEntitlementSnapshot])
  );

  React.useEffect(() => {
    const queryCards = database
      .get<Card>('cards')
      .query(Q.where('user_id', cachedItem.userId), Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

    void queryCards.fetch().then(setAllCards).catch((error) => {
      console.error('[CreateCard] load deck cards failed:', error);
      setAllCards([]);
    });

    const sub = queryCards.observe().subscribe((data) => {
      setAllCards(data);
    });
    return () => sub.unsubscribe();
  }, [cachedItem.userId]);

  React.useEffect(() => {
    let cancelled = false;
    void loadDeckAlbumPreferences()
      .then((prefs) => {
        if (!cancelled) setAlbumPrefs(prefs);
      })
      .catch((error) => {
        console.error('[CreateCard] load album preferences failed:', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const scrollToPreviewPosition = React.useCallback((targetY: number) => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, targetY),
      animated: true,
    });
  }, []);

  const scrollToPreviewFront = React.useCallback(() => {
    scrollToPreviewPosition(previewSceneYRef.current - 10);
  }, [scrollToPreviewPosition]);

  const runCardRevealSequence = React.useCallback(
    async (card: CompletedCard) => {
      const runId = ++previewRunIdRef.current;
      await runPreviewRevealSequence({
        card,
        runId,
        isCurrentRun: (id) => previewRunIdRef.current === id,
        setActivePreviewCard,
        setPreviewPhase,
        setPreviewRevealState,
        scrollToPreviewFront,
      });
    },
    [scrollToPreviewFront]
  );

  const toggleWord = (word: string) => {
    const cleanWord = normalizeSelectableTerm(word);
    if (!cleanWord) return;

    setSelectedWords((prev) =>
      prev.includes(cleanWord) ? prev.filter((w) => w !== cleanWord) : [...prev, cleanWord]
    );
  };

  const openMembershipPaywall = React.useCallback(() => {
    tabSwipeContext?.openMembershipPaywall({ returnTo: 'create-card' });
  }, [tabSwipeContext]);

  React.useEffect(() => {
    if (appTour.step === 'STEP_6_GENERATE_SAMPLE') {
      selectTourSampleTarget();
    }
  }, [appTour.step, selectTourSampleTarget]);

  const handleTourWordPress = React.useCallback(() => {
    selectTourSampleTarget();
    if (appTour.step === 'STEP_5_SELECT_TARGET') {
      appTour.nextStep();
    }
  }, [appTour, selectTourSampleTarget]);

  const processWord = React.useCallback(
    async (word: string) => {
      const sentenceForCard = pickSentenceContainingWord(sourceText, word) || sourceText || word;
      try {
        const isTourSampleGeneration =
          appTour.step === 'STEP_6_GENERATE_SAMPLE' &&
          normalizeSelectableTerm(word) === normalizeSelectableTerm(TOUR_TARGET_WORD);

        if (isTourSampleGeneration) {
          const card = buildTourSampleCard(sentenceForCard);
          setGeneratingCards((prev) =>
            prev.map((item) =>
              item.word === word ? { ...item, completed: true } : item
            )
          );
          await runCardRevealSequence(card);
          setCompletedCards((prev) => [card, ...prev]);
          setActivePreviewCard(null);
          setPreviewPhase('complete');
          setPreviewRevealState(COMPLETE_PREVIEW_REVEAL);
          setGenerationFailure((current) => (current?.word === word ? null : current));
          setGeneratedWords((prev) => new Set([...prev, word]));
          return true;
        }

        if (effectiveGenerationMode === 'manual') {
          const localPhonetic = await getLocalPhoneticTranscription(word);
          const card = {
            ...buildManualCardDraft(word, localPhonetic),
            sourceSentence: sentenceForCard,
            selectedAlbumIds: [],
          };
          setGeneratingCards((prev) =>
            prev.map((item) =>
              item.word === word ? { ...item, completed: true } : item
            )
          );
          setCompletedCards((prev) => [card, ...prev]);
          setGenerationFailure((current) => (current?.word === word ? null : current));
          setGeneratedWords((prev) => new Set([...prev, word]));
          return true;
        }

        const generated = await generateContentForWord(word, sentenceForCard, {
          replyLanguage: aiReplyLanguage,
          aiBreakdownMode,
        });
        triggerBuzzHaptic();
        const resolvedDisplayWord =
          normalizeDisplayWord(generated.suggestedWord || word) || word;
        const resolvedTargetPhrase =
          generated.isPartOfPhrase && generated.detectedPhrase
            ? normalizeDisplayWord(generated.detectedPhrase)
            : undefined;
        const card: CompletedCard = {
          word,
          displayWord: resolvedDisplayWord,
          targetPhrase:
            resolvedTargetPhrase && resolvedTargetPhrase.toLowerCase() !== resolvedDisplayWord.toLowerCase()
              ? resolvedTargetPhrase
              : undefined,
          partOfSpeech: generated.partOfSpeech || 'noun',
          definition: generated.definition || `${resolvedDisplayWord}（待補充定義）`,
          cultural: generated.contextualExplanation || '',
          collocationsText: (generated.frequentCollocations || '').trim(),
          note: '',
          phoneticTranscription: generated.phoneticTranscription || null,
          sourceSentence: sentenceForCard,
          manualMode: false,
          addedToDeck: true,
          selectedAlbumIds: [],
          aiBreakdownMode,
          tags: generated.tags || [],
        };

        setGeneratingCards((prev) =>
          prev.map((item) =>
            item.word === word ? { ...item, completed: true } : item
          )
        );
        await runCardRevealSequence(card);
        setCompletedCards((prev) => [card, ...prev]);
        setActivePreviewCard(null);
        setPreviewPhase('complete');
        setPreviewRevealState(COMPLETE_PREVIEW_REVEAL);
        setGenerationFailure((current) => (current?.word === word ? null : current));
        setGeneratedWords((prev) => new Set([...prev, word]));
        return true;
      } catch (error) {
        if (isPremiumFeatureError(error)) {
          setGeneratingCards([]);
          setActivePreviewCard(null);
          setPreviewPhase('frontThinking');
          setPreviewRevealState(EMPTY_PREVIEW_REVEAL);
          setGenerationFailure(null);
          if (appTour.step !== 'STEP_6_GENERATE_SAMPLE') {
            openMembershipPaywall();
          }
          return false;
        }
        console.error('[CreateCard] generate failed:', word, error);
        const message = error instanceof Error ? error.message : 'Unable to generate this card. Please try again.';
        setGeneratingCards((prev) =>
          prev.map((item) =>
            item.word === word ? { ...item, completed: true } : item
          )
        );
        setActivePreviewCard(null);
        setPreviewPhase('frontThinking');
        setPreviewRevealState(EMPTY_PREVIEW_REVEAL);
        setGenerationFailure({ word, message });
        return true;
      }
    },
    [aiBreakdownMode, aiReplyLanguage, appTour.step, effectiveGenerationMode, openMembershipPaywall, runCardRevealSequence, sourceText]
  );

  const beginGenerate = React.useCallback(async () => {
    if (selectedWords.length === 0) return;

    const newWords = selectedWords.filter((word) => !generatedWords.has(word));
    if (newWords.length === 0) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGenerationFailure(null);
    setHasStarted(true);
    setActivePreviewCard(null);
    setPreviewPhase('frontThinking');
    setPreviewRevealState(EMPTY_PREVIEW_REVEAL);
    scrollToPreviewFront();

    for (const word of newWords) {
      setPreviewPhase('frontThinking');
      setPreviewRevealState(EMPTY_PREVIEW_REVEAL);
      setGeneratingCards([{ word, completed: false }]);
      const shouldContinue = await processWord(word);
      if (!shouldContinue) break;
    }

    setTimeout(() => {
      setHasStarted(false);
      setGeneratingCards([]);
    }, 220);
  }, [generatedWords, processWord, scrollToPreviewFront, selectedWords]);

  const cardsToSave = completedCards.filter((card) => card.addedToDeck);
  const newSelectedWords = selectedWords.filter((word) => !generatedWords.has(word));
  const hasNewWords = newSelectedWords.length > 0;
  const previewStackCards = React.useMemo(
    () =>
      activePreviewCard
        ? completedCards.filter((card) => card.word !== activePreviewCard.word)
        : completedCards,
    [activePreviewCard, completedCards]
  );
  const isPlanResolving = !generationMode && !entitlementSnapshot;
  const isGenerateDisabled = selectedWords.length === 0 || isPlanResolving;

  React.useEffect(() => {
    if (!isGhostGenerating) return;
    const timer = setTimeout(() => {
      scrollToPreviewFront();
    }, 60);
    return () => clearTimeout(timer);
  }, [isGhostGenerating, scrollToPreviewFront]);

  const handleGenerate = React.useCallback(async () => {
    if (selectedWords.length === 0 || isPlanResolving) return;
    if (effectiveGenerationMode === 'manual') {
      await beginGenerate();
      return;
    }

    await beginGenerate();
  }, [beginGenerate, effectiveGenerationMode, isPlanResolving, selectedWords.length]);

  const handleTourGeneratePress = React.useCallback(() => {
    if (appTour.step === 'STEP_6_GENERATE_SAMPLE') {
      appTour.nextStep();
      requestAnimationFrame(() => {
        void handleGenerate();
      });
      return;
    }
    void handleGenerate();
  }, [appTour, handleGenerate]);

  const handleOpenPremiumUpsell = React.useCallback((_featureLabel: string) => {
    openMembershipPaywall();
  }, [openMembershipPaywall]);

  const updateCardField = React.useCallback((word: string, patch: Partial<CompletedCard>) => {
    setCompletedCards((prev) => prev.map((card) => (card.word === word ? { ...card, ...patch } : card)));
    setActivePreviewCard((prev) => (prev?.word === word ? { ...prev, ...patch } : prev));
  }, []);

  const updateCardAlbums = React.useCallback((word: string, updater: (albumIds: string[]) => string[]) => {
    const apply = (card: CompletedCard): CompletedCard => ({
      ...card,
      selectedAlbumIds: updater(card.selectedAlbumIds || []),
    });
    setCompletedCards((prev) => prev.map((card) => (card.word === word ? apply(card) : card)));
    setActivePreviewCard((prev) => (prev?.word === word ? apply(prev) : prev));
  }, []);

  const toggleDraftFavorite = React.useCallback(
    (word: string) => {
      updateCardAlbums(word, (albumIds) =>
        albumIds.includes(FAVORITES_ALBUM_ID)
          ? albumIds.filter((id) => id !== FAVORITES_ALBUM_ID)
          : Array.from(new Set([...albumIds, FAVORITES_ALBUM_ID]))
      );
    },
    [updateCardAlbums]
  );

  const toggleDraftAlbum = React.useCallback(
    (albumId: string) => {
      if (!albumTargetWord) return;
      updateCardAlbums(albumTargetWord, (albumIds) =>
        albumIds.includes(albumId) ? albumIds.filter((id) => id !== albumId) : Array.from(new Set([...albumIds, albumId]))
      );
    },
    [albumTargetWord, updateCardAlbums]
  );

  const openDraftAlbumSheet = React.useCallback((word: string) => {
    setAlbumTargetWord(word);
    setShowAlbumSheet(true);
  }, []);

  const openCreateAlbumModal = React.useCallback(() => {
    setShowAlbumSheet(false);
    requestAnimationFrame(() => {
      setIsCreateAlbumModalVisible(true);
    });
  }, []);

  const createAlbum = React.useCallback(async () => {
    const name = newAlbumName.trim();
    if (!name) return;

    const newAlbum = createCustomAlbum(name);
    const nextPrefs: DeckAlbumPreferences = {
      ...albumPrefs,
      customAlbums: [newAlbum, ...albumPrefs.customAlbums],
    };

    try {
      await saveDeckAlbumPreferences(nextPrefs);
      setAlbumPrefs(nextPrefs);
      if (albumTargetWord) {
        updateCardAlbums(albumTargetWord, (albumIds) => Array.from(new Set([...albumIds, newAlbum.id])));
      }
      setIsCreateAlbumModalVisible(false);
      setNewAlbumName('');
      setShowAlbumSheet(true);
    } catch (error) {
      console.error('[CreateCard] create album failed:', error);
      Alert.alert('建立失敗', '建立資料夾時發生問題，請再試一次。');
    }
  }, [albumPrefs, albumTargetWord, newAlbumName, updateCardAlbums]);

  const openDraftPronunciationModal = React.useCallback(() => {
    Alert.alert('Pronunciation Coach', 'Save this card first, then you can practice pronunciation from the card detail screen.');
  }, []);

  const playDraftPreviewWord = React.useCallback((word: string) => {
    const text = word.trim();
    if (!text) {
      Alert.alert('無可朗讀內容', '這張卡片沒有可用於發音播放的文字。');
      return;
    }

    void Haptics.selectionAsync();
    void speakEnglishNaturally(text, {
      onDownloadStart: () => setPreviewWordAudioLoading(text),
      onDownloadEnd: () => setPreviewWordAudioLoading((current) => (current === text ? null : current)),
      onDone: () => setPreviewWordAudioLoading((current) => (current === text ? null : current)),
      onStopped: () => setPreviewWordAudioLoading((current) => (current === text ? null : current)),
      onError: () => setPreviewWordAudioLoading((current) => (current === text ? null : current)),
    });
  }, []);

  const updateNote = (word: string, note: string) => {
    updateCardField(word, { note });
  };

  const toggleCollocations = (word: string) => {
    setShowCollocations((prev) => ({ ...prev, [word]: !prev[word] }));
  };

  const toggleAddToDeck = (word: string) => {
    setCompletedCards((prev) =>
      prev.map((card) => (card.word === word ? { ...card, addedToDeck: !card.addedToDeck } : card))
    );
  };

  const handleSave = async () => {
    if (cardsToSave.length === 0) {
      Alert.alert('尚未選擇', '請先勾選至少一張要加入 Deck 的卡片。');
      return;
    }

    setSaving(true);
    try {
      const imageSourceForUpload =
        originalImageUri ||
        cachedItem.imageStoragePath ||
        '';

      const cardsCollection = database.get<Card>('cards');
      const createdCardIds: string[] = [];
      const stickyDraftsToPersist: Array<{ cardId: string; note: string }> = [];
      await database.write(async () => {
        for (const cardDraft of cardsToSave) {
          const created = await cardsCollection.create((card) => {
            const sourceSentence = (cardDraft.sourceSentence || pickSentenceContainingWord(sourceText, cardDraft.word)).trim();
            card.userId = cachedItem.userId;
            card.cachedItemId = cachedItem.id;
            card.targetWord = cardDraft.displayWord;
            card.targetPhrase = cardDraft.targetPhrase || undefined;
            card.originalSentence = sourceSentence || sourceText;
            card.definition = cardDraft.definition.trim() || `${cardDraft.displayWord}（待補充定義）`;
            card.partOfSpeech = cardDraft.partOfSpeech.trim() || undefined;
            card.contextualExplanation = cardDraft.cultural.trim() || undefined;
            card.frequentCollocations = cardDraft.collocationsText.trim() || undefined;
            card.phoneticTranscription = cardDraft.phoneticTranscription || undefined;
            const selectedAlbumIds = cardDraft.selectedAlbumIds || [];
            const albumTags = selectedAlbumIds.map((id) => `${ALBUM_TAG_PREFIX}${id}`);
            const categoryTags = selectedAlbumIds
              .map((id) => albumIdToCategoryTag[id])
              .filter((tag): tag is string => Boolean(tag));
            const tags = Array.from(
              new Set([
                cachedItem.sourceApp,
                'create-flow',
                cardDraft.aiBreakdownMode ? `ai_mode:${cardDraft.aiBreakdownMode}` : null,
                ...(cardDraft.tags || []),
                ...albumTags,
                ...categoryTags,
              ].filter(Boolean) as string[])
            );
            card.tags = tags.length > 0 ? tags : undefined;
            card.sourceApp = cachedItem.sourceApp;
            card.imageUrl = undefined;
            card.easeFactor = 2.5;
            card.intervalDays = 1;
            card.repetitions = 0;
            card.nextReviewAt = new Date();
          });
          createdCardIds.push(created.id);
          if (cardDraft.note.trim()) {
            stickyDraftsToPersist.push({
              cardId: created.id,
              note: cardDraft.note.trim(),
            });
          }
        }

        await cachedItem.update((item) => {
          item.convertedToCard = true;
          item.deletedAt = new Date();
        });
      });

      if (stickyDraftsToPersist.length > 0) {
        const stickyNotesMap = await loadCardStickyNotes();
        stickyDraftsToPersist.forEach((draft) => {
          stickyNotesMap[draft.cardId] = draft.note;
        });
        await saveCardStickyNotes(stickyNotesMap);
      }
      const localImageSource = originalImageUri || imageSourceForUpload;
      if (localImageSource) {
        await Promise.all(
          createdCardIds.map(async (id) => {
            try {
              const localUri = await persistLocalCardImage(id, localImageSource);
              if (!localUri) {
                console.warn('[CreateCard] local card image persist skipped', {
                  cardId: id,
                  imageSourceForUpload: localImageSource,
                });
              }
            } catch (localPersistError) {
              console.warn('[CreateCard] local card image persist failed', {
                cardId: id,
                error: localPersistError instanceof Error ? localPersistError.message : localPersistError,
              });
            }
          })
        );
      }

      if (appTour.step === 'STEP_7_SAVE_SAMPLE' && createdCardIds.length > 0) {
        appTour.nextStep();
        tabSwipeContext?.goToTab(0, { animation: 'slide', durationMs: 620 });
      } else {
        goToCacheHome();
      }

      if (imageSourceForUpload) {
        setTimeout(() => {
          void (async () => {
            try {
              const uploadedImageUrl = await uploadCardImageToSupabase({
                imageUri: imageSourceForUpload,
                cachedItemId: cachedItem.id,
              });
              if (!uploadedImageUrl) return;
              await database.write(async () => {
                await Promise.all(
                  createdCardIds.map(async (id) => {
                    const row = await database.get<Card>('cards').find(id);
                    await row.update((card) => {
                      card.imageUrl = uploadedImageUrl;
                    });
                  })
                );
                await cachedItem.update((item) => {
                  item.imageStoragePath = uploadedImageUrl;
                });
              });
              console.log('[CreateCard] background image upload succeeded:', {
                cachedItemId: cachedItem.id,
                uploadedImageUrl,
                cardCount: createdCardIds.length,
              });
            } catch (backgroundUploadError) {
              console.warn('[CreateCard] background image upload failed:', backgroundUploadError);
            }
          })();
        }, 0);
      }
    } catch (error) {
      console.error('[CreateCard] save failed:', error);
      const message = error instanceof Error ? error.message : '儲存卡片失敗，請稍後再試。';
      Alert.alert('錯誤', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.containerBg }]} edges={['top']}>
      <KeyboardAvoidingView style={[styles.container, { backgroundColor: palette.screenBg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {!shouldHideSourcePanels && originalImageUri ? (
          <View
            style={[
              styles.block,
              {
                backgroundColor: palette.containerBg,
                borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                shadowOpacity: isLight ? 0.06 : 0.16,
              },
            ]}
          >
            <Text style={[styles.blockTitle, { color: palette.secondaryText }]}>Original Image</Text>
            <Image
              source={{ uri: originalImageUri }}
              style={[styles.originalImage, { backgroundColor: palette.modalOptionBg }]}
              resizeMode="contain"
            />
            {isOcrRunning ? <Text style={[styles.ocrStatus, { color: MODAL_CTA_COLOR }]}>OCR 辨識中...</Text> : null}
            {ocrError ? <Text style={[styles.ocrErrorText, { color: palette.destructiveBg }]}>{ocrError}</Text> : null}
          </View>
        ) : null}

        {!shouldHideSourcePanels ? (
        <View
          style={[
            styles.block,
            {
              backgroundColor: palette.containerBg,
              borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
              shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
              shadowOpacity: isLight ? 0.06 : 0.16,
            },
          ]}
        >
          <Text style={[styles.blockTitle, { color: palette.secondaryText }]}>Original Context</Text>
          <View style={styles.wordsWrap}>
            {sourceTokens.map((token, idx) => {
              const clean = normalizeSelectableTerm(token);
              const isSelected = selectedWords.includes(clean);
              const isTourSampleToken =
                Boolean(normalizedTourSampleTarget) && clean === normalizedTourSampleTarget;
              const tokenPressable = (
                <Pressable
                  key={`${token}-${idx}`}
                  style={({ pressed }) => [
                    styles.tokenBtn,
                    {
                      backgroundColor: isSelected ? MODAL_CTA_COLOR : palette.modalOptionBg,
                      borderColor: isSelected ? MODAL_CTA_COLOR_BORDER : palette.modalOptionBorder,
                    },
                    appTour.step === 'STEP_5_SELECT_TARGET' && isTourSampleToken ? styles.tokenBtnTourActive : null,
                    pressed ? styles.pressableChipPressed : null,
                  ]}
                  onPress={() => {
                    if (appTour.step === 'STEP_5_SELECT_TARGET' && isTourSampleToken) {
                      handleTourWordPress();
                      return;
                    }
                    toggleWord(token);
                  }}
                >
                  <Text
                    style={[
                      styles.tokenText,
                      { color: isSelected ? TEXT_ON_CTA : palette.textOnContainer },
                      isSelected && styles.tokenTextSelected,
                    ]}
                  >
                    {token}
                  </Text>
                </Pressable>
              );
              if (appTour.step === 'STEP_5_SELECT_TARGET' && isTourSampleToken) {
                return (
                  <TutorialSpotlight
                    key={`tour-${token}-${idx}`}
                    active
                    tooltip="Choose “wing”."
                    onSpotlightPress={handleTourWordPress}
                  >
                    {tokenPressable}
                  </TutorialSpotlight>
                );
              }
              return tokenPressable;
            })}
          </View>
        </View>
        ) : null}

        {!shouldHideSourcePanels && selectedWords.length > 0 ? (
          <View
            style={[
              styles.block,
              {
                backgroundColor: palette.containerBg,
                borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                shadowOpacity: isLight ? 0.06 : 0.16,
              },
            ]}
          >
            <Text style={[styles.blockTitle, { color: palette.secondaryText }]}>Keywords</Text>
            <View style={styles.wordsWrap}>
              {selectedWords.map((word) => {
                const isGenerated = generatedWords.has(word);
                return (
                  <Pressable
                    key={word}
                    style={({ pressed }) => [
                      styles.keywordBtn,
                      {
                        backgroundColor: isGenerated ? '#10B981' : MODAL_CTA_COLOR,
                        borderColor: isGenerated ? 'rgba(16,185,129,0.72)' : MODAL_CTA_COLOR_BORDER,
                      },
                      pressed ? styles.pressableChipPressed : null,
                    ]}
                    onPress={() => toggleWord(word)}
                  >
                    <Text style={styles.keywordText}>{word}{isGenerated ? ' ✓' : ''}</Text>
                  </Pressable>
                );
              })}
            </View>

            {hasNewWords && completedCards.length > 0 ? (
              <View style={styles.generateInlineWrap}>
                <Pressable
                  style={({ pressed }) => [
                    styles.generateInlineBtn,
                    { backgroundColor: UPLOAD_CACHE_CTA_COLOR, borderColor: UPLOAD_CACHE_CTA_COLOR_BORDER },
                    pressed && !isGenerateDisabled ? styles.pressablePrimaryPressed : null,
                  ]}
                  disabled={isGenerateDisabled}
                  onPress={() => void handleGenerate()}
                >
                  <Text style={[styles.generateInlineText, { color: TEXT_ON_CTA }]}>
                    + Create {newSelectedWords.length} New Card{newSelectedWords.length > 1 ? 's' : ''}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {!hasStarted && completedCards.length === 0 ? (
          <View>
            {effectiveGenerationMode !== 'manual' ? (
              <View
                style={[
                  styles.aiModeDropdownWrap,
                  {
                    backgroundColor: palette.containerBg,
                    borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                    shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                    shadowOpacity: isLight ? 0.05 : 0.14,
                  },
                ]}
              >
                <Pressable
                  style={styles.aiModeDropdownTrigger}
                  onPress={() => setIsAIModeDropdownOpen((prev) => !prev)}
                >
                  <View style={styles.aiModeDropdownCopy}>
                    <Text style={[styles.aiModeDropdownTitle, { color: palette.secondaryText }]}>
                      AI depth
                    </Text>
                    <Text style={[styles.aiModeDropdownValue, { color: palette.textOnContainer }]}>
                      {getAIBreakdownModeLabel(aiBreakdownMode)}
                    </Text>
                    <Text
                      style={[styles.aiModeDropdownDescription, { color: palette.secondaryText }]}
                      numberOfLines={1}
                    >
                      {selectedAIBreakdownOption.description}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.aiModeDropdownChevron,
                      {
                        color: MODAL_CTA_COLOR,
                        transform: [{ rotate: isAIModeDropdownOpen ? '180deg' : '0deg' }],
                      },
                    ]}
                  >
                    ⌄
                  </Text>
                </Pressable>
                {isAIModeDropdownOpen ? (
                  <View
                    style={[
                      styles.aiModeDropdownList,
                      {
                        backgroundColor: palette.modalOptionBg,
                        borderColor: palette.modalOptionBorder,
                      },
                    ]}
                  >
                    {AI_BREAKDOWN_MODE_OPTIONS.map((option) => {
                      const isActive = option.value === aiBreakdownMode;
                      return (
                        <Pressable
                          key={option.value}
                          style={[
                            styles.aiModeDropdownOption,
                            isActive
                              ? {
                                  backgroundColor: isLight ? 'rgba(78,175,244,0.14)' : 'rgba(78,175,244,0.18)',
                                  borderColor: MODAL_CTA_COLOR_BORDER,
                                }
                              : { borderColor: 'transparent' },
                          ]}
                          onPress={() => void handleSelectAIBreakdownMode(option.value)}
                        >
                          <View
                            style={[
                              styles.aiModeDropdownIconFrame,
                              {
                                backgroundColor: isActive
                                  ? isLight
                                    ? 'rgba(78,175,244,0.18)'
                                    : 'rgba(78,175,244,0.22)'
                                  : palette.containerBg,
                                borderColor: isActive ? MODAL_CTA_COLOR_BORDER : palette.modalOptionBorder,
                              },
                            ]}
                          >
                            <Image
                              source={AI_MODE_ICON_BY_VALUE[option.value]}
                              style={styles.aiModeDropdownIcon}
                              resizeMode="contain"
                            />
                          </View>
                          <View style={styles.aiModeDropdownOptionCopy}>
                            <Text
                              style={[
                                styles.aiModeDropdownOptionLabel,
                                { color: isActive ? MODAL_CTA_COLOR : palette.textOnContainer },
                              ]}
                            >
                              {option.label}
                            </Text>
                            <Text
                              style={[styles.aiModeDropdownOptionDescription, { color: palette.secondaryText }]}
                              numberOfLines={1}
                            >
                              {option.description}
                            </Text>
                          </View>
                          {isActive ? (
                            <View
                              style={[
                                styles.aiModeDropdownActiveDot,
                                { backgroundColor: MODAL_CTA_COLOR },
                              ]}
                            />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}
            {selectedWords.length > 0 ? (
              <View style={styles.selectedSummary}>
                <Text style={[styles.selectedSummaryText, { color: MODAL_CTA_COLOR }]}>
                  {effectiveGenerationMode === 'manual' ? '✍️' : '✨'} {selectedWords.length} word{selectedWords.length > 1 ? 's' : ''} selected
                </Text>
              </View>
            ) : null}
            <TutorialSpotlight
              active={appTour.step === 'STEP_6_GENERATE_SAMPLE'}
              tooltip="Generate card."
              onSpotlightPress={handleTourGeneratePress}
            >
              <Pressable
                onPress={handleTourGeneratePress}
                disabled={isGenerateDisabled}
                style={({ pressed }) => [
                  styles.generateButton,
                  { backgroundColor: MODAL_CTA_COLOR, borderColor: MODAL_CTA_COLOR_BORDER },
                  isGenerateDisabled && styles.generateButtonDisabled,
                  pressed && !isGenerateDisabled ? styles.pressablePrimaryPressed : null,
                ]}
              >
                <Text style={[styles.generateButtonText, { color: TEXT_ON_CTA }]}>
                  {effectiveGenerationMode === 'manual' ? 'Create' : 'Generate'} {selectedWords.length > 0 ? `${selectedWords.length} Card${selectedWords.length > 1 ? 's' : ''}` : 'Cards'}
                </Text>
              </Pressable>
            </TutorialSpotlight>
          </View>
        ) : null}

        {isPreviewSceneActive ? (
          <View
            style={styles.previewSceneWrap}
            onLayout={(event) => {
              previewSceneYRef.current = event.nativeEvent.layout.y;
            }}
          >
            <CreateCardPreviewScene
              processingWord={generatingCards[0]?.word || activePreviewCard?.displayWord || selectedWords[0] || 'Generating'}
              card={activePreviewCard}
              palette={palette}
              isLight={isLight}
              hasImage={Boolean(originalImageUri)}
              imageUri={originalImageUri || null}
              statusText={GHOST_CARD_STATUS_TEXT[ghostStatusIndex]}
              revealState={previewRevealState}
              phase={previewPhase}
              isFavorite={(activePreviewCard?.selectedAlbumIds || []).includes(FAVORITES_ALBUM_ID)}
              isBookmarked={(activePreviewCard?.selectedAlbumIds || []).some((id) => id !== ALL_CARDS_ALBUM_ID && id !== FAVORITES_ALBUM_ID)}
              isWordAudioLoading={activePreviewCard ? previewWordAudioLoading === activePreviewCard.displayWord : false}
              onPlayWord={activePreviewCard ? () => playDraftPreviewWord(activePreviewCard.displayWord) : undefined}
              onOpenPronunciationModal={activePreviewCard ? openDraftPronunciationModal : undefined}
              onToggleFavorite={activePreviewCard ? () => toggleDraftFavorite(activePreviewCard.word) : undefined}
              onOpenAlbumSheet={activePreviewCard ? () => openDraftAlbumSheet(activePreviewCard.word) : undefined}
            />
          </View>
        ) : null}

        {previewStackCards.length > 0 ? (
          <View style={styles.previewStackWrap}>
            {previewStackCards.map((card, index) => (
              <CreateCardPreviewScene
                key={`${card.word}-${card.sourceSentence}-${index}`}
                processingWord={card.displayWord}
                card={card}
                palette={palette}
                isLight={isLight}
                hasImage={Boolean(originalImageUri)}
                imageUri={originalImageUri || null}
                statusText=""
                revealState={COMPLETE_PREVIEW_REVEAL}
                phase="complete"
                isFavorite={(card.selectedAlbumIds || []).includes(FAVORITES_ALBUM_ID)}
                isBookmarked={(card.selectedAlbumIds || []).some((id) => id !== ALL_CARDS_ALBUM_ID && id !== FAVORITES_ALBUM_ID)}
                isWordAudioLoading={previewWordAudioLoading === card.displayWord}
                onPlayWord={() => playDraftPreviewWord(card.displayWord)}
                onOpenPronunciationModal={openDraftPronunciationModal}
                onToggleFavorite={() => toggleDraftFavorite(card.word)}
                onOpenAlbumSheet={() => openDraftAlbumSheet(card.word)}
              />
            ))}
          </View>
        ) : null}

        {generationFailure ? (
          <View
            style={[
              styles.generationFailPanel,
              {
                backgroundColor: palette.containerBg,
                borderColor: isLight ? palette.borderSubtle : 'rgba(255,107,107,0.34)',
                shadowColor: isLight ? '#000000' : '#FF6B6B',
                shadowOpacity: isLight ? 0.06 : 0.14,
              },
            ]}
          >
            <Text style={styles.generationFailIcon}>!</Text>
            <Text style={[styles.generationFailTitle, { color: palette.textOnContainer }]}>
              Could not create “{generationFailure.word}”
            </Text>
            <Text style={[styles.generationFailBody, { color: palette.secondaryText }]}>
              {generationFailure.message}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.generationFailRetry,
                { backgroundColor: UPLOAD_CACHE_CTA_COLOR, borderColor: UPLOAD_CACHE_CTA_COLOR_BORDER },
                pressed ? styles.pressablePrimaryPressed : null,
              ]}
              onPress={() => void handleGenerate()}
            >
              <Text style={[styles.generationFailRetryText, { color: TEXT_ON_CTA }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {!hasStarted && completedCards.length > 0 ? (
          <View style={styles.completedWrap}>
            <View style={styles.saveWrap}>
              <TutorialSpotlight
                active={appTour.step === 'STEP_7_SAVE_SAMPLE'}
                tooltip="Save card."
                onSpotlightPress={() => void handleSave()}
              >
                <Pressable
                  onPress={() => void handleSave()}
                  disabled={cardsToSave.length === 0 || saving}
                  style={({ pressed }) => [
                    styles.saveButton,
                    { backgroundColor: MODAL_CTA_COLOR, borderColor: MODAL_CTA_COLOR_BORDER },
                    (cardsToSave.length === 0 || saving) && styles.saveButtonDisabled,
                    pressed && cardsToSave.length > 0 && !saving ? styles.pressablePrimaryPressed : null,
                  ]}
                >
                  <Text style={[styles.saveButtonText, { color: TEXT_ON_CTA }]}>
                    {saving ? 'Saving...' : 'Save'}
                  </Text>
                </Pressable>
              </TutorialSpotlight>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <CardAlbumSheetModalUI
        visible={showAlbumSheet}
        displayWord={albumTargetCard?.displayWord || ''}
        partOfSpeech={albumTargetCard?.partOfSpeech || 'unknown'}
        selectedAlbums={albumTargetCard?.selectedAlbumIds || []}
        allAlbums={allAlbums}
        onClose={() => setShowAlbumSheet(false)}
        onDone={() => setShowAlbumSheet(false)}
        onOpenCreateAlbum={openCreateAlbumModal}
        onToggleAlbum={toggleDraftAlbum}
      />

      <CreateAlbumModalUI
        visible={isCreateAlbumModalVisible}
        albumName={newAlbumName}
        onChangeAlbumName={setNewAlbumName}
        onCancel={() => {
          setIsCreateAlbumModalVisible(false);
          setNewAlbumName('');
          if (albumTargetWord) setShowAlbumSheet(true);
        }}
        onConfirm={() => void createAlbum()}
      />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F9',
  },
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitleWrap: {
    flex: 1,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: '#0D0D0D',
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0D0D0D',
  },
  headerSubTitle: {
    fontSize: 12,
    color: '#9A9AAA',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 12,
  },
  block: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  originalImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#F2F2F5',
  },
  ocrStatus: {
    marginTop: 8,
    color: '#5B4BD6',
    fontSize: 13,
    fontWeight: '600',
  },
  ocrErrorText: {
    marginTop: 8,
    color: '#C0392B',
    fontSize: 12,
    fontWeight: '500',
  },
  blockTitle: {
    fontSize: 11,
    color: '#9A9AAA',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  wordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tokenBtn: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  tokenBtnTourActive: {
    borderColor: MODAL_CTA_COLOR_BORDER,
    shadowColor: MODAL_CTA_COLOR,
    shadowOpacity: 0.38,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  tokenBtnSelected: {
    backgroundColor: '#007AFF',
  },
  tokenText: {
    fontSize: 14,
    color: '#0D0D0D',
  },
  tokenTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  keywordBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
  },
  keywordBtnDefault: {
    backgroundColor: '#007AFF',
  },
  keywordBtnGenerated: {
    backgroundColor: '#10B981',
  },
  keywordText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  generateInlineWrap: {
    marginTop: 10,
    alignItems: 'flex-end',
  },
  generateInlineBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#00E5FF',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  generateInlineText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  aiModeDropdownWrap: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 8,
    marginBottom: 12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  aiModeDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  aiModeDropdownCopy: {
    flex: 1,
    gap: 2,
  },
  aiModeDropdownTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.75,
    textTransform: 'uppercase',
  },
  aiModeDropdownValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  aiModeDropdownDescription: {
    fontSize: 11,
    fontWeight: '600',
  },
  aiModeDropdownChevron: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 31,
    fontSize: 23,
    fontWeight: '800',
  },
  aiModeDropdownList: {
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
    padding: 5,
  },
  aiModeDropdownOption: {
    minHeight: 56,
    borderRadius: 13,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  aiModeDropdownIconFrame: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  aiModeDropdownIcon: {
    width: 31,
    height: 31,
  },
  aiModeDropdownOptionCopy: {
    flex: 1,
    gap: 2,
  },
  aiModeDropdownOptionLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  aiModeDropdownOptionDescription: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  aiModeDropdownActiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  selectedSummary: {
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  selectedSummaryText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
  },
  generateButton: {
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  generateButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  previewSceneWrap: {
    gap: 14,
  },
  previewStackWrap: {
    gap: 16,
  },
  generationFailPanel: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: 'center',
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  generationFailIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 34,
    backgroundColor: 'rgba(255,107,107,0.14)',
    color: '#FF6B6B',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 10,
  },
  generationFailTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  generationFailBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
  },
  generationFailRetry: {
    marginTop: 14,
    minWidth: 128,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00E5FF',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  generationFailRetryText: {
    fontSize: 14,
    fontWeight: '800',
  },
  previewScene: {
    gap: 16,
  },
  previewCardShell: {
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 22,
    elevation: 10,
  },
  previewHeroImage: {
    width: '100%',
    height: 214,
    borderRadius: 18,
    marginBottom: 18,
  },
  previewBody: {
    flex: 1,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  previewHeaderMain: {
    flex: 1,
    paddingRight: 12,
  },
  previewWord: {
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 38,
  },
  previewPosChip: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  previewPosChipText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.35,
  },
  previewAudioWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewDefinitionRow: {
    marginTop: 18,
  },
  previewDefinitionText: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
  },
  previewStatusSlot: {
    minHeight: 78,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  previewStatusText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: 0.3,
    opacity: 0.56,
  },
  previewDivider: {
    marginTop: 18,
    height: 1,
    borderRadius: 999,
  },
  previewFrontSection: {
    marginTop: 18,
    gap: 12,
  },
  previewSentenceText: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  previewTranslationText: {
    marginTop: 2,
  },
  previewSectionBlock: {
    marginTop: 18,
  },
  previewSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  previewSectionBody: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '500',
  },
  previewSectionBodyStrong: {
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '600',
  },
  previewBackMainText: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  previewFooterRow: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewFooterBtn: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generatingDone: {
    fontWeight: '800',
  },
  completedWrap: {
    gap: 12,
  },
  cardBlock: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardHead: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardWord: {
    fontSize: 26,
    color: '#0D0D0D',
    fontWeight: '700',
  },
  cardPos: {
    marginTop: 2,
    fontSize: 12,
    color: '#8A8A9A',
  },
  pickBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickBtnOff: {
    backgroundColor: '#F2F2F5',
  },
  pickBtnOn: {
    backgroundColor: '#10B981',
  },
  pickBtnText: {
    color: '#0D0D0D',
    fontWeight: '800',
    fontSize: 16,
  },
  pickBtnTextOn: {
    color: '#fff',
  },
  cardSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F8',
  },
  cardDefinition: {
    fontSize: 15,
    color: '#0D0D0D',
    lineHeight: 22,
  },
  definitionInput: {
    minHeight: 82,
  },
  noteLabel: {
    fontSize: 11,
    color: '#9A9AAA',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  noteInput: {
    minHeight: 68,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    textAlignVertical: 'top',
    fontSize: 13,
    color: '#0D0D0D',
  },
  singleLineInput: {
    minHeight: 44,
    paddingVertical: 10,
  },
  helperMetaText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
  },
  lockedAiPanel: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 6,
    opacity: 0.84,
  },
  lockedAiPanelTight: {
    marginTop: 2,
  },
  lockedAiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  lockedAiTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  lockedAiBadge: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    color: TEXT_ON_CTA,
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  lockedAiBody: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  collocationToggle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  collocationTitle: {
    fontSize: 14,
    color: '#0D0D0D',
    fontWeight: '600',
  },
  collocationArrow: {
    fontSize: 15,
    color: '#63637A',
  },
  collocationBody: {
    borderTopWidth: 1,
    borderTopColor: '#F5F5F8',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  collocationsEditor: {
    minHeight: 78,
  },
  collocationRow: {
    gap: 4,
  },
  collocationPhrase: {
    fontSize: 13,
    color: '#0D0D0D',
    fontWeight: '600',
  },
  collocationExample: {
    fontSize: 12,
    color: '#7A7A8A',
    fontStyle: 'italic',
  },
  saveWrap: {
    paddingTop: 2,
    paddingBottom: 20,
  },
  saveButton: {
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
  },
  pressablePrimaryPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  pressableChipPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
});
