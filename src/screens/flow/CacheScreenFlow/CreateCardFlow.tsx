import React from 'react';
import { traceFirstRun } from '../../../services/logging/firstRunTraceRuntime';
import {
  Alert,
  DeviceEventEmitter,
  Image,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
  type ImageStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  Easing,
  FadeIn,
  Layout,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect } from '@react-navigation/native';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import type Card from '@database/models/Card';
import {
  generateContentForWord,
  generateContentForWordStream,
  generateDefaultExperienceCardContent,
} from '@services/ai';
import {
  isLiteQuotaExceededError,
  isPremiumFeatureError,
} from '@services/ai/edgeAiClient';
import { speakEnglishNaturally } from '@services/tts/localSpeech';
import type { EntitlementSnapshot } from '@services/subscription/SubscriptionService';
import SubscriptionService, {
  SUBSCRIPTION_ENTITLEMENT_UPDATED_EVENT,
} from '@services/subscription/SubscriptionService';
import ReminderNotificationService from '@services/notifications/ReminderNotificationService';
import { shouldOpenStarterPaywall } from '../../../features/tour/firstRunJourney';
import { logDiagnosticEvent } from '@services/logging/diagnosticsLog';
import { analytics } from '@services/analytics';
import {
  AI_BREAKDOWN_MODE_OPTIONS,
  DEFAULT_USER_SETTINGS,
  getInitialUserSettings,
  loadUserSettings,
  normalizeAIBreakdownMode,
  saveUserSettings,
  subscribeUserSettings,
  type AIBreakdownMode,
  type UILanguage,
} from '@services/settings/userSettings';
import {
  buildTargetAnchoredOCRText,
  extractTextFromImage,
  type OCRBlock,
} from '@services/ocr/ocrService';
import { joinOCRBlocksByVisualLines } from '@services/ocr/ocrLayout';
import { supabase } from '@services/supabase/client';
import { persistLocalCardImage } from '@services/media/localCardImageStore';
import {
  assignCloudCardId,
  queueSavedCardsForCloudPersistence,
} from '@services/cards/cardCloudPersistence';
import { queueCardImageUploads } from '@services/cards/cardImageCloudQueue';
import {
  assertRecordOwnedByCurrentUser,
  getCurrentSessionUserId,
} from '@services/auth/userIdentity';
import CardAlbumSheetModalUI from '../../../components/UI/DeckScreenUI/CardAlbumSheetModalUI';
import {
  loadCardStickyNotes,
  saveCardStickyNotes,
} from '../../../features/deck/cardStickyNotes';
import {
  ALBUM_TAG_PREFIX,
  ALL_CARDS_ALBUM_ID,
  FAVORITES_ALBUM_ID,
  buildDeckAlbums,
  createCustomAlbum,
  getDeckAlbumDisplayName,
  loadDeckAlbumPreferences,
  saveDeckAlbumPreferences,
  subscribeDeckAlbumPreferences,
  type DeckAlbumPreferences,
} from '../../../features/deck/albums';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import { CreateCardGhostPreviewScene as CreateCardPreviewScene } from '../../../components/UI/CacheScreenUI/CreateCardGhostPreviewSceneUI';
import {
  DEMO_GHOST_SAVE_ARROW_DELAY_MS,
  DEMO_GHOST_SCROLL_DURATION_MS,
  scheduleDemoGhostSaveArrow,
} from '../../../features/createCard/ghostAnimationTiming';
import {
  resolveBottomAlignedScrollTarget,
  resolveCardTopAlignedScrollTarget,
} from '../../../features/createCard/ghostScrollTargets';
import {
  claimUnsavedCards,
} from '../../../features/createCard/optimisticCardSave';
import {
  isRecognizedTextEditingAvailable,
  resolveRecognizedWordPressAction,
} from '../../../features/createCard/recognizedTextEditMode';
import type { CompletedCard, PreviewPhase, PreviewRevealState } from './types';
import {
  groupSelectedSourceTokens,
  normalizeDisplayWord,
  normalizeSelectableTerm,
  pickSentenceContainingWord,
  tokenizeSourceText,
  type SelectedSourceTarget,
} from '../../../features/createCard/textTransforms';
import { parseCardContextSections } from '../../../features/cards/cardContextSections';
import {
  filterUsageTextPairs,
  resolveNormalizedPartOfSpeech,
} from '../../../features/cards/usageValidation';
import {
  COMPLETE_PREVIEW_REVEAL,
  EMPTY_PREVIEW_REVEAL,
  runCardRevealSequence as runPreviewRevealSequence,
} from '../../../features/createCard/revealSequence';
import TutorialSpotlight from '../../../components/UI/shared/TutorialSpotlight';
import MovingTutorialArrow from '../../../components/UI/shared/MovingTutorialArrow';
import {
  DEFAULT_EXPERIENCE_TARGET_WORD,
  isEligibleDefaultExperienceGeneration,
  markDefaultExperienceQuizHintPending,
} from '../../../features/cache/defaultExperienceCard';
import {
  resolveTutorialGenerationSource,
  shouldFallbackToCloudGeneration,
} from '../../../features/tour/tutorialGenerationPolicy';
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
import { tUI, type UIStringKey } from '../../../i18n/uiLanguage';

const GHOST_CARD_STATUS_KEYS: UIStringKey[] = [
  'create.ghostStatusExtracting',
  'create.ghostStatusAnalyzing',
  'create.ghostStatusStructuring',
  'create.ghostStatusFinalizing',
];

const STACK_CARD_ENTERING = FadeIn.duration(260);
const STACK_CARD_LAYOUT = Layout.duration(260);
const GHOST_INITIAL_LOADING_BEAT_MS = 320;

type Props = {
  navigation: any;
  route: any;
};

type GeneratingCard = {
  targetId: string;
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

type ProcessWordResult =
  | { status: 'success'; card: CompletedCard }
  | { status: 'failed' }
  | { status: 'blocked' };

function getAIModeLabel(mode: AIBreakdownMode, uiLanguage: UILanguage): string {
  if (mode === 'short_punchy') return tUI(uiLanguage, 'create.aiMode.clarity');
  if (mode === 'deep_dive') return tUI(uiLanguage, 'create.aiMode.mastery');
  return tUI(uiLanguage, 'create.aiMode.application');
}

function buildRecordingBypassCard(params: {
  word: string;
  sentenceForCard: string;
  uiLanguage: UILanguage;
  aiBreakdownMode: AIBreakdownMode;
  selectedAlbumIds: string[];
}): CompletedCard {
  const displayWord = normalizeDisplayWord(params.word) || params.word;
  const isChinese = params.uiLanguage !== 'en';
  const normalizedDisplayWord = displayWord.trim().toLowerCase();

  if (normalizedDisplayWord === 'ceasefire') {
    return {
      word: params.word,
      displayWord,
      partOfSpeech: 'noun',
      definition: isChinese
        ? '停火；交戰雙方同意暫時停止攻擊。它通常很脆弱，不等於和平已經達成。'
        : 'A temporary stop in fighting, usually agreed by opposing sides. It is fragile and does not mean peace has been reached.',
      cultural: isChinese
        ? '新聞裡說 a ceasefire is over，意思是「停火結束了」：原本暫停的攻擊可能重新開始，局勢也可能再次升級。'
        : 'In news, “a ceasefire is over” means the pause in fighting has ended, so attacks may resume and the conflict may escalate again.',
      collocationsText: isChinese
        ? 'call for a ceasefire — 呼籲停火\nbroker a ceasefire — 促成停火\nviolate a ceasefire — 違反停火\nceasefire agreement — 停火協議'
        : 'call for a ceasefire — ask both sides to stop fighting\nbroker a ceasefire — help negotiate a halt\nviolate a ceasefire — break the agreement\nceasefire agreement — a deal to pause fighting',
      semanticRelationsText: isChinese
        ? 'truce — 停戰；休戰\narmistice — 休戰協定\nde-escalation — 降低衝突\nescalation — 衝突升級'
        : 'truce — a temporary stop in fighting\narmistice — a formal agreement to stop fighting\nde-escalation — reducing tension\nescalation — conflict getting worse',
      note: '',
      phoneticTranscription: '/ˈsiːsˌfaɪr/',
      sourceSentence: params.sentenceForCard,
      manualMode: false,
      addedToDeck: true,
      selectedAlbumIds: [...params.selectedAlbumIds],
      aiBreakdownMode: params.aiBreakdownMode,
      tags: ['demo'],
    };
  }

  return {
    word: params.word,
    displayWord,
    partOfSpeech: 'phrase',
    definition: isChinese
      ? `在這句話裡，${displayWord} 表示臨場應變、沒有完整準備也先把事情完成。`
      : `In this sentence, ${displayWord} means to improvise and get through something without a full plan.`,
    cultural: isChinese
      ? '這種說法很口語，常用在工作、簡報、考試或社交場合。重點不是完美，而是靠反應把情況撐住。'
      : 'This is casual and useful for work, presentations, exams, or social moments. The nuance is not perfection — it is handling the moment.',
    collocationsText: isChinese
      ? `${displayWord} during a presentation — 簡報時臨場發揮\n${displayWord} in a meeting — 會議中即興應對\n${displayWord} under pressure — 壓力下靠反應撐住`
      : `${displayWord} during a presentation — improvise while presenting\n${displayWord} in a meeting — respond without a full script\n${displayWord} under pressure — handle it on the fly`,
    semanticRelationsText: isChinese
      ? 'improvise — 即興發揮\nmake do — 將就應付\nthink on your feet — 反應很快'
      : 'improvise — create a response in the moment\nmake do — manage with what you have\nthink on your feet — react quickly',
    note: '',
    phoneticTranscription: null,
    sourceSentence: params.sentenceForCard,
    manualMode: false,
    addedToDeck: true,
    selectedAlbumIds: [...params.selectedAlbumIds],
    aiBreakdownMode: params.aiBreakdownMode,
    tags: ['demo'],
  };
}

type PartialGeneratedCardFields = {
  normalizedTargetWord?: string;
  correctedTargetWord?: string;
  isLikelyTypo?: boolean;
  typoReason?: string;
  partOfSpeech?: string;
  definition?: string;
  sentenceTranslation?: string;
  culturalBackground?: string;
  frequentCollocations?: string;
  semanticRelations?: string;
  example?: string;
};

function decodePartialJSONString(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractPartialJSONString(
  raw: string,
  key: string
): string | undefined {
  const pattern = new RegExp(
    `"${escapeRegExpLiteral(key)}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)`
  );
  const match = raw.match(pattern);
  const value = match?.[1];
  return value ? decodePartialJSONString(value).trim() : undefined;
}

function extractPartialJSONBoolean(
  raw: string,
  key: string
): boolean | undefined {
  const keyIndex = raw.indexOf(`"${key}"`);
  if (keyIndex < 0) return undefined;
  const colonIndex = raw.indexOf(':', keyIndex);
  if (colonIndex < 0) return undefined;
  const afterColon = raw.slice(colonIndex + 1).trimStart();
  if (afterColon.startsWith('true')) return true;
  if (afterColon.startsWith('false')) return false;
  return undefined;
}

function extractPartialJSONObjectItems(
  raw: string,
  key: string,
  firstKey: string,
  secondKey = 'translation'
): string {
  const arrayStartPattern = new RegExp(
    `"${escapeRegExpLiteral(key)}"\\s*:\\s*\\[`
  );
  const keyStart = raw.search(arrayStartPattern);
  if (keyStart < 0) return '';
  const arrayStart = raw.indexOf('[', keyStart);
  if (arrayStart < 0) return '';
  let arrayEnd = raw.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = arrayStart; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        arrayEnd = index + 1;
        break;
      }
    }
  }
  const segment = raw.slice(arrayStart, arrayEnd);
  const firstPattern = new RegExp(
    `"${escapeRegExpLiteral(firstKey)}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)`,
    'g'
  );
  const items: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = firstPattern.exec(segment))) {
    const first = decodePartialJSONString(match[1] || '').trim();
    if (!first) break;
    const objectTail = segment.slice(match.index);
    const nextObjectIndex = objectTail.slice(1).search(/\{\s*"/);
    const currentObjectSegment =
      nextObjectIndex >= 0
        ? objectTail.slice(0, nextObjectIndex + 1)
        : objectTail;
    const second = extractPartialJSONString(currentObjectSegment, secondKey);
    items.push(second ? `${first} — ${second}` : first);
  }
  return items.join('\n');
}

function extractPartialSemanticRelations(raw: string): string | undefined {
  // 1. 因為後端已經把 JSON 攤平，我們直接抓取 synonyms 和 antonyms
  const rawSynonyms = extractPartialJSONObjectItems(raw, 'synonyms', 'term');
  const rawAntonyms = extractPartialJSONObjectItems(raw, 'antonyms', 'term');

  // 2. 如果兩個都沒有，代表資料還沒流過來，先不要顯示
  if (!rawSynonyms && !rawAntonyms) return undefined;

  // 3. 把 Regex 抓出來的字串轉換為前端預期的物件格式
  const parseItems = (text: string) =>
    text
      .split('\n')
      .filter(Boolean)
      .map((item) => {
        const [term, ...translationParts] = item.split(/\s+[—–-]\s+/);
        const translation = translationParts.join(' — ');
        return translation ? { term, translation } : { term };
      });

  // 4. 重新包裝成舊版 UI 期待的 JSON 字串結構
  return JSON.stringify({
    synonyms: parseItems(rawSynonyms),
    antonyms: parseItems(rawAntonyms),
  });
}

function sectionHeaderPattern(header: string): RegExp {
  const normalized = header.replace(/=/g, '').trim();
  return new RegExp(`==\\s*${escapeRegExpLiteral(normalized)}\\s*==`, 'i');
}

function stripStreamingSectionHeaders(
  value: string | undefined
): string | undefined {
  const cleaned = (value || '')
    .replace(/==\s*(?:TRANS|DEF|WORD|POS|RESOLUTION)\s*==/gi, '')
    .replace(/^\s*["']?undefined["']?\s*$/i, '')
    .trim();
  return cleaned || undefined;
}

function extractTextSection(
  raw: string,
  header: string,
  nextHeader?: string
): string | undefined {
  const cleanRaw = raw
    .replace(/```(json|text|markdown)?/gi, '')
    .replace(/```/g, '');
  const startMatch = cleanRaw.match(sectionHeaderPattern(header));
  if (!startMatch || startMatch.index === undefined) return undefined;
  const contentStart = startMatch.index + startMatch[0].length;
  const nextMarkerIndex = nextHeader
    ? cleanRaw.slice(contentStart).search(sectionHeaderPattern(nextHeader))
    : -1;
  const enrichmentStart = cleanRaw.indexOf('\n{', contentStart);
  const absoluteNextMarkerIndex =
    nextMarkerIndex >= 0 ? contentStart + nextMarkerIndex : -1;
  const contentEnd =
    absoluteNextMarkerIndex >= 0
      ? absoluteNextMarkerIndex
      : enrichmentStart >= 0
        ? enrichmentStart
        : cleanRaw.length;
  const value = cleanRaw
    .slice(contentStart, contentEnd)
    .replace(/\n?==[A-Z]*=?=?\s*$/i, '')
    .trim();
  return stripStreamingSectionHeaders(value);
}

function parseIncompleteGenerateCardJSON(
  raw: string
): PartialGeneratedCardFields {
  const jsonFields: PartialGeneratedCardFields = {
    normalizedTargetWord: extractPartialJSONString(raw, 'normalizedTargetWord'),
    correctedTargetWord: extractPartialJSONString(raw, 'correctedTargetWord'),
    isLikelyTypo: extractPartialJSONBoolean(raw, 'isLikelyTypo'),
    typoReason: extractPartialJSONString(raw, 'typoReason'),
    partOfSpeech: extractPartialJSONString(raw, 'partOfSpeech'),
    definition: extractPartialJSONString(raw, 'definition'),
    sentenceTranslation: extractPartialJSONString(raw, 'sentenceTranslation'),
    culturalBackground: extractPartialJSONString(raw, 'culturalBackground'),
    frequentCollocations: extractPartialJSONObjectItems(
      raw,
      'frequentCollocations',
      'phrase'
    ),
    semanticRelations: extractPartialSemanticRelations(raw),
    example: extractPartialJSONObjectItems(raw, 'example', 'sentence'),
  };
  if (!/==\s*(?:DEF|TRANS)\s*==/i.test(raw)) return jsonFields;

  const defIndex = raw.search(/==\s*DEF\s*==/i);
  const transIndex = raw.search(/==\s*TRANS\s*==/i);
  const transComesFirst =
    transIndex >= 0 && defIndex >= 0 && transIndex < defIndex;

  return {
    ...jsonFields,
    definition: transComesFirst
      ? extractTextSection(raw, '==DEF==', '==WORD==') || jsonFields.definition
      : extractTextSection(raw, '==DEF==', '==TRANS==') ||
        jsonFields.definition,
    sentenceTranslation: transComesFirst
      ? extractTextSection(raw, '==TRANS==', '==DEF==') ||
        jsonFields.sentenceTranslation
      : extractTextSection(raw, '==TRANS==', '==WORD==') ||
        jsonFields.sentenceTranslation,
    normalizedTargetWord:
      extractTextSection(raw, '==WORD==', '==POS==') ||
      stripStreamingSectionHeaders(jsonFields.normalizedTargetWord),
    partOfSpeech:
      extractTextSection(raw, '==POS==', '==RESOLUTION==') ||
      stripStreamingSectionHeaders(jsonFields.partOfSpeech),
  };
}

function buildPartialGhostCard(params: {
  word: string;
  sourceSentence: string;
  fields: PartialGeneratedCardFields;
  uiLanguage: UILanguage;
  aiBreakdownMode: AIBreakdownMode;
  selectedAlbumIds: string[];
}): CompletedCard | null {
  const {
    word,
    sourceSentence,
    fields,
    uiLanguage,
    aiBreakdownMode,
    selectedAlbumIds,
  } = params;
  const hasVisibleContent = Boolean(
    (fields.definition && fields.definition.length >= 2) ||
    fields.sentenceTranslation ||
    fields.culturalBackground ||
    fields.frequentCollocations ||
    fields.semanticRelations ||
    fields.example
  );
  if (!hasVisibleContent) return null;

  const typoSuggestionRaw = fields.isLikelyTypo
    ? normalizeDisplayWord(fields.correctedTargetWord || '')
    : '';
  const typoSuggestion =
    typoSuggestionRaw &&
    normalizeSelectableTerm(typoSuggestionRaw).toLowerCase() !==
      normalizeSelectableTerm(word).toLowerCase()
      ? typoSuggestionRaw
      : undefined;
  const displayWord = typoSuggestion
    ? word
    : normalizeDisplayWord(
        fields.normalizedTargetWord || fields.correctedTargetWord || word
      ) || word;
  const cleanDefinition = stripStreamingSectionHeaders(fields.definition) || '';
  const cleanSentenceTranslation =
    stripStreamingSectionHeaders(fields.sentenceTranslation) || sourceSentence;
  const cleanCulturalBackground =
    stripStreamingSectionHeaders(fields.culturalBackground) || '';
  const sentenceTranslation = cleanSentenceTranslation;
  const usagePairs = filterUsageTextPairs(
    fields.frequentCollocations || '',
    fields.example || '',
    displayWord
  );
  const cultural = JSON.stringify({
    sentenceTranslation,
    sentenceNotes: '',
    culturalBackground: cleanCulturalBackground,
    exampleSentence: usagePairs.examples,
  });

  return {
    word,
    displayWord,
    typoSuggestion,
    typoReason: fields.typoReason || undefined,
    partOfSpeech:
      resolveNormalizedPartOfSpeech(fields.partOfSpeech, cleanDefinition) || '',
    definition: cleanDefinition,
    cultural,
    collocationsText: usagePairs.collocations,
    semanticRelationsText: fields.semanticRelations || '',
    note: '',
    phoneticTranscription: null,
    sourceSentence,
    manualMode: false,
    addedToDeck: true,
    selectedAlbumIds: [...selectedAlbumIds],
    aiBreakdownMode,
    tags: [],
  };
}

function getAIModeDescription(
  mode: AIBreakdownMode,
  uiLanguage: UILanguage
): string {
  if (mode === 'short_punchy')
    return tUI(uiLanguage, 'create.aiMode.clarityDescription');
  if (mode === 'deep_dive')
    return tUI(uiLanguage, 'create.aiMode.masteryDescription');
  return tUI(uiLanguage, 'create.aiMode.applicationDescription');
}

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

export default function CreateCardScreen({ navigation, route }: Props) {
  const initialSettings = getInitialUserSettings();
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const appTour = useAppTour();
  const colorScheme = useColorScheme();
  const reduceMotion = useReducedMotion();
  const palette = React.useMemo(
    () => resolveThemeColors(colorScheme),
    [colorScheme]
  );
  const isLight = colorScheme === 'light';
  const {
    cachedItem,
    croppedImageUri,
    originalImageUri: routeOriginalImageUri,
    runOcrOnLoad,
    isDefaultExperienceTutorial = false,
  } = route.params as {
    cachedItem: CachedItem;
    croppedImageUri?: string;
    originalImageUri?: string;
    runOcrOnLoad?: boolean;
    isDefaultExperienceTutorial?: boolean;
  };
  const goToCacheHome = React.useCallback(() => {
    if (typeof navigation?.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('CacheList');
  }, [navigation]);

  const baseSourceText = React.useMemo(
    () => getCachedItemSourceText(cachedItem),
    [cachedItem]
  );
  const ocrImageUri = React.useMemo(
    () =>
      croppedImageUri ||
      routeOriginalImageUri ||
      cachedItem.mediaUri ||
      cachedItem.imageStoragePath ||
      null,
    [
      cachedItem.imageStoragePath,
      cachedItem.mediaUri,
      croppedImageUri,
      routeOriginalImageUri,
    ]
  );
  const originalImageUri = React.useMemo(
    () =>
      routeOriginalImageUri ||
      cachedItem.mediaUri ||
      croppedImageUri ||
      cachedItem.imageStoragePath ||
      null,
    [
      cachedItem.imageStoragePath,
      cachedItem.mediaUri,
      croppedImageUri,
      routeOriginalImageUri,
    ]
  );
  const [ocrSourceText, setOcrSourceText] = React.useState('');
  const [ocrBlocks, setOcrBlocks] = React.useState<OCRBlock[]>([]);
  const [editedSourceText, setEditedSourceText] = React.useState('');
  const [isOcrRunning, setIsOcrRunning] = React.useState(false);
  const [ocrError, setOcrError] = React.useState<string | null>(null);
  const [uiLanguage, setUiLanguage] = React.useState<UILanguage>(
    initialSettings.uiLanguage
  );
  const [aiReplyLanguage, setAiReplyLanguage] = React.useState(
    initialSettings.aiReplyLanguage
  );
  const [aiBreakdownMode, setAiBreakdownMode] = React.useState<AIBreakdownMode>(
    initialSettings.personalization.aiBreakdownMode
  );
  const [isAIModeDropdownOpen, setIsAIModeDropdownOpen] = React.useState(false);
  const [selectedBatchAlbumIds, setSelectedBatchAlbumIds] = React.useState<
    string[]
  >([]);
  const [isAlbumDestinationDropdownOpen, setIsAlbumDestinationDropdownOpen] =
    React.useState(false);
  const aiModeDropdownProgress = useSharedValue(0);
  const aiModeDropdownContentHeight = useSharedValue(0);
  const albumDestinationDropdownProgress = useSharedValue(0);
  const albumDestinationDropdownContentHeight = useSharedValue(0);
  const aiModeDropdownAnimatedStyle = useAnimatedStyle(() => ({
    height: aiModeDropdownContentHeight.value * aiModeDropdownProgress.value,
    opacity: interpolate(aiModeDropdownProgress.value, [0, 0.35, 1], [0, 0, 1]),
  }));
  const aiModeDropdownContentAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY: isAIModeDropdownOpen
            ? -(1 - aiModeDropdownProgress.value) *
              aiModeDropdownContentHeight.value
            : 0,
        },
      ],
    }),
    [isAIModeDropdownOpen]
  );
  const aiModeDropdownChevronStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(aiModeDropdownProgress.value, [0, 1], [0, 180])}deg`,
      },
    ],
  }));
  const albumDestinationDropdownAnimatedStyle = useAnimatedStyle(() => ({
    height:
      albumDestinationDropdownContentHeight.value *
      albumDestinationDropdownProgress.value,
    opacity: interpolate(
      albumDestinationDropdownProgress.value,
      [0, 0.35, 1],
      [0, 0, 1]
    ),
  }));
  const albumDestinationDropdownContentAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY: isAlbumDestinationDropdownOpen
            ? -(1 - albumDestinationDropdownProgress.value) *
              albumDestinationDropdownContentHeight.value
            : 0,
        },
      ],
    }),
    [isAlbumDestinationDropdownOpen]
  );
  const albumDestinationDropdownChevronStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(albumDestinationDropdownProgress.value, [0, 1], [0, 180])}deg`,
      },
    ],
  }));
  React.useEffect(() => {
    const target = isAIModeDropdownOpen ? 1 : 0;
    aiModeDropdownProgress.value = reduceMotion
      ? target
      : withTiming(target, {
          duration: 240,
          easing: Easing.bezier(0.2, 0, 0, 1),
        });
  }, [aiModeDropdownProgress, isAIModeDropdownOpen, reduceMotion]);
  React.useEffect(() => {
    const target = isAlbumDestinationDropdownOpen ? 1 : 0;
    albumDestinationDropdownProgress.value = reduceMotion
      ? target
      : withTiming(target, {
          duration: 240,
          easing: Easing.bezier(0.2, 0, 0, 1),
        });
  }, [
    albumDestinationDropdownProgress,
    isAlbumDestinationDropdownOpen,
    reduceMotion,
  ]);
  const handleAIModeDropdownContentLayout = React.useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      aiModeDropdownContentHeight.value = event.nativeEvent.layout.height;
    },
    [aiModeDropdownContentHeight]
  );
  const handleAlbumDestinationDropdownContentLayout = React.useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      albumDestinationDropdownContentHeight.value =
        event.nativeEvent.layout.height;
    },
    [albumDestinationDropdownContentHeight]
  );
  const shouldUseFreshCroppedOcrOnly = Boolean(runOcrOnLoad && croppedImageUri);
  const sourceText = React.useMemo(() => {
    const trimmedEditedSourceText = editedSourceText.trim();
    if (trimmedEditedSourceText) return editedSourceText;

    const trimmedOcrSourceText = ocrSourceText.trim();
    if (trimmedOcrSourceText) return ocrSourceText;

    if (shouldUseFreshCroppedOcrOnly) return '';

    return baseSourceText;
  }, [
    baseSourceText,
    editedSourceText,
    ocrSourceText,
    shouldUseFreshCroppedOcrOnly,
  ]);
  const sourceTokens = React.useMemo(() => {
    const fromText = sourceText.trim() ? tokenizeSourceText(sourceText) : [];
    if (fromText.length > 0) return fromText;

    if (shouldUseFreshCroppedOcrOnly) return [];

    const highlights = Array.isArray(cachedItem.aiHighlightedTerms)
      ? cachedItem.aiHighlightedTerms.filter(Boolean)
      : [];
    if (highlights.length > 0) return highlights;

    if (isOcrRunning || ocrImageUri) return [];

    return ['example', 'word'];
  }, [
    cachedItem.aiHighlightedTerms,
    isOcrRunning,
    ocrImageUri,
    shouldUseFreshCroppedOcrOnly,
    sourceText,
  ]);
  const hardLineBreakTokenIndices = React.useMemo(() => {
    const breaks = new Set<number>();
    if (!sourceText.includes('\n')) return breaks;
    let tokenIndex = 0;
    for (const line of sourceText.split(/\r?\n/).slice(0, -1)) {
      tokenIndex += tokenizeSourceText(line).length;
      breaks.add(tokenIndex);
    }
    return breaks;
  }, [sourceText]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await loadUserSettings();
        if (!cancelled) {
          setAiReplyLanguage(settings.aiReplyLanguage);
          setUiLanguage(settings.uiLanguage);
          setAiBreakdownMode(
            normalizeAIBreakdownMode(settings.personalization.aiBreakdownMode)
          );
        }
      } catch (error) {
        console.error('[CreateCard] load ai reply language failed:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(
    () =>
      subscribeUserSettings((settings) => {
        setAiReplyLanguage(settings.aiReplyLanguage);
        setUiLanguage(settings.uiLanguage);
        setAiBreakdownMode(
          normalizeAIBreakdownMode(settings.personalization.aiBreakdownMode)
        );
      }),
    []
  );

  const handleSelectAIBreakdownMode = React.useCallback(
    async (mode: AIBreakdownMode) => {
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
          const userId = await getCurrentSessionUserId();
          if (!userId) return;
          await supabase
            .from('profiles')
            .update({
              ai_breakdown_mode: nextMode,
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId);
        } catch (error) {
          console.error('[CreateCard] sync AI mode profile failed:', error);
        }
      })();
    },
    []
  );

  const [selectedTokenIndices, setSelectedTokenIndices] = React.useState<
    number[]
  >([]);
  const [isRecognizedTextEditMode, setIsRecognizedTextEditMode] =
    React.useState(false);
  const selectedTargets = React.useMemo(
    () =>
      groupSelectedSourceTokens(sourceTokens, selectedTokenIndices, sourceText),
    [selectedTokenIndices, sourceText, sourceTokens]
  );
  const [hasStarted, setHasStarted] = React.useState(false);
  const [showDefaultExperienceSaveArrow, setShowDefaultExperienceSaveArrow] =
    React.useState(false);
  const cancelDefaultExperienceSaveArrowRef = React.useRef<
    (() => void) | null
  >(null);
  const [generatingCards, setGeneratingCards] = React.useState<
    GeneratingCard[]
  >([]);
  const [completedCards, setCompletedCards] = React.useState<CompletedCard[]>(
    []
  );
  const [entitlementSnapshot, setEntitlementSnapshot] =
    React.useState<EntitlementSnapshot | null>(null);
  const [showCollocations, setShowCollocations] = React.useState<
    Record<string, boolean>
  >({});
  const [generatedTargetIds, setGeneratedTargetIds] = React.useState<
    Set<string>
  >(new Set());
  const [saving, setSaving] = React.useState(false);
  const optimisticSaveClaimsRef = React.useRef(new Set<string>());
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const defaultExperienceTargetIndex = React.useMemo(
    () =>
      sourceTokens.findIndex(
        (token) =>
          normalizeSelectableTerm(token) === DEFAULT_EXPERIENCE_TARGET_WORD
      ),
    [sourceTokens]
  );
  const [albumPrefs, setAlbumPrefs] = React.useState<DeckAlbumPreferences>({
    customAlbums: [],
    albumNameOverrides: {},
    albumEmojiOverrides: {},
    albumColorOverrides: {},
    albumCoverOverrides: {},
    deletedAlbumIds: [],
  });
  const [showAlbumSheet, setShowAlbumSheet] = React.useState(false);
  const [albumTargetWord, setAlbumTargetWord] = React.useState<string | null>(
    null
  );
  const [isCreateAlbumModalVisible, setIsCreateAlbumModalVisible] =
    React.useState(false);
  const [newAlbumName, setNewAlbumName] = React.useState('');
  const [ghostStatusIndex, setGhostStatusIndex] = React.useState(0);
  const [streamStatusText, setStreamStatusText] = React.useState('');
  const [previewWordAudioLoading, setPreviewWordAudioLoading] = React.useState<
    string | null
  >(null);
  const [generationFailure, setGenerationFailure] = React.useState<{
    word: string;
    message: string;
  } | null>(null);
  const [typoOverrideInputs, setTypoOverrideInputs] = React.useState<
    Record<string, string>
  >({});
  const previewRunIdRef = React.useRef(0);
  const scrollRef = React.useRef<ScrollView | null>(null);
  const activePreviewLayoutRef = React.useRef({ y: 0, height: 0 });
  const [scrollViewportHeight, setScrollViewportHeight] = React.useState(0);
  const scrollContentHeightRef = React.useRef(0);
  const currentScrollYRef = React.useRef(0);
  const previewScrollTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const previewScrollRequestIdRef = React.useRef(0);
  const previewScrollAnimationFrameRef = React.useRef<number | null>(null);
  const autoScrolledPreviewKeyRef = React.useRef<string | null>(null);
  const didAutoScrollDefaultExperienceCompletionRef = React.useRef(false);
  const pendingPremiumRetryRef = React.useRef(false);
  const [activePreviewCard, setActivePreviewCard] =
    React.useState<CompletedCard | null>(null);
  const [partialGeneratedCard, setPartialGeneratedCard] =
    React.useState<CompletedCard | null>(null);
  const [isBufferedStreamPreview, setIsBufferedStreamPreview] =
    React.useState(false);
  const [previewPhase, setPreviewPhase] =
    React.useState<PreviewPhase>('frontThinking');
  const [previewRevealState, setPreviewRevealState] =
    React.useState<PreviewRevealState>(EMPTY_PREVIEW_REVEAL);
  const effectiveGenerationMode = 'ai-assisted' as const;
  const shouldPromptTourSaveOnScrollRef = React.useRef(false);
  const isGhostGenerating =
    hasStarted && generatingCards.some((card) => !card.completed);
  const isPreviewSceneActive =
    Boolean(activePreviewCard || partialGeneratedCard) || isGhostGenerating;
  const shouldHideSourcePanels = hasStarted || completedCards.length > 0;

  React.useEffect(() => {
    cancelDefaultExperienceSaveArrowRef.current?.();
    cancelDefaultExperienceSaveArrowRef.current = null;
    setShowDefaultExperienceSaveArrow(false);
    if (
      !isDefaultExperienceTutorial ||
      hasStarted ||
      completedCards.length === 0
    ) {
      return;
    }

    const cancel = scheduleDemoGhostSaveArrow(() => {
      cancelDefaultExperienceSaveArrowRef.current = null;
      setShowDefaultExperienceSaveArrow(true);
    }, DEMO_GHOST_SAVE_ARROW_DELAY_MS);
    cancelDefaultExperienceSaveArrowRef.current = cancel;
    return () => {
      cancel();
      if (cancelDefaultExperienceSaveArrowRef.current === cancel) {
        cancelDefaultExperienceSaveArrowRef.current = null;
      }
    };
  }, [completedCards.length, hasStarted, isDefaultExperienceTutorial]);
  const allAlbums = React.useMemo(
    () =>
      buildDeckAlbums(allCards, {}, albumPrefs).filter(
        (album) => album.id !== ALL_CARDS_ALBUM_ID
      ),
    [albumPrefs, allCards]
  );
  const batchAlbumSummary = React.useMemo(() => {
    const selectedAlbums = allAlbums.filter((album) =>
      selectedBatchAlbumIds.includes(album.id)
    );
    return [
      tUI(uiLanguage, 'deck.albumAllCards'),
      ...selectedAlbums.map((album) =>
        getDeckAlbumDisplayName(album, uiLanguage)
      ),
    ].join('、');
  }, [allAlbums, selectedBatchAlbumIds, uiLanguage]);

  const toggleBatchAlbum = React.useCallback((albumId: string) => {
    void Haptics.selectionAsync();
    setSelectedBatchAlbumIds((current) =>
      current.includes(albumId)
        ? current.filter((id) => id !== albumId)
        : [...current, albumId]
    );
  }, []);
  const albumTargetCard = React.useMemo(
    () =>
      (albumTargetWord &&
        completedCards.find((card) => card.word === albumTargetWord)) ||
      (albumTargetWord && activePreviewCard?.word === albumTargetWord
        ? activePreviewCard
        : null),
    [activePreviewCard, albumTargetWord, completedCards]
  );

  const cancelPendingPreviewScroll = React.useCallback(() => {
    previewScrollRequestIdRef.current += 1;
    if (previewScrollTimeoutRef.current) {
      clearTimeout(previewScrollTimeoutRef.current);
      previewScrollTimeoutRef.current = null;
    }
    if (previewScrollAnimationFrameRef.current !== null) {
      cancelAnimationFrame(previewScrollAnimationFrameRef.current);
      previewScrollAnimationFrameRef.current = null;
    }
  }, []);

  const animatePreviewScrollTo = React.useCallback(
    (targetY: number) => {
      if (previewScrollAnimationFrameRef.current !== null) {
        cancelAnimationFrame(previewScrollAnimationFrameRef.current);
        previewScrollAnimationFrameRef.current = null;
      }

      const startY = currentScrollYRef.current;
      if (reduceMotion) {
        currentScrollYRef.current = targetY;
        scrollRef.current?.scrollTo({
          y: Math.max(0, targetY),
          animated: false,
        });
        return;
      }
      if (!isDefaultExperienceTutorial) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, targetY),
          animated: true,
        });
        return;
      }
      const distance = targetY - startY;
      const startedAt = Date.now();
      const easeInOutCubic = (progress: number) =>
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const step = () => {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min(
          1,
          elapsed / DEMO_GHOST_SCROLL_DURATION_MS
        );
        const nextY = startY + distance * easeInOutCubic(progress);
        currentScrollYRef.current = nextY;
        scrollRef.current?.scrollTo({ y: Math.max(0, nextY), animated: false });

        if (progress < 1) {
          previewScrollAnimationFrameRef.current = requestAnimationFrame(step);
        } else {
          currentScrollYRef.current = targetY;
          previewScrollAnimationFrameRef.current = null;
        }
      };

      previewScrollAnimationFrameRef.current = requestAnimationFrame(step);
    },
    [isDefaultExperienceTutorial, reduceMotion]
  );

  const scrollToActivePreviewCard = React.useCallback(
    (delayMs = 120) => {
      const requestId = ++previewScrollRequestIdRef.current;
      if (previewScrollTimeoutRef.current) {
        clearTimeout(previewScrollTimeoutRef.current);
      }
      previewScrollTimeoutRef.current = setTimeout(() => {
        requestAnimationFrame(() => {
          if (previewScrollRequestIdRef.current !== requestId) return;
          const { y } = activePreviewLayoutRef.current;
          animatePreviewScrollTo(
            resolveCardTopAlignedScrollTarget({
              previewY: y,
              cardYWithinPreview: 0,
            })
          );
        });
      }, delayMs);
    },
    [animatePreviewScrollTo]
  );

  React.useEffect(() => {
    return () => {
      cancelPendingPreviewScroll();
    };
  }, [cancelPendingPreviewScroll]);

  const handleActivePreviewLayout = React.useCallback(
    (event: { nativeEvent: { layout: { y: number; height: number } } }) => {
      activePreviewLayoutRef.current = {
        y: event.nativeEvent.layout.y,
        height: event.nativeEvent.layout.height,
      };
      const previewKey =
        generatingCards[0]?.word ||
        activePreviewCard?.word ||
        partialGeneratedCard?.word ||
        null;
      if (
        isPreviewSceneActive &&
        previewKey &&
        autoScrolledPreviewKeyRef.current !== previewKey
      ) {
        autoScrolledPreviewKeyRef.current = previewKey;
        scrollToActivePreviewCard(80);
      }
    },
    [
      activePreviewCard?.word,
      generatingCards,
      isPreviewSceneActive,
      partialGeneratedCard?.word,
      scrollToActivePreviewCard,
    ]
  );

  React.useEffect(() => {
    if (isPreviewSceneActive) return;
    autoScrolledPreviewKeyRef.current = null;
    cancelPendingPreviewScroll();
  }, [cancelPendingPreviewScroll, isPreviewSceneActive]);

  const handleScrollLayout = React.useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      setScrollViewportHeight(event.nativeEvent.layout.height);
    },
    []
  );

  const handleCompletedActionsLayout = React.useCallback(() => {
    if (
      !isDefaultExperienceTutorial ||
      hasStarted ||
      completedCards.length === 0 ||
      didAutoScrollDefaultExperienceCompletionRef.current
    )
      return;

    didAutoScrollDefaultExperienceCompletionRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        animatePreviewScrollTo(
          resolveBottomAlignedScrollTarget({
            contentHeight: scrollContentHeightRef.current,
            viewportHeight: scrollViewportHeight,
          })
        );
      });
    });
  }, [
    animatePreviewScrollTo,
    completedCards.length,
    hasStarted,
    isDefaultExperienceTutorial,
    scrollViewportHeight,
  ]);

  React.useEffect(() => {
    if (!hasStarted || !generatingCards.some((card) => !card.completed)) {
      setGhostStatusIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setGhostStatusIndex((prev) => (prev + 1) % GHOST_CARD_STATUS_KEYS.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [generatingCards, hasStarted]);

  React.useEffect(() => {
    let active = true;
    const runOCR = async () => {
      if (!runOcrOnLoad || !ocrImageUri) return;
      setIsOcrRunning(true);
      setOcrError(null);
      setOcrBlocks([]);
      setOcrSourceText('');
      setEditedSourceText('');
      try {
        const result = await extractTextFromImage(ocrImageUri);
        if (!active) return;
        setOcrBlocks(result.blocks);
        const textFromBlocks = joinOCRBlocksByVisualLines(result.blocks);
        const nextText = (result.fullText || '').trim() || textFromBlocks;
        if (nextText) {
          setOcrSourceText(nextText);
          setEditedSourceText('');
        } else {
          setOcrError(tUI(uiLanguage, 'create.ocrNoText'));
        }
      } catch (error) {
        if (!active) return;
        console.error('[CreateCard] OCR failed:', error);
        setOcrBlocks([]);
        setOcrError(tUI(uiLanguage, 'create.ocrFailed'));
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
  }, [ocrImageUri, runOcrOnLoad, uiLanguage]);

  const refreshEntitlementSnapshot = React.useCallback(
    async (options?: { cancelled?: () => boolean }) => {
      try {
        const snapshot = await SubscriptionService.syncEntitlements(
          cachedItem.userId,
          {
            preferServer: true,
          }
        );
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
      .query(
        Q.where('user_id', cachedItem.userId),
        Q.where('deleted_at', null),
        Q.sortBy('created_at', Q.desc)
      );

    void queryCards
      .fetch()
      .then(setAllCards)
      .catch((error) => {
        console.error('[CreateCard] load deck cards failed:', error);
        setAllCards([]);
      });

    const sub = queryCards.observe().subscribe((data) => {
      setAllCards(data);
    });
    return () => sub.unsubscribe();
  }, [cachedItem.userId]);

  React.useEffect(
    () =>
      subscribeDeckAlbumPreferences((prefs, userId) => {
        if (userId && userId !== cachedItem.userId) return;
        setAlbumPrefs(prefs);
      }),
    [cachedItem.userId]
  );

  React.useEffect(() => {
    let cancelled = false;
    void loadDeckAlbumPreferences(cachedItem.userId)
      .then((prefs) => {
        if (!cancelled) setAlbumPrefs(prefs);
      })
      .catch((error) => {
        console.error('[CreateCard] load album preferences failed:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [cachedItem.userId]);

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
      });
    },
    []
  );

  const appendCompletedCard = React.useCallback((card: CompletedCard) => {
    setCompletedCards((prev) => {
      const alreadyAdded = prev.some(
        (item) =>
          item.displayWord === card.displayWord &&
          item.sourceSentence === card.sourceSentence
      );
      return alreadyAdded ? prev : [...prev, card];
    });
  }, []);

  const toggleSourceToken = (sourceTokenIndex: number) => {
    if (sourceTokenIndex < 0 || sourceTokenIndex >= sourceTokens.length) return;
    const containingTarget = selectedTargets.find(
      (target) =>
        sourceTokenIndex >= target.startIndex &&
        sourceTokenIndex <= target.endIndex
    );
    const wasSelected = Boolean(containingTarget);
    setSelectedTokenIndices((previous) => {
      if (containingTarget) {
        return previous.filter(
          (index) =>
            index < containingTarget.startIndex ||
            index > containingTarget.endIndex
        );
      }
      return [...previous, sourceTokenIndex].sort((a, b) => a - b);
    });
    if (!wasSelected && appTour.step === 'STEP_5_SELECT_TARGET') {
      appTour.nextStep();
    }
  };

  const removeSelectedTarget = React.useCallback(
    (targetId: string) => {
      const target = selectedTargets.find((item) => item.id === targetId);
      if (!target) return;
      setSelectedTokenIndices((previous) =>
        previous.filter(
          (index) => index < target.startIndex || index > target.endIndex
        )
      );
    },
    [selectedTargets]
  );

  const editSourceToken = React.useCallback(
    (token: string, index: number) => {
      const currentToken = sourceTokens[index] || token;
      const title = tUI(uiLanguage, 'create.editOcrTokenTitle');
      const message = tUI(uiLanguage, 'create.editOcrTokenBody');
      const applyEdit = (nextRaw?: string) => {
        const nextToken = normalizeDisplayWord(nextRaw || '');
        if (!nextToken) return;

        const nextTokens = sourceTokens.map((item, itemIndex) =>
          itemIndex === index ? nextToken : item
        );
        setEditedSourceText(nextTokens.join(' '));
      };

      void Haptics.selectionAsync();
      if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
        Alert.prompt(
          title,
          message,
          [
            {
              text: tUI(uiLanguage, 'create.editOcrTokenCancel'),
              style: 'cancel',
            },
            {
              text: tUI(uiLanguage, 'create.editOcrTokenSave'),
              onPress: applyEdit,
            },
          ],
          'plain-text',
          currentToken
        );
        return;
      }

      Alert.alert(title, message);
    },
    [sourceTokens, uiLanguage]
  );

  const openMembershipPaywall = React.useCallback(
    (tier?: 'lite' | 'pro') => {
      traceFirstRun('paywall', 'create_card_limit_reached');
      tabSwipeContext?.openMembershipPaywall({
        returnTo: 'create-card',
        source: 'create_card',
        tier,
        triggerSource: 'lite_card_cap',
      });
    },
    [tabSwipeContext]
  );

  const processWord = React.useCallback(
    async (target: SelectedSourceTarget) => {
      const word = target.text;
      const targetAnchoredOCRText =
        !editedSourceText.trim() && ocrBlocks.length > 0
          ? buildTargetAnchoredOCRText(ocrBlocks, word, {
              targetOccurrence: target.targetOccurrence,
            })
          : null;
      const sentenceForCard =
        pickSentenceContainingWord(targetAnchoredOCRText || sourceText, word, {
          targetOccurrence: target.targetOccurrence,
        }) ||
        targetAnchoredOCRText ||
        sourceText ||
        word;
      if (__DEV__ && targetAnchoredOCRText) {
        console.log('[CreateCard][OCR] Using target-anchored region', {
          target: word,
          sourceLength: sourceText.length,
          regionLength: targetAnchoredOCRText.length,
        });
      }
      try {
        traceFirstRun('starter_allowance', 'card_generation_started', {
          isTutorial: isDefaultExperienceTutorial,
        });
        setStreamStatusText('');
        setPartialGeneratedCard(null);
        setIsBufferedStreamPreview(false);
        setPreviewPhase('frontThinking');
        setPreviewRevealState(EMPTY_PREVIEW_REVEAL);
        await new Promise((resolve) =>
          setTimeout(resolve, GHOST_INITIAL_LOADING_BEAT_MS)
        );
        const initialGhostCard = buildPartialGhostCard({
          word,
          sourceSentence: sentenceForCard,
          fields: {
            normalizedTargetWord: word,
            sentenceTranslation: sentenceForCard,
          },
          uiLanguage,
          aiBreakdownMode,
          selectedAlbumIds: selectedBatchAlbumIds,
        });
        setPartialGeneratedCard(initialGhostCard);
        setIsBufferedStreamPreview(true);
        setPreviewPhase('complete');
        setPreviewRevealState(COMPLETE_PREVIEW_REVEAL);
        let accumulatedRaw = '';
        let didShowStreamPreview = Boolean(initialGhostCard);
        let generated: Awaited<ReturnType<typeof generateContentForWord>>;
        const aiGenerationStartedAt = Date.now();
        const isBundledDemoContent = isEligibleDefaultExperienceGeneration({
          isTutorial: isDefaultExperienceTutorial,
          targetWord: word,
          originalSentence: sentenceForCard,
        });
        const generationSource = resolveTutorialGenerationSource({
          isTutorial: isDefaultExperienceTutorial,
          isBundledDemoContent,
        });
        try {

          if (generationSource === 'bundled-fixture') {
            generated = await generateDefaultExperienceCardContent({
              replyLanguage: aiReplyLanguage,
              aiBreakdownMode: 'context',
            });
            setStreamStatusText(
              tUI(uiLanguage, 'create.ghostStatusFinalizing')
            );
          } else {
            generated = await generateContentForWordStream(
              word,
              sentenceForCard,
              {
                replyLanguage: aiReplyLanguage,
                aiBreakdownMode,
              },
              {
                onFirstToken: () => {
                  setStreamStatusText(
                    tUI(uiLanguage, 'create.ghostStatusFinalizing')
                  );
                },
                onToken: (delta) => {
                  accumulatedRaw += delta;
                  const partialFields =
                    parseIncompleteGenerateCardJSON(accumulatedRaw);
                  const partialCard = buildPartialGhostCard({
                    word,
                    sourceSentence: sentenceForCard,
                    fields: partialFields,
                    uiLanguage,
                    aiBreakdownMode,
                    selectedAlbumIds: selectedBatchAlbumIds,
                  });
                  if (partialCard) {
                    didShowStreamPreview = true;
                    setIsBufferedStreamPreview(true);
                    setPreviewPhase('complete');
                    setPreviewRevealState(COMPLETE_PREVIEW_REVEAL);
                    setPartialGeneratedCard(partialCard);
                  }
                },
              }
            );
          }
        } catch (streamError) {
          if (!shouldFallbackToCloudGeneration(generationSource)) {
            throw streamError;
          }
          // Access-control failures are authoritative. Do not hide them behind
          // a second non-stream request; let the outer handler open membership.
          if (isPremiumFeatureError(streamError)) {
            throw streamError;
          }
          console.warn('[CreateCard] stream generate fallback:', streamError);
          setStreamStatusText('');
          setPartialGeneratedCard(null);
          setIsBufferedStreamPreview(false);
          setPreviewPhase('frontThinking');
          setPreviewRevealState(EMPTY_PREVIEW_REVEAL);
          generated = await generateContentForWord(word, sentenceForCard, {
            replyLanguage: aiReplyLanguage,
            aiBreakdownMode,
          });
        }
        void logDiagnosticEvent({
          severity: 'info',
          category: 'ai',
          event: 'create_card_ai_generation_completed',
          context: {
            elapsedMs: Date.now() - aiGenerationStartedAt,
            aiBreakdownMode,
            replyLanguage: aiReplyLanguage,
            targetLength: word.length,
            sourceLength: sentenceForCard.length,
            usedStreamPreview: didShowStreamPreview,
            hasCollocations: Boolean((generated.frequentCollocations || '').trim()),
            hasExamples: Boolean((generated.exampleSentence || '').trim()),
            hasSemanticRelations: Boolean((generated.semanticRelations || '').trim()),
            hasPhoneticTranscription: Boolean(generated.phoneticTranscription),
          },
        });
        const typoSuggestionRaw = generated.isLikelyTypo
          ? normalizeDisplayWord(generated.correctedTargetWord || '')
          : '';
        const typoSuggestion =
          typoSuggestionRaw &&
          normalizeSelectableTerm(typoSuggestionRaw).toLowerCase() !==
            normalizeSelectableTerm(word).toLowerCase()
            ? typoSuggestionRaw
            : undefined;
        const aiDetectedPhrase = normalizeDisplayWord(
          generated.detectedPhrase ||
            (generated.isPartOfPhrase ? generated.suggestedWord || '' : '')
        );
        triggerBuzzHaptic();
        const aiSuggestedWord =
          normalizeDisplayWord(generated.suggestedWord || word) || word;
        const heuristicTargetPhrase = normalizeDisplayWord(
          aiDetectedPhrase ||
            generated.detectedPhrase ||
            (generated.isPartOfPhrase ? generated.suggestedWord || '' : '')
        );
        const resolvedDisplayWord = typoSuggestion
          ? word
          : heuristicTargetPhrase &&
              heuristicTargetPhrase.toLowerCase() !==
                normalizeSelectableTerm(word).toLowerCase()
            ? heuristicTargetPhrase
            : aiSuggestedWord;
        const resolvedTargetPhrase =
          heuristicTargetPhrase &&
          heuristicTargetPhrase.toLowerCase() !== aiSuggestedWord.toLowerCase()
            ? heuristicTargetPhrase
            : undefined;
        const generatedContextSections = parseCardContextSections({
          raw: generated.contextualExplanation,
          displayWord: resolvedDisplayWord,
          definition: generated.definition,
          sourceSentence: sentenceForCard,
          manualMode: false,
        });
        const card: CompletedCard = {
          word,
          displayWord: resolvedDisplayWord,
          typoSuggestion,
          typoReason: generated.typoReason || undefined,
          targetPhrase:
            !typoSuggestion &&
            resolvedTargetPhrase &&
            resolvedTargetPhrase.toLowerCase() !==
              resolvedDisplayWord.toLowerCase()
              ? resolvedTargetPhrase
              : undefined,
          partOfSpeech:
            resolveNormalizedPartOfSpeech(
              generated.partOfSpeech,
              generated.definition
            ) || 'noun',
          definition:
            generated.definition ||
            `${resolvedDisplayWord} (${tUI(uiLanguage, 'create.definitionFallback')})`,
          cultural: generated.contextualExplanation || '',
          collocationsText: (generated.frequentCollocations || '').trim(),
          semanticRelationsText: (generated.semanticRelations || '').trim(),
          note: '',
          phoneticTranscription: generated.phoneticTranscription || null,
          // The source excerpt is selected locally. AI may quote or format it
          // for translation, but must never replace the stored original.
          sourceSentence: sentenceForCard,
          manualMode: false,
          addedToDeck: true,
          selectedAlbumIds: [...selectedBatchAlbumIds],
          aiBreakdownMode,
          tags: generated.tags || [],
        };

        setGeneratingCards((prev) =>
          prev.map((item) =>
            item.targetId === target.id ? { ...item, completed: true } : item
          )
        );
        setPartialGeneratedCard(null);
        setActivePreviewCard(card);
        appendCompletedCard(card);
        if (didShowStreamPreview) {
          setPreviewPhase('complete');
          setPreviewRevealState(COMPLETE_PREVIEW_REVEAL);
          await new Promise((resolve) => setTimeout(resolve, 420));
        } else {
          await runCardRevealSequence(card);
        }
        setActivePreviewCard((current) =>
          current?.word === card.word &&
          current?.sourceSentence === card.sourceSentence
            ? null
            : current
        );
        setIsBufferedStreamPreview(false);
        setPreviewPhase('complete');
        setPreviewRevealState(COMPLETE_PREVIEW_REVEAL);
        setGenerationFailure((current) =>
          current?.word === word ? null : current
        );
        setGeneratedTargetIds((prev) => new Set([...prev, target.id]));
        return { status: 'success' as const, card };
      } catch (error) {
        if (isPremiumFeatureError(error)) {
          if (SubscriptionService.isPremiumBypassEnabled()) {
            console.warn(
              '[CreateCard] Premium bypass is active, but backend still returned a premium gate.',
              error
            );
            const card = buildRecordingBypassCard({
              word,
              sentenceForCard,
              uiLanguage,
              aiBreakdownMode,
              selectedAlbumIds: selectedBatchAlbumIds,
            });
            triggerBuzzHaptic();
            setGeneratingCards((prev) =>
              prev.map((item) =>
                item.targetId === target.id
                  ? { ...item, completed: true }
                  : item
              )
            );
            setPartialGeneratedCard(null);
            setActivePreviewCard(card);
            appendCompletedCard(card);
            await runCardRevealSequence(card);
            setActivePreviewCard((current) =>
              current?.word === card.word &&
              current?.sourceSentence === card.sourceSentence
                ? null
                : current
            );
            setIsBufferedStreamPreview(false);
            setPreviewPhase('complete');
            setPreviewRevealState(COMPLETE_PREVIEW_REVEAL);
            setGenerationFailure((current) =>
              current?.word === word ? null : current
            );
            setGeneratedTargetIds((prev) => new Set([...prev, target.id]));
            traceFirstRun('starter_allowance', 'card_generation_succeeded', {
              isTutorial: isDefaultExperienceTutorial,
            });
            return { status: 'success' as const, card };
          }
          setGeneratingCards([]);
          setActivePreviewCard(null);
          setPartialGeneratedCard(null);
          setIsBufferedStreamPreview(false);
          setPreviewPhase('frontThinking');
          setPreviewRevealState(EMPTY_PREVIEW_REVEAL);
          setGenerationFailure(null);
          pendingPremiumRetryRef.current = true;
          traceFirstRun('starter_allowance', 'card_generation_paywalled', {
            isTutorial: isDefaultExperienceTutorial,
          });
          if (
            shouldOpenStarterPaywall({
              isTutorial: isDefaultExperienceTutorial,
              tourStep: appTour.step,
            })
          ) {
            if (
              isLiteQuotaExceededError(error, entitlementSnapshot?.planType)
            ) {
              openMembershipPaywall('pro');
            } else {
              openMembershipPaywall();
            }
          }
          return { status: 'blocked' as const };
        }
        console.error('[CreateCard] generate failed:', word, error);
        traceFirstRun('starter_allowance', 'card_generation_failed', {
          isTutorial: isDefaultExperienceTutorial,
          error,
        });
        const message =
          error instanceof Error
            ? error.message
            : tUI(uiLanguage, 'create.generateFailedBody');
        setGeneratingCards([]);
        setActivePreviewCard(null);
        setPartialGeneratedCard(null);
        setIsBufferedStreamPreview(false);
        setPreviewPhase('frontThinking');
        setPreviewRevealState(EMPTY_PREVIEW_REVEAL);
        setGenerationFailure({ word, message });
        return { status: 'failed' as const };
      }
    },
    [
      aiBreakdownMode,
      aiReplyLanguage,
      appendCompletedCard,
      appTour.step,
      editedSourceText,
      ocrBlocks,
      openMembershipPaywall,
      runCardRevealSequence,
      selectedBatchAlbumIds,
      sourceText,
      uiLanguage,
      isDefaultExperienceTutorial,
    ]
  );

  const beginGenerate = React.useCallback(async () => {
    if (selectedTargets.length === 0) return;

    const newTargets = selectedTargets.filter(
      (target) => !generatedTargetIds.has(target.id)
    );
    if (newTargets.length === 0) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGenerationFailure(null);
    setHasStarted(true);
    setActivePreviewCard(null);
    setPartialGeneratedCard(null);
    setIsBufferedStreamPreview(false);
    setPreviewPhase('frontThinking');
    setPreviewRevealState(EMPTY_PREVIEW_REVEAL);

    const handledTargetIds = new Set<string>();
    for (const target of newTargets) {
      if (handledTargetIds.has(target.id)) continue;
      setPreviewPhase('frontThinking');
      setPreviewRevealState(EMPTY_PREVIEW_REVEAL);
      setPartialGeneratedCard(null);
      setIsBufferedStreamPreview(false);
      setStreamStatusText('');
      setGeneratingCards([
        { targetId: target.id, word: target.text, completed: false },
      ]);
      const result = await processWord(target);
      if (result.status === 'blocked') break;
      handledTargetIds.add(target.id);
      if (result.status !== 'success') continue;

      const resolvedSubject = normalizeSelectableTerm(
        result.card.targetPhrase || result.card.displayWord
      );
      const resolvedSubjectTokens = resolvedSubject
        .split(/\s+/)
        .filter(Boolean);
      if (resolvedSubjectTokens.length < 2 || result.card.typoSuggestion)
        continue;

      for (const candidate of newTargets) {
        const candidateText = normalizeSelectableTerm(candidate.text);
        if (
          candidate.id !== target.id &&
          candidateText &&
          ` ${resolvedSubject} `.includes(` ${candidateText} `)
        ) {
          handledTargetIds.add(candidate.id);
          setGeneratedTargetIds((prev) => new Set([...prev, candidate.id]));
        }
      }
    }

    setTimeout(() => {
      cancelPendingPreviewScroll();
      setHasStarted(false);
      setGeneratingCards([]);
      setPartialGeneratedCard(null);
      setIsBufferedStreamPreview(false);
    }, 220);
  }, [
    cancelPendingPreviewScroll,
    generatedTargetIds,
    processWord,
    selectedTargets,
  ]);

  const newSelectedTargets = selectedTargets.filter(
    (target) => !generatedTargetIds.has(target.id)
  );
  const hasNewWords = newSelectedTargets.length > 0;
  const previewDisplayCard = activePreviewCard || partialGeneratedCard;
  const isPartialPreviewActive = Boolean(
    partialGeneratedCard && !activePreviewCard
  );
  const previewStackCards = React.useMemo(
    () =>
      activePreviewCard
        ? completedCards.filter((card) => card.word !== activePreviewCard.word)
        : completedCards,
    [activePreviewCard, completedCards]
  );
  const isGenerateDisabled = selectedTargets.length === 0;

  const handleGenerate = React.useCallback(async () => {
    if (selectedTargets.length === 0) return;
    console.log('[CreateCard][Generate] pressed', {
      selectedTargets: selectedTargets.length,
      effectiveGenerationMode,
      planType: entitlementSnapshot?.planType ?? 'unknown',
      canUseAutoCardGeneration:
        entitlementSnapshot?.canUseAutoCardGeneration ?? null,
      canUseCloudAI: entitlementSnapshot?.canUseCloudAI ?? null,
    });
    await beginGenerate();
  }, [
    beginGenerate,
    effectiveGenerationMode,
    entitlementSnapshot,
    selectedTargets.length,
  ]);

  React.useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      SUBSCRIPTION_ENTITLEMENT_UPDATED_EVENT,
      (snapshot: EntitlementSnapshot) => {
        setEntitlementSnapshot(snapshot);
        if (!pendingPremiumRetryRef.current) return;
        if (snapshot.planType !== 'premium' && snapshot.planType !== 'trial')
          return;

        pendingPremiumRetryRef.current = false;
        tabSwipeContext?.goToTab(1, { animation: 'fade', durationMs: 280 });
        setTimeout(() => {
          void beginGenerate();
        }, 360);
      }
    );

    return () => {
      subscription.remove();
    };
  }, [beginGenerate, tabSwipeContext]);

  const handleTourGeneratePress = React.useCallback(() => {
    if (appTour.step === 'STEP_6_GENERATE_SAMPLE') {
      shouldPromptTourSaveOnScrollRef.current = true;
      appTour.goToStep('STEP_7_SAVE_SAMPLE');
      requestAnimationFrame(() => {
        void handleGenerate();
      });
      return;
    }
    void handleGenerate();
  }, [appTour, handleGenerate]);

  const handleCreateCardScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      currentScrollYRef.current = event.nativeEvent.contentOffset.y;
      if (!shouldPromptTourSaveOnScrollRef.current) return;
      if (completedCards.length === 0) return;

      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      if (distanceFromBottom > 180) return;

      shouldPromptTourSaveOnScrollRef.current = false;
      appTour.goToStep('STEP_7_SAVE_SAMPLE');
    },
    [appTour, completedCards.length]
  );

  const handleOpenPremiumUpsell = React.useCallback(
    (_featureLabel: string) => {
      openMembershipPaywall();
    },
    [openMembershipPaywall]
  );

  const updateCardField = React.useCallback(
    (word: string, patch: Partial<CompletedCard>) => {
      setCompletedCards((prev) =>
        prev.map((card) => (card.word === word ? { ...card, ...patch } : card))
      );
      setActivePreviewCard((prev) =>
        prev?.word === word ? { ...prev, ...patch } : prev
      );
    },
    []
  );

  const applyTypoDecision = React.useCallback(
    (card: CompletedCard, accepted: boolean, overrideText = '') => {
      const suggestion = normalizeDisplayWord(
        overrideText || card.typoSuggestion || ''
      );
      if (!suggestion) return;
      void Haptics.selectionAsync();
      updateCardField(card.word, {
        displayWord: accepted ? suggestion : card.word,
        targetPhrase: accepted ? undefined : card.targetPhrase,
        typoDecision: accepted ? 'accepted' : 'rejected',
      });
      setTypoOverrideInputs((prev) => {
        const next = { ...prev };
        delete next[card.word];
        return next;
      });
    },
    [updateCardField]
  );

  const updateCardAlbums = React.useCallback(
    (word: string, updater: (albumIds: string[]) => string[]) => {
      const apply = (card: CompletedCard): CompletedCard => ({
        ...card,
        selectedAlbumIds: updater(card.selectedAlbumIds || []),
      });
      setCompletedCards((prev) =>
        prev.map((card) => (card.word === word ? apply(card) : card))
      );
      setActivePreviewCard((prev) =>
        prev?.word === word ? apply(prev) : prev
      );
    },
    []
  );

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
        albumIds.includes(albumId)
          ? albumIds.filter((id) => id !== albumId)
          : Array.from(new Set([...albumIds, albumId]))
      );
    },
    [albumTargetWord, updateCardAlbums]
  );

  const openDraftAlbumSheet = React.useCallback((word: string) => {
    setAlbumTargetWord(word);
    setShowAlbumSheet(true);
  }, []);

  const openCreateAlbumModal = React.useCallback(() => {
    setIsCreateAlbumModalVisible(true);
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
      await saveDeckAlbumPreferences(nextPrefs, cachedItem.userId);
      setAlbumPrefs(nextPrefs);
      if (albumTargetWord) {
        updateCardAlbums(albumTargetWord, (albumIds) =>
          Array.from(new Set([...albumIds, newAlbum.id]))
        );
      }
      setIsCreateAlbumModalVisible(false);
      setNewAlbumName('');
    } catch (error) {
      console.error('[CreateCard] create album failed:', error);
      Alert.alert(
        tUI(uiLanguage, 'create.createAlbumFailedTitle'),
        tUI(uiLanguage, 'create.createAlbumFailedBody')
      );
    }
  }, [albumPrefs, albumTargetWord, newAlbumName, updateCardAlbums, uiLanguage]);

  const openDraftPronunciationModal = React.useCallback(() => {
    Alert.alert(
      tUI(uiLanguage, 'create.pronunciationCoachTitle'),
      tUI(uiLanguage, 'create.pronunciationSaveFirstBody')
    );
  }, [uiLanguage]);

  const playDraftPreviewWord = React.useCallback(
    (word: string) => {
      const text = word.trim();
      if (!text) {
        Alert.alert(
          tUI(uiLanguage, 'create.noSpeakableContentTitle'),
          tUI(uiLanguage, 'create.noSpeakableContentBody')
        );
        return;
      }

      void Haptics.selectionAsync();
      void speakEnglishNaturally(text, {
        onDownloadStart: () => setPreviewWordAudioLoading(text),
        onDownloadEnd: () =>
          setPreviewWordAudioLoading((current) =>
            current === text ? null : current
          ),
        onDone: () =>
          setPreviewWordAudioLoading((current) =>
            current === text ? null : current
          ),
        onStopped: () =>
          setPreviewWordAudioLoading((current) =>
            current === text ? null : current
          ),
        onError: () =>
          setPreviewWordAudioLoading((current) =>
            current === text ? null : current
          ),
      });
    },
    [uiLanguage]
  );

  const updateNote = (word: string, note: string) => {
    updateCardField(word, { note });
  };

  const toggleCollocations = (word: string) => {
    setShowCollocations((prev) => ({ ...prev, [word]: !prev[word] }));
  };

  const persistCardDraftsOptimistically = async (
    cardsToPersist: CompletedCard[]
  ) => {
    if (cardsToPersist.length === 0) return;
    setSaving(true);
    const analyticsSourceType = originalImageUri ? 'image' : 'text';
    analytics.track('card_creation_started', {
      source_type: analyticsSourceType,
      selected_card_count: cardsToPersist.length,
    });
    try {
      const activeUserId = await assertRecordOwnedByCurrentUser(
        cachedItem.userId,
        '這筆 Cache 資料'
      );
      const imageSourceForUpload =
        originalImageUri || cachedItem.imageStoragePath || '';

      const cardsCollection = database.get<Card>('cards');
      const createdCardIds: string[] = [];
      const stickyDraftsToPersist: Array<{ cardId: string; note: string }> = [];
      await database.write(async () => {
        for (const cardDraft of cardsToPersist) {
          const created = await cardsCollection.create((card) => {
            assignCloudCardId(card);
            const sourceSentence = (
              cardDraft.sourceSentence ||
              pickSentenceContainingWord(sourceText, cardDraft.word)
            ).trim();
            card.userId = activeUserId;
            card.cachedItemId = cachedItem.id;
            card.targetWord = cardDraft.displayWord;
            card.targetPhrase = cardDraft.targetPhrase || undefined;
            card.originalSentence = sourceSentence || sourceText;
            card.definition =
              cardDraft.definition.trim() ||
              `${cardDraft.displayWord} (${tUI(uiLanguage, 'create.definitionFallback')})`;
            card.partOfSpeech = cardDraft.partOfSpeech.trim() || undefined;
            card.contextualExplanation = cardDraft.cultural.trim() || undefined;
            card.frequentCollocations =
              cardDraft.collocationsText.trim() || undefined;
            card.semanticRelations =
              cardDraft.semanticRelationsText.trim() || undefined;
            card.phoneticTranscription =
              cardDraft.phoneticTranscription || undefined;
            const selectedAlbumIds = cardDraft.selectedAlbumIds || [];
            const albumTags = selectedAlbumIds.map(
              (id) => `${ALBUM_TAG_PREFIX}${id}`
            );
            const categoryTags = selectedAlbumIds
              .map((id) => albumIdToCategoryTag[id])
              .filter((tag): tag is string => Boolean(tag));
            const tags = Array.from(
              new Set(
                [
                  cachedItem.sourceApp,
                  'create-flow',
                  cardDraft.aiBreakdownMode
                    ? `ai_mode:${cardDraft.aiBreakdownMode}`
                    : null,
                  ...(cardDraft.tags || []),
                  ...albumTags,
                  ...categoryTags,
                ].filter(Boolean) as string[]
              )
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
        const stickyNotesMap = await loadCardStickyNotes(activeUserId);
        stickyDraftsToPersist.forEach((draft) => {
          stickyNotesMap[draft.cardId] = draft.note;
        });
        await saveCardStickyNotes(stickyNotesMap, activeUserId);
      }

      queueSavedCardsForCloudPersistence({
        userId: activeUserId,
        cardIds: createdCardIds,
      });

      const localImageSource = originalImageUri || imageSourceForUpload;
      if (localImageSource) {
        const durableUploads = await Promise.all(
          createdCardIds.map(async (id) => {
            try {
              const localUri = await persistLocalCardImage(
                id,
                localImageSource
              );
              if (!localUri) {
                console.warn('[CreateCard] local card image persist skipped', {
                  cardId: id,
                  imageSourceForUpload: localImageSource,
                });
              }
              return localUri ? { cardId: id, localUri } : null;
            } catch (localPersistError) {
              console.warn('[CreateCard] local card image persist failed', {
                cardId: id,
                error:
                  localPersistError instanceof Error
                    ? localPersistError.message
                    : localPersistError,
              });
              return null;
            }
          })
        );
        await queueCardImageUploads({
          userId: activeUserId,
          uploads: durableUploads.filter(
            (item): item is { cardId: string; localUri: string } =>
              item !== null
          ),
        });
      }

      void ReminderNotificationService.evaluateAndSchedule({
        allowSoftPrompt: false,
      }).catch((error) => {
        console.warn('[Reminders] schedule after card save failed:', error);
      });

      analytics.track('card_creation_succeeded', {
        source_type: analyticsSourceType,
        card_count: createdCardIds.length,
        is_tutorial: isDefaultExperienceTutorial,
      });

      if (createdCardIds.length > 0) {
        if (isDefaultExperienceTutorial) {
          await markDefaultExperienceQuizHintPending(activeUserId);
        }
        if (
          appTour.step === 'STEP_7_SAVE_SAMPLE' ||
          isDefaultExperienceTutorial
        ) {
          appTour.setSampleCardId(createdCardIds[0]);
        }
      }
    } catch (error) {
      console.error('[CreateCard] save failed:', error);
      analytics.track('card_creation_failed', {
        source_type: analyticsSourceType,
        reason: isPremiumFeatureError(error) ? 'premium_required' : 'save_failed',
      });
      const message =
        error instanceof Error
          ? error.message
          : tUI(uiLanguage, 'create.saveErrorBody');
      Alert.alert(tUI(uiLanguage, 'create.saveErrorTitle'), message);
    } finally {
      setSaving(false);
    }
  };

  React.useEffect(() => {
    if (saving) return;
    const cardsToPersist = claimUnsavedCards(
      completedCards.filter((card) => card.addedToDeck),
      optimisticSaveClaimsRef.current
    );
    if (cardsToPersist.length === 0) return;
    void persistCardDraftsOptimistically(cardsToPersist);
  }, [completedCards, saving]);

  const handleDone = React.useCallback(() => {
    cancelDefaultExperienceSaveArrowRef.current?.();
    cancelDefaultExperienceSaveArrowRef.current = null;
    setShowDefaultExperienceSaveArrow(false);
    if (
      isDefaultExperienceTutorial ||
      appTour.step === 'STEP_7_SAVE_SAMPLE'
    ) {
      appTour.goToStep('STEP_10_QUIZ_SAMPLE');
      tabSwipeContext?.goToTab(0, { animation: 'slide', durationMs: 400 });
      setTimeout(() => {
        goToCacheHome();
      }, 420);
      return;
    }
    goToCacheHome();
  }, [
    appTour,
    completedCards,
    goToCacheHome,
    isDefaultExperienceTutorial,
    tabSwipeContext,
  ]);

  const renderTypoSuggestion = React.useCallback(
    (card: CompletedCard | null) => {
      if (!card?.typoSuggestion || card.typoDecision) return null;
      const overrideValue = typoOverrideInputs[card.word] || '';
      const trimmedOverride = normalizeDisplayWord(overrideValue);
      return (
        <View style={styles.typoSuggestionInline}>
          <Text
            style={[
              styles.typoSuggestionPrompt,
              { color: palette.secondaryText },
            ]}
          >
            {tUI(uiLanguage, 'create.didYouMean')}?
          </Text>
          <View style={styles.typoSuggestionChoices}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${tUI(uiLanguage, 'create.didYouMeanYes')}: ${card.typoSuggestion}`}
              hitSlop={4}
              style={({ pressed }) => [
                styles.typoSuggestionChoice,
                pressed ? styles.typoSuggestionChoicePressed : null,
              ]}
              onPress={() => applyTypoDecision(card, true)}
            >
              <Text
                style={[
                  styles.typoSuggestionRecommendedText,
                  { color: MODAL_CTA_COLOR },
                ]}
              >
                {card.typoSuggestion}
              </Text>
            </Pressable>
            <Text
              style={[
                styles.typoSuggestionSeparator,
                { color: palette.secondaryText },
              ]}
            >
              ·
            </Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={4}
              style={({ pressed }) => [
                styles.typoSuggestionChoice,
                pressed ? styles.typoSuggestionChoicePressed : null,
              ]}
              onPress={() => applyTypoDecision(card, false)}
            >
              <Text
                style={[
                  styles.typoSuggestionChoiceText,
                  { color: palette.textOnContainer },
                ]}
              >
                {tUI(uiLanguage, 'create.didYouMeanNo')}
              </Text>
            </Pressable>
            <Text
              style={[
                styles.typoSuggestionSeparator,
                { color: palette.secondaryText },
              ]}
            >
              ·
            </Text>
            <TextInput
              value={overrideValue}
              onChangeText={(text) =>
                setTypoOverrideInputs((prev) => ({
                  ...prev,
                  [card.word]: text,
                }))
              }
              placeholder={tUI(
                uiLanguage,
                'create.didYouMeanCustomPlaceholder'
              )}
              placeholderTextColor={palette.secondaryText}
              accessibilityLabel={tUI(
                uiLanguage,
                'create.didYouMeanCustomPlaceholder'
              )}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              style={[
                styles.typoSuggestionInlineInput,
                {
                  color: palette.textOnContainer,
                  borderBottomColor: trimmedOverride
                    ? MODAL_CTA_COLOR
                    : palette.borderSubtle,
                },
              ]}
              onSubmitEditing={() => {
                if (trimmedOverride)
                  applyTypoDecision(card, true, trimmedOverride);
              }}
            />
            {trimmedOverride ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={6}
                style={({ pressed }) => [
                  styles.typoSuggestionUseInline,
                  pressed ? styles.typoSuggestionChoicePressed : null,
                ]}
                onPress={() => applyTypoDecision(card, true, trimmedOverride)}
              >
                <Text
                  style={[
                    styles.typoSuggestionUseInlineText,
                    { color: MODAL_CTA_COLOR },
                  ]}
                >
                  {tUI(uiLanguage, 'create.didYouMeanUseCustom')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    },
    [
      applyTypoDecision,
      palette.borderSubtle,
      palette.secondaryText,
      palette.textOnContainer,
      typoOverrideInputs,
      uiLanguage,
    ]
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.screenBg }]}
      edges={['top']}
    >
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: palette.screenBg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tUI(uiLanguage, 'common.back')}
            hitSlop={8}
            onPress={goToCacheHome}
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor: palette.modalOptionBg,
                borderColor: palette.modalOptionBorder,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={isLight ? '#0D0D0D' : '#F4EDE6'}
            />
          </Pressable>
        </View>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isPreviewSceneActive && scrollViewportHeight > 0
              ? { paddingBottom: scrollViewportHeight }
              : null,
          ]}
          onLayout={handleScrollLayout}
          onContentSizeChange={(_width, height) => {
            scrollContentHeightRef.current = height;
          }}
          onScroll={handleCreateCardScroll}
          onScrollBeginDrag={cancelPendingPreviewScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          {!shouldHideSourcePanels && originalImageUri ? (
            <View
              style={[
                styles.block,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight
                    ? palette.borderSubtle
                    : CONTAINER_NEON_OUTLINE,
                  shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                  shadowOpacity: isLight ? 0.06 : 0.16,
                },
              ]}
            >
              <Text
                style={[styles.blockTitle, { color: palette.secondaryText }]}
              >
                {tUI(uiLanguage, 'create.originalImage')}
              </Text>
              <Image
                source={{ uri: originalImageUri }}
                style={[
                  styles.originalImage as ImageStyle,
                  { backgroundColor: palette.modalOptionBg },
                ]}
                resizeMode="contain"
              />
              {isOcrRunning ? (
                <Text style={[styles.ocrStatus, { color: MODAL_CTA_COLOR }]}>
                  {tUI(uiLanguage, 'create.ocrRunning')}
                </Text>
              ) : null}
              {ocrError ? (
                <Text
                  style={[
                    styles.ocrErrorText,
                    { color: palette.destructiveBg },
                  ]}
                >
                  {ocrError}
                </Text>
              ) : null}
            </View>
          ) : null}

          {!shouldHideSourcePanels ? (
            <View
              style={[
                styles.block,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight
                    ? palette.borderSubtle
                    : CONTAINER_NEON_OUTLINE,
                  shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                  shadowOpacity: isLight ? 0.06 : 0.16,
                },
              ]}
            >
              <View style={styles.sourcePanelHeader}>
                <Text
                  style={[
                    styles.blockTitle,
                    styles.sourcePanelTitle,
                    { color: palette.secondaryText },
                  ]}
                >
                  {tUI(uiLanguage, 'create.originalContext')}
                </Text>
                {isRecognizedTextEditingAvailable() && sourceTokens.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isRecognizedTextEditMode }}
                    accessibilityLabel={tUI(
                      uiLanguage,
                      isRecognizedTextEditMode
                        ? 'create.editOcrModeDone'
                        : 'create.editOcrModeAction'
                    )}
                    hitSlop={8}
                    onPress={() =>
                      setIsRecognizedTextEditMode((previous) => !previous)
                    }
                    style={({ pressed }) => [
                      styles.ocrEditModeButton,
                      {
                        backgroundColor: isRecognizedTextEditMode
                          ? MODAL_CTA_COLOR
                          : palette.modalOptionBg,
                        borderColor: isRecognizedTextEditMode
                          ? MODAL_CTA_COLOR_BORDER
                          : palette.modalOptionBorder,
                        opacity: pressed ? 0.72 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.ocrEditModeButtonText,
                        {
                          color: isRecognizedTextEditMode
                            ? TEXT_ON_CTA
                            : palette.textOnContainer,
                        },
                      ]}
                    >
                      {isRecognizedTextEditMode
                        ? tUI(uiLanguage, 'create.editOcrModeDone')
                        : `✎ ${tUI(uiLanguage, 'create.editOcrModeAction')}`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {sourceTokens.length > 0 && isRecognizedTextEditMode ? (
                <Text
                  style={[
                    styles.helperMetaText,
                    styles.ocrEditHint,
                    { color: palette.secondaryText },
                  ]}
                >
                  {tUI(uiLanguage, 'create.editOcrModeHint')}
                </Text>
              ) : null}
              {sourceTokens.length === 0 ? (
                <Text
                  style={[
                    styles.helperMetaText,
                    { color: palette.secondaryText },
                  ]}
                >
                  {isOcrRunning
                    ? tUI(uiLanguage, 'create.ocrRunning')
                    : tUI(uiLanguage, 'create.ocrNoText')}
                </Text>
              ) : (
                <View style={styles.wordsWrap}>
                  {sourceTokens.map((token, idx) => {
                    const selectedTarget = selectedTargets.find(
                      (target) =>
                        idx >= target.startIndex && idx <= target.endIndex
                    );
                    const isSelected = Boolean(selectedTarget);
                    const isGroupStart = selectedTarget?.startIndex === idx;
                    const isGroupEnd = selectedTarget?.endIndex === idx;
                    return (
                      <React.Fragment key={`${token}-${idx}`}>
                        {hardLineBreakTokenIndices.has(idx) ? (
                          <View style={styles.ocrHardLineBreak} />
                        ) : null}
                        <View style={styles.tutorialTokenWrap}>
                        {isDefaultExperienceTutorial &&
                        !selectedTokenIndices.includes(
                          defaultExperienceTargetIndex
                        ) &&
                        idx === defaultExperienceTargetIndex ? (
                          <MovingTutorialArrow
                            direction="down"
                            color={MODAL_CTA_COLOR}
                            size={27}
                            style={styles.tokenTutorialArrow}
                          />
                        ) : null}
                        <TutorialSpotlight
                          active={
                            appTour.step === 'STEP_5_SELECT_TARGET' &&
                            idx === defaultExperienceTargetIndex
                          }
                        >
                          <Pressable
                            style={({ pressed }) => [
                              styles.tokenBtn,
                              {
                                backgroundColor: isSelected
                                  ? MODAL_CTA_COLOR
                                  : palette.modalOptionBg,
                                borderColor: isSelected
                                  ? MODAL_CTA_COLOR_BORDER
                                  : palette.modalOptionBorder,
                                borderStyle: isRecognizedTextEditMode
                                  ? 'dashed'
                                  : 'solid',
                                borderTopLeftRadius:
                                  isSelected && !isGroupStart ? 4 : 8,
                                borderBottomLeftRadius:
                                  isSelected && !isGroupStart ? 4 : 8,
                                borderTopRightRadius:
                                  isSelected && !isGroupEnd ? 4 : 8,
                                borderBottomRightRadius:
                                  isSelected && !isGroupEnd ? 4 : 8,
                              },
                              pressed ? styles.pressableChipPressed : null,
                            ]}
                            onPress={() => {
                              if (
                                resolveRecognizedWordPressAction(
                                  isRecognizedTextEditMode
                                ) === 'edit'
                              ) {
                                editSourceToken(token, idx);
                                return;
                              }
                              toggleSourceToken(idx);
                            }}
                          >
                            <Text
                              style={[
                                styles.tokenText,
                                {
                                  color: isSelected
                                    ? TEXT_ON_CTA
                                    : palette.textOnContainer,
                                },
                                isSelected && styles.tokenTextSelected,
                              ]}
                            >
                              {token}
                            </Text>
                          </Pressable>
                        </TutorialSpotlight>
                        </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}

          {!shouldHideSourcePanels && selectedTargets.length > 0 ? (
            <View
              style={[
                styles.block,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight
                    ? palette.borderSubtle
                    : CONTAINER_NEON_OUTLINE,
                  shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                  shadowOpacity: isLight ? 0.06 : 0.16,
                },
              ]}
            >
              <Text
                style={[styles.blockTitle, { color: palette.secondaryText }]}
              >
                {tUI(uiLanguage, 'create.keywords')}
              </Text>
              <View style={styles.wordsWrap}>
                {selectedTargets.map((target) => {
                  const isGenerated = generatedTargetIds.has(target.id);
                  return (
                    <Pressable
                      key={target.id}
                      style={({ pressed }) => [
                        styles.keywordBtn,
                        {
                          backgroundColor: isGenerated
                            ? '#10B981'
                            : MODAL_CTA_COLOR,
                          borderColor: isGenerated
                            ? 'rgba(16,185,129,0.72)'
                            : MODAL_CTA_COLOR_BORDER,
                        },
                        pressed ? styles.pressableChipPressed : null,
                      ]}
                      onPress={() => removeSelectedTarget(target.id)}
                    >
                      <Text style={styles.keywordText}>
                        {target.text}
                        {isGenerated ? ' ✓' : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {hasNewWords && completedCards.length > 0 ? (
                <View style={styles.generateInlineWrap}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.generateInlineBtn,
                      {
                        backgroundColor: UPLOAD_CACHE_CTA_COLOR,
                        borderColor: UPLOAD_CACHE_CTA_COLOR_BORDER,
                      },
                      pressed && !isGenerateDisabled
                        ? styles.pressablePrimaryPressed
                        : null,
                    ]}
                    disabled={isGenerateDisabled}
                    onPress={() => void handleGenerate()}
                  >
                    <Text
                      style={[
                        styles.generateInlineText,
                        { color: TEXT_ON_CTA },
                      ]}
                    >
                      + {tUI(uiLanguage, 'create.addNewCards')} (
                      {newSelectedTargets.length})
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          {!hasStarted && completedCards.length === 0 ? (
            <View>
              <View
                style={[
                  styles.aiModeDropdownWrap,
                  {
                    backgroundColor: palette.containerBg,
                    borderColor: isLight
                      ? palette.borderSubtle
                      : CONTAINER_NEON_OUTLINE,
                    shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                    shadowOpacity: isLight ? 0.05 : 0.14,
                  },
                ]}
              >
                <Pressable
                  style={styles.aiModeDropdownTrigger}
                  onPress={() => {
                    setIsAlbumDestinationDropdownOpen(false);
                    setIsAIModeDropdownOpen((prev) => !prev);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isAIModeDropdownOpen }}
                >
                  <View style={styles.aiModeDropdownCopy}>
                    <Text
                      style={[
                        styles.aiModeDropdownTitle,
                        { color: palette.secondaryText },
                      ]}
                    >
                      {tUI(uiLanguage, 'create.aiDepth')}
                    </Text>
                    <Text
                      style={[
                        styles.aiModeDropdownValue,
                        { color: palette.textOnContainer },
                      ]}
                    >
                      {getAIModeLabel(aiBreakdownMode, uiLanguage)}
                    </Text>
                  </View>
                  <Reanimated.Text
                    style={[
                      styles.aiModeDropdownChevron,
                      { color: MODAL_CTA_COLOR },
                      aiModeDropdownChevronStyle,
                    ]}
                  >
                    ⌄
                  </Reanimated.Text>
                </Pressable>
                <Reanimated.View
                  style={[
                    styles.aiModeDropdownCollapsible,
                    aiModeDropdownAnimatedStyle,
                  ]}
                  pointerEvents={isAIModeDropdownOpen ? 'auto' : 'none'}
                >
                  <Reanimated.View
                    style={[
                      styles.aiModeDropdownCollapsibleContent,
                      aiModeDropdownContentAnimatedStyle,
                    ]}
                    onLayout={handleAIModeDropdownContentLayout}
                  >
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
                                    backgroundColor: isLight
                                      ? 'rgba(78,175,244,0.14)'
                                      : 'rgba(78,175,244,0.18)',
                                    borderColor: MODAL_CTA_COLOR_BORDER,
                                  }
                                : { borderColor: 'transparent' },
                            ]}
                            onPress={() =>
                              void handleSelectAIBreakdownMode(option.value)
                            }
                            accessibilityRole="radio"
                            accessibilityState={{ checked: isActive }}
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
                                  borderColor: isActive
                                    ? MODAL_CTA_COLOR_BORDER
                                    : palette.modalOptionBorder,
                                },
                              ]}
                            >
                              <Image
                                source={AI_MODE_ICON_BY_VALUE[option.value]}
                                style={styles.aiModeDropdownIcon as ImageStyle}
                                resizeMode="contain"
                              />
                            </View>
                            <View style={styles.aiModeDropdownOptionCopy}>
                              <Text
                                style={[
                                  styles.aiModeDropdownOptionLabel,
                                  {
                                    color: isActive
                                      ? MODAL_CTA_COLOR
                                      : palette.textOnContainer,
                                  },
                                ]}
                              >
                                {getAIModeLabel(option.value, uiLanguage)}
                              </Text>
                              <Text
                                style={[
                                  styles.aiModeDropdownOptionDescription,
                                  { color: palette.secondaryText },
                                ]}
                                numberOfLines={1}
                              >
                                {getAIModeDescription(option.value, uiLanguage)}
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
                  </Reanimated.View>
                </Reanimated.View>
              </View>
              <View
                style={[
                  styles.aiModeDropdownWrap,
                  {
                    backgroundColor: palette.containerBg,
                    borderColor: isLight
                      ? palette.borderSubtle
                      : CONTAINER_NEON_OUTLINE,
                    shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                    shadowOpacity: isLight ? 0.05 : 0.14,
                  },
                ]}
              >
                <Pressable
                  style={styles.aiModeDropdownTrigger}
                  onPress={() => {
                    setIsAIModeDropdownOpen(false);
                    setIsAlbumDestinationDropdownOpen((prev) => !prev);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{
                    expanded: isAlbumDestinationDropdownOpen,
                  }}
                >
                  <View style={styles.aiModeDropdownCopy}>
                    <Text
                      style={[
                        styles.aiModeDropdownValue,
                        { color: palette.textOnContainer },
                      ]}
                    >
                      {batchAlbumSummary}
                    </Text>
                  </View>
                  <Reanimated.Text
                    style={[
                      styles.aiModeDropdownChevron,
                      { color: MODAL_CTA_COLOR },
                      albumDestinationDropdownChevronStyle,
                    ]}
                  >
                    ⌄
                  </Reanimated.Text>
                </Pressable>
                <Reanimated.View
                  style={[
                    styles.aiModeDropdownCollapsible,
                    albumDestinationDropdownAnimatedStyle,
                  ]}
                  pointerEvents={
                    isAlbumDestinationDropdownOpen ? 'auto' : 'none'
                  }
                >
                  <Reanimated.View
                    style={[
                      styles.aiModeDropdownCollapsibleContent,
                      albumDestinationDropdownContentAnimatedStyle,
                    ]}
                    onLayout={handleAlbumDestinationDropdownContentLayout}
                  >
                    <View
                      style={[
                        styles.aiModeDropdownList,
                        {
                          backgroundColor: palette.modalOptionBg,
                          borderColor: palette.modalOptionBorder,
                        },
                      ]}
                    >
                      {allAlbums.length === 0 ? (
                        <Text
                          style={[
                            styles.albumDestinationEmpty,
                            { color: palette.secondaryText },
                          ]}
                        >
                          {tUI(uiLanguage, 'create.noAlbumsAvailable')}
                        </Text>
                      ) : (
                        allAlbums.map((album) => {
                          const isActive = selectedBatchAlbumIds.includes(
                            album.id
                          );
                          return (
                            <Pressable
                              key={album.id}
                              style={[
                                styles.aiModeDropdownOption,
                                isActive
                                  ? {
                                      backgroundColor: isLight
                                        ? 'rgba(78,175,244,0.14)'
                                        : 'rgba(78,175,244,0.18)',
                                      borderColor: MODAL_CTA_COLOR_BORDER,
                                    }
                                  : { borderColor: 'transparent' },
                              ]}
                              onPress={() => toggleBatchAlbum(album.id)}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: isActive }}
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
                                    borderColor: isActive
                                      ? MODAL_CTA_COLOR_BORDER
                                      : palette.modalOptionBorder,
                                  },
                                ]}
                              >
                                {album.coverImageUri ? (
                                  <Image
                                    source={{ uri: album.coverImageUri }}
                                    style={styles.albumDestinationCover}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <Text style={styles.albumDestinationEmoji}>
                                    {album.emoji || '📁'}
                                  </Text>
                                )}
                              </View>
                              <View style={styles.aiModeDropdownOptionCopy}>
                                <Text
                                  style={[
                                    styles.aiModeDropdownOptionLabel,
                                    {
                                      color: isActive
                                        ? MODAL_CTA_COLOR
                                        : palette.textOnContainer,
                                    },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {getDeckAlbumDisplayName(album, uiLanguage)}
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
                        })
                      )}
                    </View>
                  </Reanimated.View>
                </Reanimated.View>
              </View>
              {selectedTargets.length > 0 ? (
                <View style={styles.selectedSummary}>
                  <Text
                    style={[
                      styles.selectedSummaryText,
                      { color: MODAL_CTA_COLOR },
                    ]}
                  >
                    ✨ {selectedTargets.length}{' '}
                    {tUI(
                      uiLanguage,
                      selectedTargets.length > 1
                        ? 'create.cards'
                        : 'create.card'
                    )}
                  </Text>
                </View>
              ) : null}
              <TutorialSpotlight
                active={appTour.step === 'STEP_6_GENERATE_SAMPLE'}
                onSpotlightPress={handleTourGeneratePress}
              >
                <Pressable
                  onPress={handleTourGeneratePress}
                  disabled={isGenerateDisabled}
                  style={({ pressed }) => [
                    styles.generateButton,
                    {
                      backgroundColor: MODAL_CTA_COLOR,
                      borderColor: MODAL_CTA_COLOR_BORDER,
                    },
                    isGenerateDisabled && styles.generateButtonDisabled,
                    pressed && !isGenerateDisabled
                      ? styles.pressablePrimaryPressed
                      : null,
                  ]}
                >
                  {isDefaultExperienceTutorial &&
                  selectedTokenIndices.includes(defaultExperienceTargetIndex) &&
                  !hasStarted ? (
                    <MovingTutorialArrow
                      direction="down"
                      color={MODAL_CTA_COLOR}
                      size={29}
                      style={styles.primaryTutorialArrow}
                    />
                  ) : null}
                  <Text
                    style={[styles.generateButtonText, { color: TEXT_ON_CTA }]}
                  >
                    {tUI(uiLanguage, 'create.generate')}{' '}
                    {selectedTargets.length > 0
                      ? `${selectedTargets.length} ${selectedTargets.length > 1 ? tUI(uiLanguage, 'create.cards') : tUI(uiLanguage, 'create.card')}`
                      : tUI(uiLanguage, 'create.cards')}
                  </Text>
                </Pressable>
              </TutorialSpotlight>
            </View>
          ) : null}

          {previewStackCards.length > 0 ? (
            <View style={styles.previewStackWrap}>
              {previewStackCards.map((card, index) => (
                <Reanimated.View
                  key={`${card.word}-${card.sourceSentence}-${index}`}
                  entering={
                    hasStarted && !reduceMotion
                      ? STACK_CARD_ENTERING
                      : undefined
                  }
                  layout={
                    hasStarted && !reduceMotion ? STACK_CARD_LAYOUT : undefined
                  }
                  style={styles.previewStackItem}
                >
                  <CreateCardPreviewScene
                    processingWord={card.displayWord}
                    card={card}
                    palette={palette}
                    isLight={isLight}
                    hasImage={Boolean(originalImageUri)}
                    imageUri={originalImageUri || null}
                    statusText=""
                    revealState={COMPLETE_PREVIEW_REVEAL}
                    phase="complete"
                    uiLanguage={uiLanguage}
                    isFavorite={(card.selectedAlbumIds || []).includes(
                      FAVORITES_ALBUM_ID
                    )}
                    isBookmarked={(card.selectedAlbumIds || []).some(
                      (id) =>
                        id !== ALL_CARDS_ALBUM_ID && id !== FAVORITES_ALBUM_ID
                    )}
                    isWordAudioLoading={
                      previewWordAudioLoading === card.displayWord
                    }
                    headerAccessory={renderTypoSuggestion(card)}
                    onPlayWord={() => playDraftPreviewWord(card.displayWord)}
                    onOpenPronunciationModal={openDraftPronunciationModal}
                    onToggleFavorite={() => toggleDraftFavorite(card.word)}
                    onOpenAlbumSheet={() => openDraftAlbumSheet(card.word)}
                  />
                </Reanimated.View>
              ))}
            </View>
          ) : null}

          {isPreviewSceneActive ? (
            <View
              style={styles.previewSceneWrap}
              onLayout={handleActivePreviewLayout}
            >
              <CreateCardPreviewScene
                processingWord={
                  generatingCards[0]?.word ||
                  previewDisplayCard?.displayWord ||
                  selectedTargets[0]?.text ||
                  'Generating'
                }
                card={previewDisplayCard}
                palette={palette}
                isLight={isLight}
                hasImage={Boolean(originalImageUri)}
                imageUri={originalImageUri || null}
                statusText={
                  streamStatusText ||
                  tUI(
                    uiLanguage,
                    GHOST_CARD_STATUS_KEYS[ghostStatusIndex] ||
                      'create.ghostStatusExtracting'
                  )
                }
                revealState={
                  isPartialPreviewActive
                    ? COMPLETE_PREVIEW_REVEAL
                    : previewRevealState
                }
                phase={isPartialPreviewActive ? 'complete' : previewPhase}
                uiLanguage={uiLanguage}
                isFavorite={(
                  previewDisplayCard?.selectedAlbumIds || []
                ).includes(FAVORITES_ALBUM_ID)}
                isBookmarked={(previewDisplayCard?.selectedAlbumIds || []).some(
                  (id) => id !== ALL_CARDS_ALBUM_ID && id !== FAVORITES_ALBUM_ID
                )}
                isWordAudioLoading={
                  previewDisplayCard
                    ? previewWordAudioLoading === previewDisplayCard.displayWord
                    : false
                }
                streamingText={isBufferedStreamPreview}
                headerAccessory={renderTypoSuggestion(previewDisplayCard)}
                onPlayWord={
                  activePreviewCard
                    ? () => playDraftPreviewWord(activePreviewCard.displayWord)
                    : undefined
                }
                onOpenPronunciationModal={
                  activePreviewCard ? openDraftPronunciationModal : undefined
                }
                onToggleFavorite={
                  activePreviewCard
                    ? () => toggleDraftFavorite(activePreviewCard.word)
                    : undefined
                }
                onOpenAlbumSheet={
                  activePreviewCard
                    ? () => openDraftAlbumSheet(activePreviewCard.word)
                    : undefined
                }
              />
            </View>
          ) : null}

          {generationFailure ? (
            <View
              style={[
                styles.generationFailPanel,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight
                    ? palette.borderSubtle
                    : 'rgba(255,107,107,0.34)',
                  shadowColor: isLight ? '#000000' : '#FF6B6B',
                  shadowOpacity: isLight ? 0.06 : 0.14,
                },
              ]}
            >
              <Text style={styles.generationFailIcon}>!</Text>
              <Text
                style={[
                  styles.generationFailTitle,
                  { color: palette.textOnContainer },
                ]}
              >
                {tUI(uiLanguage, 'create.generateFailedTitle')} “
                {generationFailure.word}”
              </Text>
              <Text
                style={[
                  styles.generationFailBody,
                  { color: palette.secondaryText },
                ]}
              >
                {generationFailure.message}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.generationFailRetry,
                  {
                    backgroundColor: UPLOAD_CACHE_CTA_COLOR,
                    borderColor: UPLOAD_CACHE_CTA_COLOR_BORDER,
                  },
                  pressed ? styles.pressablePrimaryPressed : null,
                ]}
                onPress={() => void handleGenerate()}
              >
                <Text
                  style={[
                    styles.generationFailRetryText,
                    { color: TEXT_ON_CTA },
                  ]}
                >
                  {tUI(uiLanguage, 'create.retry')}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {!hasStarted && completedCards.length > 0 ? (
            <View
              style={styles.completedWrap}
              onLayout={handleCompletedActionsLayout}
            >
              <View style={styles.saveWrap}>
                <TutorialSpotlight
                  active={appTour.step === 'STEP_7_SAVE_SAMPLE'}
                  onSpotlightPress={handleDone}
                >
                  <Pressable
                    onPress={handleDone}
                    style={({ pressed }) => [
                      styles.saveButton,
                      {
                        backgroundColor: MODAL_CTA_COLOR,
                        borderColor: MODAL_CTA_COLOR_BORDER,
                      },
                      pressed ? styles.pressablePrimaryPressed : null,
                    ]}
                  >
                    {showDefaultExperienceSaveArrow ? (
                      <MovingTutorialArrow
                        direction="down"
                        color={MODAL_CTA_COLOR}
                        size={29}
                        style={styles.primaryTutorialArrow}
                      />
                    ) : null}
                    <Text
                      style={[styles.saveButtonText, { color: TEXT_ON_CTA }]}
                    >
                      {tUI(uiLanguage, 'common.done')}
                    </Text>
                  </Pressable>
                </TutorialSpotlight>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <CardAlbumSheetModalUI
          visible={showAlbumSheet}
          selectedAlbums={albumTargetCard?.selectedAlbumIds || []}
          allAlbums={allAlbums}
          uiLanguage={uiLanguage}
          onDone={() => setShowAlbumSheet(false)}
          onOpenCreateAlbum={openCreateAlbumModal}
          onToggleAlbum={toggleDraftAlbum}
          createAlbumVisible={isCreateAlbumModalVisible}
          createAlbumName={newAlbumName}
          onChangeCreateAlbumName={setNewAlbumName}
          onCancelCreateAlbum={() => {
            setIsCreateAlbumModalVisible(false);
            setNewAlbumName('');
          }}
          onConfirmCreateAlbum={() => void createAlbum()}
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitleWrap: {
    flex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  sourcePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  sourcePanelTitle: {
    marginBottom: 0,
  },
  ocrEditModeButton: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ocrEditModeButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  wordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  ocrHardLineBreak: {
    width: '100%',
    height: 0,
  },
  tutorialTokenWrap: {
    position: 'relative',
  },
  tokenTutorialArrow: {
    position: 'absolute',
    top: -60,
    left: 0,
    right: 0,
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
  aiModeDropdownCollapsible: {
    overflow: 'hidden',
  },
  aiModeDropdownCollapsibleContent: {
    paddingTop: 8,
  },
  aiModeDropdownList: {
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
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
  albumDestinationEmoji: {
    fontSize: 20,
  },
  albumDestinationCover: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  albumDestinationEmpty: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
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
  primaryTutorialArrow: {
    position: 'absolute',
    top: -64,
    left: 0,
    right: 0,
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
  typoSuggestionInline: {
    marginTop: 4,
    marginBottom: 12,
    gap: 3,
  },
  typoSuggestionPrompt: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  typoSuggestionChoices: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 7,
    rowGap: 2,
  },
  typoSuggestionChoice: {
    minHeight: 34,
    justifyContent: 'center',
  },
  typoSuggestionChoicePressed: {
    opacity: 0.55,
  },
  typoSuggestionRecommendedText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  typoSuggestionChoiceText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  typoSuggestionSeparator: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.72,
  },
  typoSuggestionInlineInput: {
    minWidth: 86,
    maxWidth: 150,
    minHeight: 34,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 0,
    paddingVertical: 4,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  typoSuggestionUseInline: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  typoSuggestionUseInlineText: {
    fontSize: 12,
    fontWeight: '800',
  },
  previewStackWrap: {
    gap: 16,
  },
  previewStackItem: {
    width: '100%',
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
  ocrEditHint: {
    marginTop: 0,
    marginBottom: 10,
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
