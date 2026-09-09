import React from 'react';
import {
  Animated,
  Easing as RNEasing,
  type GestureResponderEvent,
  Image,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import Reanimated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  Layout,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type Card from '@database/models/Card';
import type { CloudPhonemeFeedback } from '@services/pronunciation/cloudCoach';
import {
  normalizeAIBreakdownMode,
  type UILanguage,
} from '@services/settings/userSettings';
import { parseCardContextSections } from '../../../features/cards/cardContextSections';
import {
  normalizeEnglishExampleDisplayOrder,
  type ExampleDisplayItem,
} from '../../../features/cards/cardExampleDisplay';
import {
  CARD_DETAIL_HORIZONTAL_INSET,
  resolveCardDetailSectionLayout,
  resolveExamplePreviewLayout,
  resolveFrontTextWrapGuard,
  shouldOfferExampleExpansion,
} from '../../../features/cards/cardDetailSectionLayout';
import {
  formatQuotedLearningTerm,
  quoteLearningTermInText,
} from '../../../features/cards/learningTermQuotes';
import {
  isPhraseLikeCardSubject,
  isSameCardUsage,
} from '../../../features/cards/cardUsage';
import { parseSemanticRelations } from '../../../features/cards/semanticRelations';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import TutorialSpotlight from '../shared/TutorialSpotlight';
import type { AppTourStep } from '../../../contexts/AppTourContext';
import { tUI } from '../../../i18n/uiLanguage';
import { formatPartOfSpeechLabel } from '../../../i18n/partOfSpeech';

type Props = {
  item: Card;
  index: number;
  currentIndex: number | null;
  scrollX: SharedValue<number>;
  itemImageUri: string | null;
  isPlaying: boolean;
  isRecording: boolean;
  isAnalyzing: boolean;
  hasRecorded: boolean;
  showFeedback: boolean;
  pronunciationScore: number | null;
  pronunciationFeedbackLines: string[];
  phonemeChips: CloudPhonemeFeedback[];
  waveformValues: Animated.Value[];
  onPlayCard: (text: string, isActiveCard: boolean, index: number) => void;
  onToggleRecord: (isActiveCard: boolean, index: number) => void;
  onPlayPreview: () => void;
  onReset: () => void;
  onOpenFullscreen: (index: number, origin?: { x: number; y: number }) => void;
  cardDetailFontScale: number;
  snapInterval: number;
  sidePeekShift: number;
  sanitizePronunciationText: (text: string | undefined | null) => string;
  formatCardDate: (input: Date | string | undefined | null) => string;
  styles: any;
  isFavorite: boolean;
  isBookmarked: boolean;
  onOpenAlbumSheet: () => void;
  onToggleFavorite: () => void;
  onOpenStickyNote: () => void;
  stickyNoteText?: string;
  onOpenPronunciationModal: () => void;
  uiLanguage: UILanguage;
  tourStep?: AppTourStep;
  onTourTargetPress?: () => void;
  isLightMode?: boolean;
  onContentExpandedChange?: (expanded: boolean) => void;
};

const CARD_ACTION_BUTTON_WIDTH = 52;
const CARD_ACTION_BUTTON_HORIZONTAL_OFFSETS = {
  mic: -8,
  share: -2,
  heart: 10,
  bookmark: 10,
} as const;
const FRONT_BODY_SCROLL_OVERFLOW_EPSILON = 8;
const FRONT_BODY_ACTION_ROW_CLEARANCE = 56;
const BACK_BODY_SCROLL_OVERFLOW_EPSILON = 8;
const BACK_BODY_FOOTER_CLEARANCE = 48;
const FRONT_SENTENCE_COLLAPSED_LINES = 3;
const FRONT_CONTEXT_COLLAPSED_LINES = 4;
const DETAIL_EXPAND_LAYOUT = Layout.duration(260).easing(
  Easing.bezier(0.2, 0, 0, 1)
);

type CollapsibleBackFieldProps = {
  children: React.ReactNode;
  collapsedHeight: number;
  fieldKey: string;
  resetKey: string;
  uiLanguage: UILanguage;
  color: string;
  onExpandedChange: (fieldKey: string, expanded: boolean) => void;
  onCollapse: () => void;
};

function CollapsibleBackField({
  children,
  collapsedHeight,
  fieldKey,
  resetKey,
  uiLanguage,
  color,
  onExpandedChange,
  onCollapse,
}: CollapsibleBackFieldProps) {
  const [contentHeight, setContentHeight] = React.useState(0);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const heightAnim = useSharedValue(collapsedHeight);
  const arrowProgress = React.useRef(new Animated.Value(0)).current;
  const hasMeasuredRef = React.useRef(false);
  const reduceMotion = useReducedMotion();
  const hasOverflow = contentHeight > collapsedHeight + 1;
  const bodyStyle = useAnimatedStyle(() => ({
    height: heightAnim.value,
    overflow: 'hidden',
  }));

  React.useEffect(() => {
    setContentHeight(0);
    setIsExpanded(false);
    hasMeasuredRef.current = false;
    heightAnim.value = collapsedHeight;
    arrowProgress.setValue(0);
    onExpandedChange(fieldKey, false);
  }, [
    arrowProgress,
    collapsedHeight,
    fieldKey,
    heightAnim,
    onExpandedChange,
    resetKey,
  ]);

  React.useEffect(() => {
    if (contentHeight <= 0) return;
    const targetHeight = hasOverflow
      ? isExpanded
        ? contentHeight
        : collapsedHeight
      : contentHeight;

    cancelAnimation(heightAnim);
    if (!hasMeasuredRef.current) {
      heightAnim.value = targetHeight;
      hasMeasuredRef.current = true;
      return;
    }
    heightAnim.value = withTiming(targetHeight, {
      duration: reduceMotion ? 0 : 240,
      easing: Easing.bezier(0.2, 0, 0, 1),
    });
  }, [
    collapsedHeight,
    contentHeight,
    hasOverflow,
    heightAnim,
    isExpanded,
    reduceMotion,
  ]);

  React.useEffect(() => {
    Animated.timing(arrowProgress, {
      toValue: isExpanded ? 1 : 0,
      duration: reduceMotion ? 0 : 240,
      useNativeDriver: true,
    }).start();
  }, [arrowProgress, isExpanded, reduceMotion]);

  return (
    <>
      <Reanimated.View
        style={contentHeight > 0 ? bodyStyle : undefined}
      >
        <View
          onLayout={(event) => {
            const nextHeight = event.nativeEvent.layout.height;
            if (nextHeight > 0) {
              setContentHeight((current) =>
                Math.abs(current - nextHeight) > 1 ? nextHeight : current
              );
            }
          }}
        >
          {children}
        </View>
      </Reanimated.View>
      {hasOverflow ? (
        <Pressable
          style={({ pressed }) => [
            localStyles.showFullSentenceRow,
            pressed ? localStyles.showFullSentenceRowPressed : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={tUI(
            uiLanguage,
            isExpanded
              ? 'cardDetail.hideFullContent'
              : 'cardDetail.showFullContent'
          )}
          onPress={(event) => {
            event.stopPropagation();
            setIsExpanded((current) => {
              const next = !current;
              if (!next) onCollapse();
              onExpandedChange(fieldKey, next);
              return next;
            });
          }}
        >
          <Text style={[localStyles.showFullSentenceText, { color }]}>
            {tUI(
              uiLanguage,
              isExpanded
                ? 'cardDetail.hideFullContent'
                : 'cardDetail.showFullContent'
            )}
          </Text>
          <Animated.View
            style={{
              transform: [
                {
                  rotate: arrowProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '180deg'],
                  }),
                },
              ],
            }}
          >
            <Ionicons name="chevron-down" size={14} color={color} />
          </Animated.View>
        </Pressable>
      ) : null}
    </>
  );
}

const DISPLAY_SECTION_LIMITS = {
  short_punchy: {
    definition: 100,
    context: 180,
  },
  context: {
    definition: 165,
    context: 360,
  },
  deep_dive: {
    definition: 205,
    context: 520,
  },
} as const;

function compactDisplayText(
  value: string | undefined | null,
  maxChars: number
): string {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;

  const clipped = text.slice(0, Math.max(0, maxChars - 1)).trimEnd();
  const sentenceBoundary = Math.max(
    clipped.lastIndexOf('.'),
    clipped.lastIndexOf('!'),
    clipped.lastIndexOf('?'),
    clipped.lastIndexOf('。'),
    clipped.lastIndexOf('！'),
    clipped.lastIndexOf('？')
  );
  if (sentenceBoundary >= Math.floor(maxChars * 0.55)) {
    return clipped.slice(0, sentenceBoundary + 1);
  }

  const wordBoundary = clipped.lastIndexOf(' ');
  if (wordBoundary >= Math.floor(maxChars * 0.65)) {
    return clipped.slice(0, wordBoundary).trimEnd();
  }
  return clipped;
}

function resolveCardPronunciationSubject(params: {
  targetWord?: string | null;
  targetPhrase?: string | null;
  sourceSentence?: string | null;
  sanitizePronunciationText: (text: string | undefined | null) => string;
}): string {
  const phrase = params.sanitizePronunciationText(params.targetPhrase);
  const word = params.sanitizePronunciationText(params.targetWord);
  if (phrase && phrase.toLowerCase() !== word.toLowerCase()) return phrase;
  if (word) return word;
  if (phrase) return phrase;
  return params.sanitizePronunciationText(params.sourceSentence);
}

type CollocationDisplayItem = {
  phrase: string;
  translation?: string;
};

const AI_MODE_ITEM_COUNTS = {
  short_punchy: {
    collocations: 1,
    examples: 1,
    synonyms: 1,
    antonyms: 1,
  },
  context: {
    collocations: 2,
    examples: 2,
    synonyms: 2,
    antonyms: 1,
  },
  deep_dive: {
    collocations: 3,
    examples: 3,
    synonyms: 3,
    antonyms: 2,
  },
} as const;

function splitCollocationText(value: string): CollocationDisplayItem {
  const [phraseRaw, ...translationParts] = value.split(/\s+[—–-]\s+/);
  const phrase = (phraseRaw || value).trim();
  const translation = translationParts.join(' — ').trim();
  return translation ? { phrase, translation } : { phrase };
}

function splitExampleText(value: string, limit: number): string[] {
  return (value || '')
    .split(/\n+/)
    .map((item) => item.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function splitExampleDisplayText(value: string): ExampleDisplayItem {
  const [sentenceRaw, ...translationParts] = value.split(/\s+[—–-]\s+/);
  const sentence = (sentenceRaw || value).trim();
  const translation = translationParts.join(' — ').trim();
  return translation ? { sentence, translation } : { sentence };
}

function CardDetailCarouselCardUI({
  item,
  index,
  currentIndex,
  scrollX,
  itemImageUri,
  isPlaying,
  isRecording,
  isAnalyzing,
  hasRecorded,
  showFeedback,
  pronunciationScore,
  pronunciationFeedbackLines,
  phonemeChips,
  waveformValues,
  onPlayCard,
  onToggleRecord,
  onPlayPreview,
  onReset,
  onOpenFullscreen,
  cardDetailFontScale,
  snapInterval,
  sidePeekShift,
  sanitizePronunciationText,
  formatCardDate,
  styles,
  isFavorite,
  isBookmarked,
  onOpenAlbumSheet,
  onToggleFavorite,
  onOpenStickyNote,
  stickyNoteText,
  onOpenPronunciationModal,
  uiLanguage,
  tourStep = 'IDLE',
  onTourTargetPress,
  isLightMode = false,
  onContentExpandedChange,
}: Props) {
  const frontCaptureRef = React.useRef<View | null>(null);
  const backCaptureRef = React.useRef<View | null>(null);
  const combinedShareRef = React.useRef<View | null>(null);
  const heroMediaRef = React.useRef<View | null>(null);
  const frontBodyScrollRef = React.useRef<ScrollView | null>(null);
  const backBodyScrollRef = React.useRef<ScrollView | null>(null);
  const [isSharePickerVisible, setIsSharePickerVisible] = React.useState(false);
  const [isFullSentenceExpanded, setIsFullSentenceExpanded] =
    React.useState(false);
  const [isContextExpanded, setIsContextExpanded] = React.useState(false);
  const [isExamplesExpanded, setIsExamplesExpanded] = React.useState(false);
  const [expandedBackFields, setExpandedBackFields] = React.useState<
    Record<string, boolean>
  >({});
  const [frontBodyViewportHeight, setFrontBodyViewportHeight] =
    React.useState(0);
  const [frontBodyContentHeight, setFrontBodyContentHeight] = React.useState(0);
  const [sourceLineCount, setSourceLineCount] = React.useState(0);
  const [translationLineCount, setTranslationLineCount] = React.useState(0);
  const [contextLineCount, setContextLineCount] = React.useState(0);
  const [sentenceMeasuredHeight, setSentenceMeasuredHeight] =
    React.useState(0);
  const [contextMeasuredHeight, setContextMeasuredHeight] = React.useState(0);
  const [examplesMeasuredHeight, setExamplesMeasuredHeight] =
    React.useState(0);
  const [backBodyViewportHeight, setBackBodyViewportHeight] = React.useState(0);
  const [backBodyContentHeight, setBackBodyContentHeight] = React.useState(0);
  const [shareSelection, setShareSelection] = React.useState<{
    front: boolean;
    back: boolean;
  }>({ front: true, back: false });
  const [sharePreviewUri, setSharePreviewUri] = React.useState<{
    front: string | null;
    back: string | null;
  }>({ front: null, back: null });
  const shareModalAnim = React.useRef(new Animated.Value(0)).current;
  const sentenceExpandProgress = React.useRef(new Animated.Value(0)).current;
  const contextExpandProgress = React.useRef(new Animated.Value(0)).current;
  const examplesExpandProgress = React.useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();
  const ui = React.useMemo(
    () =>
      isLightMode
        ? {
            paperBg: '#FFFFFF',
            paperBorder: 'rgba(0,0,0,0.06)',
            primaryText: '#111111',
            secondaryText: '#8A8E97',
            noteText: '#8A8E97',
            posBg: '#E7E9EF',
            posText: '#6B7280',
            divider: '#ECECF0',
            icon: '#1F2937',
            noteActionBg: '#F1F5F9',
            noteActionBorder: '#D5DEE8',
            folderIcon: '#1F2937',
            starActive: '#EF4444',
            starInactive: '#1F2937',
          }
        : {
            paperBg: '#1E293B',
            paperBorder: '#334155',
            primaryText: '#F8FAFC',
            secondaryText: '#94A3B8',
            noteText: '#94A3B8',
            posBg: '#334155',
            posText: '#F8FAFC',
            divider: '#334155',
            icon: '#94A3B8',
            noteActionBg: 'rgba(30,41,59,0.45)',
            noteActionBorder: '#334155',
            folderIcon: '#94A3B8',
            starActive: '#EF4444',
            starInactive: '#94A3B8',
          },
    [isLightMode]
  );
  const textBlockHorizontalInset = CARD_DETAIL_HORIZONTAL_INSET.left;
  const itemPronunciationText = resolveCardPronunciationSubject({
    targetWord: item.targetWord,
    targetPhrase: item.targetPhrase,
    sourceSentence: item.originalSentence,
    sanitizePronunciationText,
  });
  const itemWord =
    itemPronunciationText || item.targetWord || item.targetPhrase || '-';
  const isPhraseCard = isPhraseLikeCardSubject(itemWord, item.partOfSpeech);
  const itemCaption = formatPartOfSpeechLabel(
    isPhraseCard ? 'phrase' : item.partOfSpeech || item.sourceApp || '',
    uiLanguage
  );
  const itemDisplayDate = formatCardDate(item.createdAt);
  const isActiveCard = index === currentIndex;
  const rawDefinitionText = item.definition || '-';
  const hasHeroImage = Boolean(itemImageUri);
  const resolvedHeroImageUri = itemImageUri || undefined;
  const sourceSentence = React.useMemo(() => {
    const source = (item.originalSentence || '').trim();
    if (!source) return '-';
    const word = (itemWord || '').trim();
    if (!word) return source;

    const sentences = source
      .split(/(?<=[.!?。！？])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!sentences.length) return source;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reg = new RegExp(`\\b${escaped}\\b`, 'i');
    const matched = sentences.find((s) => reg.test(s));
    return matched || sentences[0] || source;
  }, [item.originalSentence, itemWord]);
  const contextSections = React.useMemo(
    () =>
      parseCardContextSections({
        raw: item.contextualExplanation,
        displayWord: itemWord,
        definition: item.definition,
        sourceSentence,
      }),
    [item.contextualExplanation, item.definition, itemWord, sourceSentence]
  );
  const sentenceTranslationRaw = contextSections.sentenceTranslation;
  const translationText = React.useMemo(() => {
    const raw = (sentenceTranslationRaw || '-').trim();
    if (!raw || raw === '-') return '-';
    if (contextSections.isStructured) {
      return raw
        .split('\n')
        .map((line) => quoteLearningTermInText(line, itemWord))
        .join('\n');
    }
    const quotedWord = formatQuotedLearningTerm(itemWord);
    const replaced = quoteLearningTermInText(raw, itemWord);
    const separator = /[\u3040-\u30ff\u3400-\u9fff]/u.test(itemWord)
      ? '：'
      : ': ';
    return replaced !== raw ? replaced : `${quotedWord}${separator}${raw}`;
  }, [contextSections.isStructured, sentenceTranslationRaw, itemWord]);
  const cardAIBreakdownMode = React.useMemo(() => {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const rawModeTag = tags.find(
      (tag) => typeof tag === 'string' && tag.startsWith('ai_mode:')
    );
    return normalizeAIBreakdownMode(rawModeTag?.replace('ai_mode:', ''));
  }, [item.tags]);
  const displayLimits = DISPLAY_SECTION_LIMITS[cardAIBreakdownMode];
  const itemCounts = AI_MODE_ITEM_COUNTS[cardAIBreakdownMode];
  const compactDefinitionText = React.useMemo(
    () =>
      compactDisplayText(rawDefinitionText, displayLimits.definition) || '-',
    [displayLimits.definition, rawDefinitionText]
  );
  const normalizedRawDefinitionText = (rawDefinitionText || '-').trim() || '-';
  const isDefinitionCompacted =
    compactDefinitionText !== normalizedRawDefinitionText;
  const sourceSentenceText = React.useMemo(
    () => (sourceSentence || '').trim() || '-',
    [sourceSentence]
  );
  const translationDisplayText = React.useMemo(
    () => (translationText || '').trim() || '-',
    [translationText]
  );
  const frontContentScale = React.useMemo(() => {
    const totalChars =
      (contextSections.isStructured ? 0 : sourceSentence?.length || 0) +
      (translationDisplayText?.length || 0) +
      (contextSections.culturalBackground?.length || 0);
    const imagePenalty = hasHeroImage ? 1.08 : 1;
    const weighted = totalChars * imagePenalty;
    if (weighted > 560) return 0.8;
    if (weighted > 460) return 0.86;
    if (weighted > 360) return 0.92;
    return 1;
  }, [
    contextSections.culturalBackground,
    contextSections.isStructured,
    hasHeroImage,
    sourceSentence,
    translationDisplayText,
  ]);
  const rawCulturalBackgroundText = React.useMemo(
    () => (contextSections.culturalBackground || '').trim(),
    [contextSections.culturalBackground]
  );
  const frontSentenceFontSize = Math.round(20 * frontContentScale);
  const frontSentenceLineHeight = Math.round(28 * frontContentScale);
  const frontTextWrapGuard = resolveFrontTextWrapGuard(frontSentenceFontSize);
  const frontSentenceFontWeight = '600' as const;
  const contextLineHeight = Math.round(25 * frontContentScale);
  const collapsedSentenceHeight =
    FRONT_SENTENCE_COLLAPSED_LINES * frontSentenceLineHeight;
  const collapsedContextHeight =
    FRONT_CONTEXT_COLLAPSED_LINES * contextLineHeight;
  const backHeightBasis = backBodyViewportHeight || 520;
  const collapsedBackSectionLayout =
    resolveCardDetailSectionLayout(backHeightBasis);
  const collocationsCollapsedLimit =
    collapsedBackSectionLayout.collocations;
  const semanticRelationsCollapsedLimit =
    collapsedBackSectionLayout.semanticRelations;
  const examplesCollapsedLimit = collapsedBackSectionLayout.examples;
  const personalNotesCollapsedLimit =
    collapsedBackSectionLayout.personalNotes;
  const sentenceBodyHeightAnim = useSharedValue(collapsedSentenceHeight);
  const contextBodyHeightAnim = useSharedValue(collapsedContextHeight);
  const examplesBodyHeightAnim = useSharedValue(
    resolveCardDetailSectionLayout(520).examples
  );
  const sentenceBodyStyle = useAnimatedStyle(() => ({
    height: sentenceBodyHeightAnim.value,
  }));
  const contextBodyStyle = useAnimatedStyle(() => ({
    height: contextBodyHeightAnim.value,
    overflow: 'hidden',
  }));
  const examplesBodyStyle = useAnimatedStyle(() => ({
    height: examplesBodyHeightAnim.value,
    overflow: 'hidden',
  }));
  const hasMeasuredExamplesRef = React.useRef(false);
  const handleBackFieldExpandedChange = React.useCallback(
    (fieldKey: string, expanded: boolean) => {
      setExpandedBackFields((current) => {
        if (Boolean(current[fieldKey]) === expanded) return current;
        return { ...current, [fieldKey]: expanded };
      });
    },
    []
  );
  const isAnyAuxBackFieldExpanded = React.useMemo(
    () => Object.values(expandedBackFields).some(Boolean),
    [expandedBackFields]
  );
  const fullSentenceDisplayText = React.useMemo(
    () =>
      contextSections.isStructured
        ? translationDisplayText
        : [sourceSentenceText, translationDisplayText]
            .filter(
              (value, valueIndex, values) =>
                value && value !== '-' && values.indexOf(value) === valueIndex
            )
            .join('\n\n'),
    [contextSections.isStructured, sourceSentenceText, translationDisplayText]
  );
  const isCulturalBackgroundCompacted =
    Boolean(rawCulturalBackgroundText) &&
    (contextMeasuredHeight > collapsedContextHeight + 1 ||
      contextLineCount > FRONT_CONTEXT_COLLAPSED_LINES ||
      rawCulturalBackgroundText.length > 190 ||
      rawCulturalBackgroundText.split(/\n+/).length >
        FRONT_CONTEXT_COLLAPSED_LINES);
  const shouldOfferFullSentence =
    sentenceMeasuredHeight > collapsedSentenceHeight + 1 ||
    sourceLineCount > FRONT_SENTENCE_COLLAPSED_LINES ||
    translationLineCount > FRONT_SENTENCE_COLLAPSED_LINES ||
    fullSentenceDisplayText.length > 140 ||
    fullSentenceDisplayText.split(/\n+/).length >
      FRONT_SENTENCE_COLLAPSED_LINES;
  const isFrontBodyScrollable =
    frontBodyViewportHeight > 0 &&
    frontBodyContentHeight - frontBodyViewportHeight >
      FRONT_BODY_SCROLL_OVERFLOW_EPSILON;
  const shouldOfferFullContent =
    shouldOfferFullSentence || isDefinitionCompacted;
  const sentenceToggleLabelKey = isFullSentenceExpanded
    ? shouldOfferFullSentence
      ? 'cardDetail.hideFullSentence'
      : 'cardDetail.hideFullContent'
    : shouldOfferFullSentence
      ? 'cardDetail.showFullSentence'
      : 'cardDetail.showFullContent';
  const expandArrowDownOpacity = sentenceExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const expandArrowUpOpacity = sentenceExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const expandArrowDownRotate = sentenceExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });
  const expandArrowUpRotate = sentenceExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-90deg', '0deg'],
  });
  const examplesArrowDownOpacity = examplesExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const examplesArrowUpOpacity = examplesExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const examplesArrowDownRotate = examplesExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });
  const examplesArrowUpRotate = examplesExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-90deg', '0deg'],
  });
  const contextArrowDownOpacity = contextExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const contextArrowUpOpacity = contextExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const contextArrowDownRotate = contextExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });
  const contextArrowUpRotate = contextExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-90deg', '0deg'],
  });

  React.useEffect(() => {
    Animated.timing(sentenceExpandProgress, {
      toValue: isFullSentenceExpanded ? 1 : 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [isFullSentenceExpanded, sentenceExpandProgress]);

  React.useEffect(() => {
    Animated.timing(examplesExpandProgress, {
      toValue: isExamplesExpanded ? 1 : 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [examplesExpandProgress, isExamplesExpanded]);

  React.useEffect(() => {
    Animated.timing(contextExpandProgress, {
      toValue: isContextExpanded ? 1 : 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [contextExpandProgress, isContextExpanded]);

  React.useEffect(() => {
    cancelAnimation(sentenceBodyHeightAnim);
    sentenceBodyHeightAnim.value = withTiming(
      isFullSentenceExpanded
        ? Math.max(collapsedSentenceHeight, sentenceMeasuredHeight)
        : collapsedSentenceHeight,
      {
        duration: reduceMotion ? 0 : 240,
        easing: Easing.bezier(0.2, 0, 0, 1),
      }
    );
  }, [
    collapsedSentenceHeight,
    isFullSentenceExpanded,
    reduceMotion,
    sentenceBodyHeightAnim,
    sentenceMeasuredHeight,
  ]);

  React.useEffect(() => {
    cancelAnimation(contextBodyHeightAnim);
    contextBodyHeightAnim.value = withTiming(
      isContextExpanded
        ? Math.max(collapsedContextHeight, contextMeasuredHeight)
        : collapsedContextHeight,
      {
        duration: reduceMotion ? 0 : 240,
        easing: Easing.bezier(0.2, 0, 0, 1),
      }
    );
  }, [
    collapsedContextHeight,
    contextBodyHeightAnim,
    contextMeasuredHeight,
    isContextExpanded,
    reduceMotion,
  ]);

  React.useEffect(() => {
    const targetHeight = resolveExamplePreviewLayout(
      examplesCollapsedLimit,
      examplesMeasuredHeight,
      isExamplesExpanded
    ).height;

    cancelAnimation(examplesBodyHeightAnim);
    if (!hasMeasuredExamplesRef.current) {
      examplesBodyHeightAnim.value = targetHeight;
      if (examplesMeasuredHeight > 0) {
        hasMeasuredExamplesRef.current = true;
      }
      return;
    }

    examplesBodyHeightAnim.value = withTiming(targetHeight, {
      duration: reduceMotion ? 0 : 240,
      easing: Easing.bezier(0.2, 0, 0, 1),
    });
  }, [
    examplesBodyHeightAnim,
    examplesCollapsedLimit,
    examplesMeasuredHeight,
    isExamplesExpanded,
    reduceMotion,
  ]);

  React.useEffect(() => {
    onContentExpandedChange?.(
      isFullSentenceExpanded ||
        isContextExpanded ||
        isExamplesExpanded ||
        isAnyAuxBackFieldExpanded
    );
  }, [
    isAnyAuxBackFieldExpanded,
    isContextExpanded,
    isExamplesExpanded,
    isFullSentenceExpanded,
    onContentExpandedChange,
  ]);

  React.useLayoutEffect(() => {
    setSourceLineCount(0);
    setTranslationLineCount(0);
    setContextLineCount(0);
    setSentenceMeasuredHeight(0);
    setContextMeasuredHeight(0);
  }, [
    frontContentScale,
    fullSentenceDisplayText,
    rawCulturalBackgroundText,
  ]);

  const resetFrontBodyScroll = React.useCallback((animated = false) => {
    frontBodyScrollRef.current?.scrollTo({ y: 0, animated });
  }, []);
  const resetBackBodyScroll = React.useCallback(() => {
    requestAnimationFrame(() => {
      backBodyScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  }, []);

  React.useEffect(() => {
    setIsFullSentenceExpanded(false);
    setIsContextExpanded(false);
    setIsExamplesExpanded(false);
    setExpandedBackFields({});
    setFrontBodyViewportHeight(0);
    setFrontBodyContentHeight(0);
    setBackBodyViewportHeight(0);
    setBackBodyContentHeight(0);
    setExamplesMeasuredHeight(0);
    examplesBodyHeightAnim.value = resolveCardDetailSectionLayout(520).examples;
    sentenceExpandProgress.setValue(0);
    contextExpandProgress.setValue(0);
    examplesExpandProgress.setValue(0);
    resetFrontBodyScroll(false);
  }, [
    contextExpandProgress,
    examplesBodyHeightAnim,
    examplesExpandProgress,
    item.id,
    resetFrontBodyScroll,
    sentenceExpandProgress,
  ]);
  const handleFrontBodyLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      setFrontBodyViewportHeight((current) =>
        Math.abs(current - nextHeight) > 1 ? nextHeight : current
      );
    },
    []
  );
  const handleFrontBodyContentSizeChange = React.useCallback(
    (_width: number, height: number) => {
      setFrontBodyContentHeight((current) =>
        Math.abs(current - height) > 1 ? height : current
      );
    },
    []
  );
  const handleSourceTextLayout = React.useCallback((event: any) => {
    const nextCount = Array.isArray(event?.nativeEvent?.lines)
      ? event.nativeEvent.lines.length
      : 0;
    setSourceLineCount(nextCount);
  }, []);
  const handleTranslationTextLayout = React.useCallback((event: any) => {
    const nextCount = Array.isArray(event?.nativeEvent?.lines)
      ? event.nativeEvent.lines.length
      : 0;
    setTranslationLineCount(nextCount);
  }, []);
  const handleContextTextLayout = React.useCallback((event: any) => {
    const nextCount = Array.isArray(event?.nativeEvent?.lines)
      ? event.nativeEvent.lines.length
      : 0;
    setContextLineCount((current) =>
      nextCount > current ? nextCount : current
    );
  }, []);
  const handleSentenceMeasurementLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      if (nextHeight > 0) setSentenceMeasuredHeight(nextHeight);
    },
    []
  );
  const handleContextMeasurementLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      if (nextHeight > 0) setContextMeasuredHeight(nextHeight);
    },
    []
  );
  const handleFullExamplesLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      if (nextHeight > 0) {
        setExamplesMeasuredHeight((current) =>
          Math.abs(current - nextHeight) > 1 ? nextHeight : current
        );
      }
    },
    []
  );
  const handleBackBodyLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setBackBodyViewportHeight((current) =>
      Math.abs(current - nextHeight) > 1 ? nextHeight : current
    );
  }, []);
  const handleBackBodyContentSizeChange = React.useCallback(
    (_width: number, height: number) => {
      setBackBodyContentHeight((current) =>
        Math.abs(current - height) > 1 ? height : current
      );
    },
    []
  );
  const collocationItems = React.useMemo<CollocationDisplayItem[]>(() => {
    return (item.frequentCollocations || '')
      .split(/[\n;]+/)
      .map((phrase) => phrase.trim())
      .filter(Boolean)
      .map(splitCollocationText)
      .filter((entry) => !isSameCardUsage(entry.phrase, itemWord))
      .slice(0, itemCounts.collocations);
  }, [
    item.frequentCollocations,
    itemCounts.collocations,
    itemWord,
  ]);
  const semanticRelations = React.useMemo(() => {
    const parsed = parseSemanticRelations(item.semanticRelations);
    return {
      synonyms: parsed.synonyms.slice(0, itemCounts.synonyms),
      antonyms: parsed.antonyms.slice(0, itemCounts.antonyms),
    };
  }, [item.semanticRelations, itemCounts.antonyms, itemCounts.synonyms]);
  const semanticRelationItems = React.useMemo(
    () => [
      ...semanticRelations.synonyms.map((relation) => ({
        ...relation,
        kind: 'synonym' as const,
      })),
      ...semanticRelations.antonyms.map((relation) => ({
        ...relation,
        kind: 'antonym' as const,
      })),
    ],
    [semanticRelations.antonyms, semanticRelations.synonyms]
  );
  const definitionText = isFullSentenceExpanded
    ? normalizedRawDefinitionText
    : compactDefinitionText;
  const hasStickyNote = Boolean((stickyNoteText || '').trim());
  const apiExampleSentences = React.useMemo<ExampleDisplayItem[]>(() => {
    const examples = contextSections.exampleSentence
      ? splitExampleText(contextSections.exampleSentence, itemCounts.examples)
          .filter(Boolean)
          .map(splitExampleDisplayText)
      : [];
    return examples.map(normalizeEnglishExampleDisplayOrder);
  }, [contextSections.exampleSentence, itemCounts.examples]);
  const shouldOfferFullExamples = shouldOfferExampleExpansion(
    apiExampleSentences.length,
    examplesMeasuredHeight,
    examplesCollapsedLimit
  );
  const culturalBackgroundText = rawCulturalBackgroundText;
  const isBackBodyScrollable =
    backBodyViewportHeight > 0 &&
    backBodyContentHeight - backBodyViewportHeight >
      BACK_BODY_SCROLL_OVERFLOW_EPSILON;
  const backTextScale = React.useMemo(() => {
    const totalChars =
      (collocationItems
        .map((item) => `${item.phrase} ${item.translation || ''}`)
        .join(' ').length || 0) +
      (semanticRelationItems
        .map((item) => `${item.term} ${item.translation || ''}`)
        .join(' ').length || 0) +
      (apiExampleSentences
        .map((item) => `${item.sentence} ${item.translation || ''}`)
        .join(' ').length || 0) +
      (stickyNoteText?.length || 0);
    if (totalChars > 760) return 0.82;
    if (totalChars > 620) return 0.88;
    if (totalChars > 500) return 0.94;
    return 1;
  }, [
    apiExampleSentences,
    collocationItems,
    semanticRelationItems,
    stickyNoteText,
  ]);
  const backTextFontSize = Math.round(20 * backTextScale);
  const backTextLineHeight = Math.round(28 * backTextScale);
  const weightedWordLength = Array.from(itemWord.trim()).reduce((total, ch) => {
    const isCjk = /[\u4E00-\u9FFF]/.test(ch);
    return total + (isCjk ? 1.7 : 1);
  }, 0);
  const referenceWordFontSize =
    (weightedWordLength > 18
      ? 30
      : weightedWordLength > 15
        ? 34
        : weightedWordLength > 12
          ? 40
      : 52) * cardDetailFontScale;
  const referenceWordLineHeight = Math.round(referenceWordFontSize * 1.08);
  const renderExampleRows = () => (
    <View>
      {apiExampleSentences.map((example, exampleIndex) => (
        <View
          key={`${example.sentence}-${example.translation || ''}-${exampleIndex}`}
          style={styles.referenceRowTop}
        >
          <View style={localStyles.exampleTextBlock}>
            <Text
              style={[
                styles.referenceExample,
                localStyles.exampleSentenceText,
                {
                  color: ui.primaryText,
                  fontSize: backTextFontSize,
                  lineHeight: backTextLineHeight,
                  fontWeight: '600',
                },
              ]}
            >
              {example.sentence}
            </Text>
            {example.translation ? (
              <Text
                style={[
                  localStyles.exampleTranslationText,
                  {
                    color: ui.secondaryText,
                    fontSize: Math.max(12, backTextFontSize - 4),
                    lineHeight: Math.max(16, backTextLineHeight - 4),
                  },
                ]}
              >
                {example.translation}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );

  // Carousel 外部動畫
  const animatedCardStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * snapInterval,
      index * snapInterval,
      (index + 1) * snapInterval,
    ];
    const scale = interpolate(
      scrollX.value,
      inputRange,
      [0.9, 1, 0.9],
      Extrapolation.CLAMP
    );
    const translateY = interpolate(
      scrollX.value,
      inputRange,
      [30, 0, 30],
      Extrapolation.CLAMP
    );
    const translateX = interpolate(
      scrollX.value,
      inputRange,
      [-sidePeekShift, 0, sidePeekShift],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.72, 1, 0.72],
      Extrapolation.CLAMP
    );
    const zIndex = Math.round(
      interpolate(scrollX.value, inputRange, [0, 100, 0], Extrapolation.CLAMP)
    );

    return {
      opacity,
      zIndex,
      elevation: zIndex,
      transform: [{ scale }, { translateX }, { translateY }],
    };
  }, [index, scrollX, sidePeekShift, snapInterval]);

  // Flip 內部動畫
  const flipAnim = useSharedValue(0);
  const tourFlipTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  React.useEffect(
    () => () => {
      if (tourFlipTimerRef.current) {
        clearTimeout(tourFlipTimerRef.current);
      }
    },
    []
  );

  const toggleFlip = () => {
    if (!isActiveCard) return;
    flipAnim.value = withTiming(flipAnim.value === 0 ? 1 : 0, {
      duration: 400,
      reduceMotion: ReduceMotion.System,
    });
  };
  const hasExpandedContent =
    isFullSentenceExpanded || isContextExpanded || isExamplesExpanded;
  const handleTourFlipPress = () => {
    toggleFlip();
    if (tourFlipTimerRef.current) {
      clearTimeout(tourFlipTimerRef.current);
    }
    tourFlipTimerRef.current = setTimeout(
      () => {
        toggleFlip();
        onTourTargetPress?.();
        tourFlipTimerRef.current = null;
      },
      reduceMotion ? 80 : 760
    );
  };
  const handleOpenHeroFullscreen = React.useCallback(
    (event: GestureResponderEvent) => {
      const fallbackOrigin = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      };

      if (!heroMediaRef.current) {
        onOpenFullscreen(index, fallbackOrigin);
        return;
      }

      heroMediaRef.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          onOpenFullscreen(index, {
            x: x + width / 2,
            y: y + height / 2,
          });
          return;
        }
        onOpenFullscreen(index, fallbackOrigin);
      });
    },
    [index, onOpenFullscreen]
  );
  const captureAndShareFace = React.useCallback(
    async (face: 'front' | 'back') => {
      const ref =
        face === 'front' ? frontCaptureRef.current : backCaptureRef.current;
      if (!ref) return;
      const uri = await captureRef(ref, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Share.share({
        url: uri,
      });
    },
    []
  );
  const captureFacePreview = React.useCallback(
    async (face: 'front' | 'back') => {
      const ref =
        face === 'front' ? frontCaptureRef.current : backCaptureRef.current;
      if (!ref) return null;
      try {
        const uri = await captureRef(ref, {
          format: 'png',
          quality: 0.9,
          result: 'tmpfile',
        });
        return uri;
      } catch {
        return null;
      }
    },
    []
  );
  const openSharePicker = React.useCallback(async () => {
    if (!isActiveCard) return;
    setIsSharePickerVisible(true);
    const [front, back] = await Promise.all([
      captureFacePreview('front'),
      captureFacePreview('back'),
    ]);
    setSharePreviewUri({ front, back });
  }, [captureFacePreview, isActiveCard]);
  React.useEffect(() => {
    if (!isSharePickerVisible) return;
    shareModalAnim.setValue(0);
    Animated.spring(shareModalAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 240,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [isSharePickerVisible, shareModalAnim]);
  const toggleShareSelection = React.useCallback((key: 'front' | 'back') => {
    setShareSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const submitShareSelection = React.useCallback(async () => {
    const selectedCount =
      Number(shareSelection.front) + Number(shareSelection.back);
    if (!selectedCount) return;
    setIsSharePickerVisible(false);
    if (
      shareSelection.front &&
      shareSelection.back &&
      combinedShareRef.current
    ) {
      const uri = await captureRef(combinedShareRef.current, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Share.share({
        url: uri,
      });
      return;
    }
    if (shareSelection.front) {
      await captureAndShareFace('front');
      return;
    }
    if (shareSelection.back) {
      await captureAndShareFace('back');
    }
  }, [
    captureAndShareFace,
    shareSelection.back,
    shareSelection.front,
  ]);
  const handleSharePress = React.useCallback(() => {
    void openSharePicker();
  }, [openSharePicker]);
  const handleTourPronunciationPress = React.useCallback(() => {
    onOpenPronunciationModal();
    onTourTargetPress?.();
  }, [onOpenPronunciationModal, onTourTargetPress]);

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 1], [0, 180]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden',
      // 當翻轉進度小於一半時，正面擁有較高層級以接收點擊
      zIndex: flipAnim.value < 0.5 ? 1 : 0,
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 1], [-180, 0]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      // 當翻轉進度大於一半時，背面擁有較高層級以接收點擊
      zIndex: flipAnim.value >= 0.5 ? 1 : 0,
    };
  });

  return (
    <Reanimated.View style={[styles.carouselCardContainer, animatedCardStyle]}>
      <TutorialSpotlight
        active={tourStep === 'STEP_8_FLICK_CARD' && isActiveCard}
        onSpotlightPress={handleTourFlipPress}
      >
        <Pressable
          style={styles.detailCardShell}
          onPress={hasExpandedContent ? undefined : toggleFlip}
          disabled={hasExpandedContent}
          accessible={false}
        >
          <View
            style={[
              styles.detailCardScroll,
              styles.detailCardScrollContent,
              { flex: 1 },
            ]}
          >
            <View style={{ flex: 1, width: '100%', position: 'relative' }}>
              {/* ========== 卡片正面 (FRONT FACE) ========== */}
              {/* 內容：圖片、單字、詞性、翻譯、中文解釋句 */}
              <Reanimated.View
                ref={frontCaptureRef}
                collapsable={false}
                style={[
                  styles.detailPaper,
                  { backgroundColor: ui.paperBg, borderColor: ui.paperBorder },
                  frontAnimatedStyle,
                  { flex: 1 },
                ]}
              >
                {hasHeroImage ? (
                  <View
                    ref={heroMediaRef}
                    collapsable={false}
                    style={styles.heroMediaWrap}
                  >
                    <Pressable
                      onPress={handleOpenHeroFullscreen}
                      accessibilityRole="button"
                    >
                      <Image
                        source={{ uri: resolvedHeroImageUri }}
                        style={styles.heroMedia}
                        resizeMode="cover"
                      />
                    </Pressable>
                  </View>
                ) : null}

                <View
                  style={[
                    styles.referenceWordCard,
                    { backgroundColor: ui.paperBg },
                    {
                      marginHorizontal: -18 + textBlockHorizontalInset,
                      paddingHorizontal: textBlockHorizontalInset,
                      flex: 1,
                      paddingBottom: 0,
                    },
                  ]}
                >
                  {/* 1. 單字本體 */}
                  <View
                    style={[styles.referenceRowTop, { position: 'relative' }]}
                  >
                    <View
                      style={[
                        styles.referenceWordLeft,
                        { minWidth: 0, flexShrink: 1 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.referenceWord,
                          {
                            color: ui.primaryText,
                            fontSize: referenceWordFontSize,
                            lineHeight: referenceWordLineHeight,
                          },
                        ]}
                      >
                        {itemWord}
                      </Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [
                        styles.referencePlayBtn,
                        {
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          width: 28,
                          height: 28,
                          borderRadius: 0,
                          backgroundColor: 'transparent',
                        },
                        pressed ? localStyles.actionIconBtnPressed : null,
                      ]}
                      onPress={() =>
                        onPlayCard(itemPronunciationText, isActiveCard, index)
                      }
                    >
                      <Ionicons
                        name={
                          isActiveCard && isPlaying
                            ? 'volume-high'
                            : 'volume-medium-outline'
                        }
                        size={28}
                        color={ui.icon}
                      />
                    </Pressable>
                  </View>

                  <ScrollView
                    ref={frontBodyScrollRef}
                    style={localStyles.frontBodyScroll}
                    contentContainerStyle={localStyles.frontBodyContent}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                    directionalLockEnabled
                    scrollEnabled
                    bounces={isFullSentenceExpanded || isFrontBodyScrollable}
                    alwaysBounceVertical={
                      isFullSentenceExpanded || isFrontBodyScrollable
                    }
                    scrollIndicatorInsets={{
                      bottom: FRONT_BODY_ACTION_ROW_CLEARANCE,
                    }}
                    onLayout={handleFrontBodyLayout}
                    onContentSizeChange={handleFrontBodyContentSizeChange}
                  >
                    <View style={styles.referenceMeaningRow}>
                      <View
                        style={[
                          styles.referencePosBadge,
                          { backgroundColor: ui.posBg },
                        ]}
                      >
                        <Text
                          style={[
                            styles.referencePosText,
                            { color: ui.posText },
                          ]}
                        >
                          {itemCaption}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.referenceMeaning,
                          {
                            color: ui.primaryText,
                            fontSize: Math.round(20 * frontContentScale),
                            lineHeight: Math.round(28 * frontContentScale),
                            paddingRight: frontTextWrapGuard,
                          },
                        ]}
                      >
                        {definitionText}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.referenceDivider,
                        { backgroundColor: ui.divider },
                      ]}
                    />

                    <Reanimated.View style={localStyles.dualSentenceBlock}>
                      {sentenceMeasuredHeight === 0 ? (
                        <View
                          accessible={false}
                          aria-hidden
                          accessibilityElementsHidden
                          importantForAccessibility="no-hide-descendants"
                          style={localStyles.textMeasurementPass}
                          onLayout={handleSentenceMeasurementLayout}
                        >
                          <Text
                            accessible={false}
                            aria-hidden
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                            style={[
                              localStyles.dualSentenceText,
                              {
                                color: 'transparent',
                                fontSize: frontSentenceFontSize,
                                lineHeight: frontSentenceLineHeight,
                                paddingRight: frontTextWrapGuard,
                              },
                            ]}
                          >
                            {fullSentenceDisplayText}
                          </Text>
                        </View>
                      ) : null}
                      <Reanimated.View
                        style={
                          shouldOfferFullSentence ? sentenceBodyStyle : undefined
                        }
                      >
                        {!contextSections.isStructured ? (
                          <Text
                            style={[
                              localStyles.dualSentenceText,
                              {
                                color: ui.primaryText,
                                fontSize: frontSentenceFontSize,
                                lineHeight: frontSentenceLineHeight,
                                paddingRight: frontTextWrapGuard,
                              },
                            ]}
                            numberOfLines={
                              shouldOfferFullSentence &&
                              !isFullSentenceExpanded
                                ? FRONT_SENTENCE_COLLAPSED_LINES
                                : undefined
                            }
                            onTextLayout={handleSourceTextLayout}
                          >
                            {sourceSentenceText}
                          </Text>
                        ) : null}
                        <Text
                          style={[
                            localStyles.dualSentenceText,
                            {
                              color: ui.primaryText,
                              marginTop: contextSections.isStructured ? 0 : 12,
                              fontSize: frontSentenceFontSize,
                              lineHeight: frontSentenceLineHeight,
                              paddingRight: frontTextWrapGuard,
                            },
                          ]}
                          numberOfLines={
                            shouldOfferFullSentence &&
                            !isFullSentenceExpanded
                              ? FRONT_SENTENCE_COLLAPSED_LINES
                              : undefined
                          }
                          onTextLayout={handleTranslationTextLayout}
                        >
                          {translationDisplayText}
                        </Text>
                      </Reanimated.View>
                      {shouldOfferFullContent ? (
                        <Pressable
                          style={({ pressed }) => [
                            localStyles.showFullSentenceRow,
                            pressed
                              ? localStyles.showFullSentenceRowPressed
                              : null,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={tUI(
                            uiLanguage,
                            sentenceToggleLabelKey
                          )}
                          onPress={(event) => {
                            event.stopPropagation();
                            setIsFullSentenceExpanded((current) => {
                              if (current) {
                                resetFrontBodyScroll(false);
                              }
                              return !current;
                            });
                          }}
                        >
                          <Text
                            style={[
                              localStyles.showFullSentenceText,
                              { color: ui.secondaryText },
                            ]}
                          >
                            {tUI(uiLanguage, sentenceToggleLabelKey)}
                          </Text>
                          <View style={localStyles.expandArrowSlot}>
                            <Animated.View
                              style={[
                                localStyles.expandArrowLayer,
                                {
                                  opacity: expandArrowDownOpacity,
                                  transform: [
                                    { rotate: expandArrowDownRotate },
                                  ],
                                },
                              ]}
                            >
                              <Ionicons
                                name="chevron-down"
                                size={14}
                                color={ui.secondaryText}
                              />
                            </Animated.View>
                            <Animated.View
                              style={[
                                localStyles.expandArrowLayer,
                                {
                                  opacity: expandArrowUpOpacity,
                                  transform: [{ rotate: expandArrowUpRotate }],
                                },
                              ]}
                            >
                              <Ionicons
                                name="chevron-up"
                                size={14}
                                color={ui.secondaryText}
                              />
                            </Animated.View>
                          </View>
                        </Pressable>
                      ) : null}
                    </Reanimated.View>

                    <View
                      style={[
                        styles.referenceDivider,
                        {
                          backgroundColor: ui.divider,
                          marginTop: 10,
                          marginBottom: 8,
                        },
                      ]}
                    />

                    <Reanimated.View
                      style={[
                        styles.referenceSubSection,
                        localStyles.frontContextSection,
                        { marginTop: 0 },
                      ]}
                    >
                      <Text
                        style={[
                          localStyles.sectionLabel,
                          { color: ui.secondaryText },
                        ]}
                      >
                        {tUI(uiLanguage, 'cardDetail.context')}
                      </Text>
                      {contextMeasuredHeight === 0 ? (
                        <View
                          accessible={false}
                          aria-hidden
                          accessibilityElementsHidden
                          importantForAccessibility="no-hide-descendants"
                          style={localStyles.textMeasurementPass}
                          onLayout={handleContextMeasurementLayout}
                        >
                          <Text
                            accessible={false}
                            aria-hidden
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                            style={[
                              styles.referenceSubText,
                              {
                                color: 'transparent',
                                fontSize: Math.round(18 * frontContentScale),
                                lineHeight: contextLineHeight,
                                paddingRight: frontTextWrapGuard,
                              },
                            ]}
                          >
                            {culturalBackgroundText ||
                              tUI(uiLanguage, 'cardDetail.noContext')}
                          </Text>
                        </View>
                      ) : null}
                      <Reanimated.View
                        style={
                          isCulturalBackgroundCompacted
                            ? contextBodyStyle
                            : undefined
                        }
                      >
                        <Text
                          style={[
                            styles.referenceSubText,
                            {
                              color: ui.noteText,
                              fontSize: Math.round(18 * frontContentScale),
                              lineHeight: contextLineHeight,
                              paddingRight: frontTextWrapGuard,
                            },
                          ]}
                          onTextLayout={handleContextTextLayout}
                        >
                          {culturalBackgroundText ||
                            tUI(uiLanguage, 'cardDetail.noContext')}
                        </Text>
                      </Reanimated.View>
                      {isCulturalBackgroundCompacted ? (
                        <Pressable
                          style={({ pressed }) => [
                            localStyles.showFullSentenceRow,
                            pressed
                              ? localStyles.showFullSentenceRowPressed
                              : null,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={tUI(
                            uiLanguage,
                            isContextExpanded
                              ? 'cardDetail.hideFullContent'
                              : 'cardDetail.showFullContent'
                          )}
                          onPress={(event) => {
                            event.stopPropagation();
                            setIsContextExpanded((current) => {
                              if (current) {
                                resetFrontBodyScroll(false);
                              }
                              return !current;
                            });
                          }}
                        >
                          <Text
                            style={[
                              localStyles.showFullSentenceText,
                              { color: ui.secondaryText },
                            ]}
                          >
                            {tUI(
                              uiLanguage,
                              isContextExpanded
                                ? 'cardDetail.hideFullContent'
                                : 'cardDetail.showFullContent'
                            )}
                          </Text>
                          <View style={localStyles.expandArrowSlot}>
                            <Animated.View
                              style={[
                                localStyles.expandArrowLayer,
                                {
                                  opacity: contextArrowDownOpacity,
                                  transform: [
                                    { rotate: contextArrowDownRotate },
                                  ],
                                },
                              ]}
                            >
                              <Ionicons
                                name="chevron-down"
                                size={14}
                                color={ui.secondaryText}
                              />
                            </Animated.View>
                            <Animated.View
                              style={[
                                localStyles.expandArrowLayer,
                                {
                                  opacity: contextArrowUpOpacity,
                                  transform: [{ rotate: contextArrowUpRotate }],
                                },
                              ]}
                            >
                              <Ionicons
                                name="chevron-up"
                                size={14}
                                color={ui.secondaryText}
                              />
                            </Animated.View>
                          </View>
                        </Pressable>
                      ) : null}
                    </Reanimated.View>
                  </ScrollView>

                  {/* ----- 第一頁底部操作列 ----- */}
                  <View
                    pointerEvents="box-none"
                    style={localStyles.cardActionRow}
                  >
                    <TutorialSpotlight
                      active={
                        tourStep === 'STEP_9_COACH_SAMPLE' && isActiveCard
                      }
                      style={[
                        localStyles.actionIconSlot,
                        localStyles.micActionIconSlot,
                      ]}
                      onSpotlightPress={handleTourPronunciationPress}
                    >
                      <Pressable
                        style={({ pressed }) => [
                          localStyles.actionIconBtn,
                          pressed ? localStyles.actionIconBtnPressed : null,
                        ]}
                        onPress={onOpenPronunciationModal}
                      >
                        <Ionicons
                          name="mic-outline"
                          size={28}
                          color={ui.icon}
                        />
                      </Pressable>
                    </TutorialSpotlight>

                    <View
                      style={[
                        localStyles.actionIconSlot,
                        localStyles.shareActionIconSlot,
                      ]}
                    >
                      <Pressable
                        style={({ pressed }) => [
                          localStyles.actionIconBtn,
                          pressed ? localStyles.actionIconBtnPressed : null,
                        ]}
                        onPress={handleSharePress}
                      >
                        <Ionicons
                          name="share-outline"
                          size={28}
                          color={ui.icon}
                        />
                      </Pressable>
                    </View>

                    <View
                      style={[
                        localStyles.actionIconSlot,
                        localStyles.heartActionIconSlot,
                      ]}
                    >
                      <Pressable
                        style={localStyles.actionIconBtn}
                        onPress={onToggleFavorite}
                      >
                        <Ionicons
                          name={isFavorite ? 'heart' : 'heart-outline'}
                          size={28}
                          color={isFavorite ? ui.starActive : ui.starInactive}
                        />
                      </Pressable>
                    </View>

                    <View
                      style={[
                        localStyles.actionIconSlot,
                        localStyles.bookmarkActionIconSlot,
                      ]}
                    >
                      <Pressable
                        style={({ pressed }) => [
                          localStyles.actionIconBtn,
                          pressed
                            ? localStyles.rigidActionIconBtnPressed
                            : null,
                        ]}
                        onPress={onOpenAlbumSheet}
                      >
                        <Ionicons
                          name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                          size={28}
                          color={isBookmarked ? '#4EAFF4' : ui.folderIcon}
                        />
                      </Pressable>
                    </View>
                  </View>
                  {/* ----------------------------- */}
                </View>
              </Reanimated.View>

              {/* ========== 卡片背面 (BACK FACE) ========== */}
              {/* 內容：Collocation、AI造句、Pronunciation coach、底部資訊 */}
              <Reanimated.View
                ref={backCaptureRef}
                collapsable={false}
                style={[
                  styles.detailPaper,
                  { backgroundColor: ui.paperBg, borderColor: ui.paperBorder },
                  backAnimatedStyle,
                ]}
              >
                <View
                  style={[
                    styles.referenceWordCard,
                    {
                      backgroundColor: ui.paperBg,
                      marginHorizontal: -18 + textBlockHorizontalInset,
                      paddingLeft: CARD_DETAIL_HORIZONTAL_INSET.left,
                      paddingRight: CARD_DETAIL_HORIZONTAL_INSET.right,
                      flex: 1,
                      paddingTop: 0,
                      paddingBottom: 32,
                    },
                  ]}
                >
                  <View style={localStyles.backTextSection}>
                    <ScrollView
                      ref={backBodyScrollRef}
                      style={localStyles.backBodyScroll}
                      contentContainerStyle={localStyles.backBodyContent}
                      showsVerticalScrollIndicator
                      nestedScrollEnabled
                      directionalLockEnabled
                      bounces={
                        isExamplesExpanded ||
                        isAnyAuxBackFieldExpanded ||
                        isBackBodyScrollable
                      }
                      alwaysBounceVertical={
                        isExamplesExpanded ||
                        isAnyAuxBackFieldExpanded ||
                        isBackBodyScrollable
                      }
                      scrollIndicatorInsets={{
                        bottom: BACK_BODY_FOOTER_CLEARANCE,
                      }}
                      onLayout={handleBackBodyLayout}
                      onContentSizeChange={handleBackBodyContentSizeChange}
                    >
                      {collocationItems.length > 0 ? (
                        <View style={styles.referenceCollocationSection}>
                          <Text
                            style={[
                              localStyles.sectionLabel,
                              { color: ui.secondaryText },
                            ]}
                          >
                            {tUI(
                              uiLanguage,
                              isPhraseCard
                                ? 'cardDetail.commonUsage'
                                : 'cardDetail.collocation'
                              )}
                          </Text>
                          <CollapsibleBackField
                            fieldKey="collocations"
                            resetKey={`${item.id}-collocations`}
                            collapsedHeight={collocationsCollapsedLimit}
                            uiLanguage={uiLanguage}
                            color={ui.secondaryText}
                            onExpandedChange={handleBackFieldExpandedChange}
                            onCollapse={resetBackBodyScroll}
                          >
                            {collocationItems.map((collocation) => (
                              <View
                                key={`${collocation.phrase}-${collocation.translation || ''}`}
                                style={localStyles.collocationLineBlock}
                              >
                                <Text
                                  style={[
                                    styles.referenceCollocationItem,
                                    {
                                      color: ui.primaryText,
                                      fontSize: backTextFontSize,
                                      lineHeight: backTextLineHeight,
                                    },
                                  ]}
                                >
                                  {`• ${collocation.phrase}`}
                                </Text>
                                {collocation.translation ? (
                                  <Text
                                    style={[
                                      localStyles.collocationTranslationText,
                                      {
                                        color: ui.secondaryText,
                                        fontSize: Math.max(
                                          12,
                                          backTextFontSize - 4
                                        ),
                                        lineHeight: Math.max(
                                          16,
                                          backTextLineHeight - 4
                                        ),
                                      },
                                    ]}
                                  >
                                    {collocation.translation}
                                  </Text>
                                ) : null}
                              </View>
                            ))}
                          </CollapsibleBackField>
                        </View>
                      ) : null}

                      {semanticRelationItems.length > 0 ? (
                        <>
                          {collocationItems.length > 0 ? (
                            <View
                              style={[
                                localStyles.backSectionDivider,
                                { backgroundColor: ui.divider },
                              ]}
                            />
                          ) : null}
                          <View
                            style={[
                              styles.referenceSubSection,
                              { marginTop: 0 },
                            ]}
                          >
                            <Text
                              style={[
                                localStyles.sectionLabel,
                                { color: ui.secondaryText },
                              ]}
                            >
                              {tUI(uiLanguage, 'cardDetail.semanticRelations')}
                            </Text>
                            <CollapsibleBackField
                              fieldKey="semanticRelations"
                              resetKey={`${item.id}-semantic-relations`}
                              collapsedHeight={
                                semanticRelationsCollapsedLimit
                              }
                              uiLanguage={uiLanguage}
                              color={ui.secondaryText}
                              onExpandedChange={handleBackFieldExpandedChange}
                              onCollapse={resetBackBodyScroll}
                            >
                              <View style={localStyles.semanticChipWrap}>
                                {semanticRelationItems.map((relation) => (
                                  <View
                                    key={`${relation.kind}-${relation.term}`}
                                    style={[
                                      localStyles.semanticChip,
                                      {
                                        backgroundColor: isLightMode
                                          ? 'rgba(78,175,244,0.09)'
                                          : 'rgba(78,175,244,0.12)',
                                        borderColor: isLightMode
                                          ? 'rgba(46,126,194,0.24)'
                                          : 'rgba(101,185,247,0.28)',
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        localStyles.semanticChipSymbol,
                                        {
                                          color:
                                            relation.kind === 'synonym'
                                              ? '#2E7EC2'
                                              : ui.secondaryText,
                                        },
                                      ]}
                                    >
                                      {relation.kind === 'synonym' ? '≈' : '≠'}
                                    </Text>
                                    <View
                                      style={localStyles.semanticChipTextBlock}
                                    >
                                      <Text
                                        style={[
                                          localStyles.semanticChipTerm,
                                          { color: ui.primaryText },
                                        ]}
                                      >
                                        {relation.term}
                                      </Text>
                                      {relation.translation ? (
                                        <Text
                                          style={[
                                            localStyles.semanticChipTranslation,
                                            { color: ui.secondaryText },
                                          ]}
                                        >
                                          {relation.translation}
                                        </Text>
                                      ) : null}
                                    </View>
                                  </View>
                                ))}
                              </View>
                            </CollapsibleBackField>
                          </View>
                        </>
                      ) : null}

                      {apiExampleSentences.length > 0 ? (
                        <>
                          {collocationItems.length > 0 ||
                          semanticRelationItems.length > 0 ? (
                            <View
                              style={[
                                localStyles.backSectionDivider,
                                { backgroundColor: ui.divider },
                              ]}
                            />
                          ) : null}
                          <Reanimated.View
                            style={[
                              styles.referenceSubSection,
                              { marginTop: 0 },
                            ]}
                          >
                            <Text
                              style={[
                                localStyles.sectionLabel,
                                { color: ui.secondaryText },
                              ]}
                            >
                              {tUI(uiLanguage, 'cardDetail.exampleSentence')}
                            </Text>
                            <View
                              pointerEvents="none"
                              accessible={false}
                              accessibilityElementsHidden
                              importantForAccessibility="no-hide-descendants"
                              style={localStyles.exampleMeasurementLayer}
                              onLayout={handleFullExamplesLayout}
                            >
                              {renderExampleRows()}
                            </View>
                            <Reanimated.View style={examplesBodyStyle}>
                              <View onLayout={handleFullExamplesLayout}>
                                {renderExampleRows()}
                              </View>
                            </Reanimated.View>
                            {shouldOfferFullExamples ? (
                              <Pressable
                                style={({ pressed }) => [
                                  localStyles.showFullSentenceRow,
                                  pressed
                                    ? localStyles.showFullSentenceRowPressed
                                    : null,
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel={tUI(
                                  uiLanguage,
                                  isExamplesExpanded
                                    ? 'cardDetail.hideExampleSentences'
                                    : 'cardDetail.showExampleSentences'
                                )}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  setIsExamplesExpanded((current) => {
                                    if (current) {
                                      resetBackBodyScroll();
                                    }
                                    return !current;
                                  });
                                }}
                              >
                                <Text
                                  style={[
                                    localStyles.showFullSentenceText,
                                    { color: ui.secondaryText },
                                  ]}
                                >
                                  {tUI(
                                    uiLanguage,
                                    isExamplesExpanded
                                      ? 'cardDetail.hideExampleSentences'
                                      : 'cardDetail.showExampleSentences'
                                  )}
                                </Text>
                                <View style={localStyles.expandArrowSlot}>
                                  <Animated.View
                                    style={[
                                      localStyles.expandArrowLayer,
                                      {
                                        opacity: examplesArrowDownOpacity,
                                        transform: [
                                          { rotate: examplesArrowDownRotate },
                                        ],
                                      },
                                    ]}
                                  >
                                    <Ionicons
                                      name="chevron-down"
                                      size={14}
                                      color={ui.secondaryText}
                                    />
                                  </Animated.View>
                                  <Animated.View
                                    style={[
                                      localStyles.expandArrowLayer,
                                      {
                                        opacity: examplesArrowUpOpacity,
                                        transform: [
                                          { rotate: examplesArrowUpRotate },
                                        ],
                                      },
                                    ]}
                                  >
                                    <Ionicons
                                      name="chevron-up"
                                      size={14}
                                      color={ui.secondaryText}
                                    />
                                  </Animated.View>
                                </View>
                              </Pressable>
                            ) : null}
                          </Reanimated.View>
                        </>
                      ) : null}

                      {collocationItems.length > 0 ||
                      semanticRelationItems.length > 0 ||
                      apiExampleSentences.length > 0 ? (
                        <View
                          style={[
                            localStyles.backSectionDivider,
                            { backgroundColor: ui.divider },
                          ]}
                        />
                      ) : null}
                      <View
                        style={[styles.referenceSubSection, { marginTop: 0 }]}
                      >
                        <Text
                          style={[
                            localStyles.sectionLabel,
                            { color: ui.secondaryText },
                          ]}
                        >
                          {tUI(uiLanguage, 'cardDetail.personalNotes')}
                        </Text>
                        {hasStickyNote ? (
                          <CollapsibleBackField
                            fieldKey="personalNotes"
                            resetKey={`${item.id}-personal-notes`}
                            collapsedHeight={personalNotesCollapsedLimit}
                            uiLanguage={uiLanguage}
                            color={ui.secondaryText}
                            onExpandedChange={handleBackFieldExpandedChange}
                            onCollapse={resetBackBodyScroll}
                          >
                            <Text
                              style={[
                                localStyles.dualSentenceText,
                                {
                                  color: ui.primaryText,
                                  fontSize: backTextFontSize,
                                  lineHeight: backTextLineHeight,
                                  fontWeight: '500',
                                },
                              ]}
                            >
                              {stickyNoteText?.trim()}
                            </Text>
                          </CollapsibleBackField>
                        ) : null}
                        <Pressable
                          style={({ pressed }) => [
                            localStyles.noteActionBtn,
                            {
                              backgroundColor: ui.noteActionBg,
                              borderColor: ui.noteActionBorder,
                            },
                            pressed
                              ? localStyles.actionIconBtnPressed
                              : null,
                          ]}
                          accessibilityRole="button"
                          onPress={onOpenStickyNote}
                        >
                          <Ionicons
                            name={hasStickyNote ? 'create-outline' : 'add'}
                            size={16}
                            color={ui.icon}
                          />
                          <Text
                            style={[
                              localStyles.noteActionText,
                              { color: ui.icon },
                            ]}
                          >
                            {hasStickyNote
                              ? tUI(uiLanguage, 'cardDetail.editNote')
                              : tUI(uiLanguage, 'cardDetail.addNote')}
                          </Text>
                        </Pressable>
                      </View>
                    </ScrollView>
                  </View>

                  {/* 底部 Footer */}
                  <View style={localStyles.backFooterPinned}>
                    <Text style={styles.referenceFooterText}>
                      {itemDisplayDate || tUI(uiLanguage, 'cardDetail.basics')}
                    </Text>
                  </View>
                </View>
              </Reanimated.View>
            </View>
          </View>
        </Pressable>
      </TutorialSpotlight>
      <Modal
        visible={isSharePickerVisible}
        transparent
        animationType="none"
        onRequestClose={() => setIsSharePickerVisible(false)}
      >
        <Pressable
          style={localStyles.shareModalBackdrop}
          onPress={() => setIsSharePickerVisible(false)}
        >
          <Animated.View
            style={[
              localStyles.shareModalSheet,
              isLightMode ? localStyles.shareModalSheetLight : null,
              {
                opacity: shareModalAnim,
                transform: [
                  {
                    scale: shareModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.92, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable onPress={() => {}}>
              <Text
                style={[
                  localStyles.shareModalTitle,
                  isLightMode ? localStyles.shareModalTitleLight : null,
                ]}
              >
                {tUI(uiLanguage, 'cardDetail.shareScreens')}
              </Text>
              <View style={localStyles.sharePreviewRow}>
                <Pressable
                  style={({ pressed }) => [
                    localStyles.sharePreviewCard,
                    pressed ? localStyles.sharePreviewCardPressed : null,
                  ]}
                  onPress={() => toggleShareSelection('front')}
                >
                  <View
                    style={[
                      localStyles.sharePreviewMedia,
                      isLightMode ? localStyles.sharePreviewMediaLight : null,
                      shareSelection.front
                        ? [
                            localStyles.sharePreviewMediaActive,
                            isLightMode
                              ? localStyles.sharePreviewMediaActiveLight
                              : null,
                          ]
                        : null,
                    ]}
                  >
                    {sharePreviewUri.front ? (
                      <Image
                        source={{ uri: sharePreviewUri.front }}
                        style={localStyles.sharePreviewImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text
                        style={[
                          localStyles.sharePreviewFallback,
                          isLightMode
                            ? localStyles.sharePreviewFallbackLight
                            : null,
                        ]}
                      >
                        {tUI(uiLanguage, 'cardDetail.front')}
                      </Text>
                    )}
                  </View>
                  <View style={localStyles.sharePreviewMetaRow}>
                    <Ionicons
                      name={
                        shareSelection.front
                          ? 'checkmark-circle'
                          : 'ellipse-outline'
                      }
                      size={18}
                      color={
                        shareSelection.front
                          ? isLightMode
                            ? '#0284C7'
                            : '#4EAFF4'
                          : '#94A3B8'
                      }
                    />
                    <Text
                      style={[
                        localStyles.sharePreviewLabel,
                        isLightMode ? localStyles.sharePreviewLabelLight : null,
                      ]}
                    >
                      {tUI(uiLanguage, 'cardDetail.front')}
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    localStyles.sharePreviewCard,
                    pressed ? localStyles.sharePreviewCardPressed : null,
                  ]}
                  onPress={() => toggleShareSelection('back')}
                >
                  <View
                    style={[
                      localStyles.sharePreviewMedia,
                      isLightMode ? localStyles.sharePreviewMediaLight : null,
                      shareSelection.back
                        ? [
                            localStyles.sharePreviewMediaActive,
                            isLightMode
                              ? localStyles.sharePreviewMediaActiveLight
                              : null,
                          ]
                        : null,
                    ]}
                  >
                    {sharePreviewUri.back ? (
                      <Image
                        source={{ uri: sharePreviewUri.back }}
                        style={localStyles.sharePreviewImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text
                        style={[
                          localStyles.sharePreviewFallback,
                          isLightMode
                            ? localStyles.sharePreviewFallbackLight
                            : null,
                        ]}
                      >
                        {tUI(uiLanguage, 'cardDetail.back')}
                      </Text>
                    )}
                  </View>
                  <View style={localStyles.sharePreviewMetaRow}>
                    <Ionicons
                      name={
                        shareSelection.back
                          ? 'checkmark-circle'
                          : 'ellipse-outline'
                      }
                      size={18}
                      color={
                        shareSelection.back
                          ? isLightMode
                            ? '#0284C7'
                            : '#4EAFF4'
                          : '#94A3B8'
                      }
                    />
                    <Text
                      style={[
                        localStyles.sharePreviewLabel,
                        isLightMode ? localStyles.sharePreviewLabelLight : null,
                      ]}
                    >
                      {tUI(uiLanguage, 'cardDetail.back')}
                    </Text>
                  </View>
                </Pressable>
              </View>

              <View style={localStyles.shareActionRow}>
                <Pressable
                  style={({ pressed }) => [
                    localStyles.shareCancelBtn,
                    isLightMode ? localStyles.shareCancelBtnLight : null,
                    pressed ? localStyles.shareActionBtnPressed : null,
                  ]}
                  onPress={() => setIsSharePickerVisible(false)}
                >
                  <Text
                    style={[
                      localStyles.shareCancelText,
                      isLightMode ? localStyles.shareCancelTextLight : null,
                    ]}
                  >
                    {tUI(uiLanguage, 'common.cancel')}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    localStyles.shareConfirmBtn,
                    isLightMode ? localStyles.shareConfirmBtnLight : null,
                    pressed ? localStyles.shareActionBtnPressed : null,
                  ]}
                  onPress={() => void submitShareSelection()}
                >
                  <Text
                    style={[
                      localStyles.shareConfirmText,
                      isLightMode ? localStyles.shareConfirmTextLight : null,
                    ]}
                  >
                    {tUI(uiLanguage, 'cardDetail.share')}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
      <View pointerEvents="none" style={localStyles.hiddenCombinedCaptureWrap}>
        <View
          ref={combinedShareRef}
          collapsable={false}
          style={[
            localStyles.combinedCaptureSheet,
            isLightMode ? localStyles.combinedCaptureSheetLight : null,
          ]}
        >
          {sharePreviewUri.front ? (
            <Image
              source={{ uri: sharePreviewUri.front }}
              style={localStyles.combinedCaptureHalf}
              resizeMode="cover"
            />
          ) : null}
          {sharePreviewUri.back ? (
            <Image
              source={{ uri: sharePreviewUri.back }}
              style={localStyles.combinedCaptureHalf}
              resizeMode="cover"
            />
          ) : null}
        </View>
      </View>
    </Reanimated.View>
  );
}

const localStyles = StyleSheet.create({
  frontBodyScroll: {
    flex: 1,
    minHeight: 120,
  },
  frontBodyContent: {
    paddingBottom: FRONT_BODY_ACTION_ROW_CLEARANCE,
  },
  backBodyScroll: {
    flex: 1,
    minHeight: 180,
  },
  backBodyContent: {
    paddingBottom: BACK_BODY_FOOTER_CLEARANCE,
  },
  backTextSection: {
    flex: 1,
    minHeight: 0,
  },
  backSectionDivider: {
    height: 1,
    marginTop: 14,
    marginBottom: 14,
  },
  culturalScrollBox: {
    maxHeight: 152,
  },
  backFooterPinned: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 2,
  },
  noteActionBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  noteActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
  dualSentenceBlock: {
    marginTop: 4,
    position: 'relative',
  },
  textMeasurementPass: {
    width: '100%',
  },
  showFullSentenceRow: {
    marginTop: 8,
    marginBottom: 4,
    minHeight: 24,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  showFullSentenceRowPressed: {
    opacity: 0.64,
  },
  showFullSentenceText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  expandArrowSlot: {
    width: 16,
    height: 16,
    position: 'relative',
  },
  expandArrowLayer: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frontContextSection: {
    minHeight: 72,
    paddingBottom: 18,
    position: 'relative',
  },
  sectionLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'none',
    marginBottom: 6,
  },
  collocationLineBlock: {
    gap: 2,
  },
  collocationTranslationText: {
    marginLeft: 16,
    fontWeight: '500',
    opacity: 0.78,
  },
  semanticChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  semanticChip: {
    maxWidth: '100%',
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  semanticChipSymbol: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '800',
  },
  semanticChipTextBlock: {
    flexShrink: 1,
  },
  semanticChipTerm: {
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '700',
  },
  semanticChipTranslation: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  exampleTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingRight: 0,
  },
  exampleMeasurementLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    opacity: 0,
    zIndex: -1,
  },
  exampleSentenceText: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
  },
  exampleTranslationText: {
    flexShrink: 1,
    fontWeight: '500',
    opacity: 0.78,
  },
  dualSentenceText: {
    flexShrink: 0,
    marginTop: 0,
    color: '#F8FAFC',
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  cardActionRow: {
    flexShrink: 0,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -2,
    paddingHorizontal: 2,
    paddingTop: 0,
    paddingBottom: 0,
    transform: [{ translateY: 8 }],
  },
  actionIconBtn: {
    width: '100%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  actionIconSlot: {
    width: CARD_ACTION_BUTTON_WIDTH,
    height: 36,
  },
  micActionIconSlot: {
    transform: [{ translateX: CARD_ACTION_BUTTON_HORIZONTAL_OFFSETS.mic }],
  },
  shareActionIconSlot: {
    transform: [{ translateX: CARD_ACTION_BUTTON_HORIZONTAL_OFFSETS.share }],
  },
  heartActionIconSlot: {
    transform: [{ translateX: CARD_ACTION_BUTTON_HORIZONTAL_OFFSETS.heart }],
  },
  bookmarkActionIconSlot: {
    transform: [{ translateX: CARD_ACTION_BUTTON_HORIZONTAL_OFFSETS.bookmark }],
  },
  actionIconBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
  rigidActionIconBtnPressed: {
    opacity: 0.78,
    backgroundColor: 'rgba(78,175,244,0.12)',
    borderRadius: 12,
  },
  shareModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  shareModalSheet: {
    borderRadius: 18,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  shareModalSheetLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    shadowOpacity: 0.12,
  },
  shareModalTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  shareModalTitleLight: {
    color: '#0F172A',
  },
  sharePreviewRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sharePreviewCard: {
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
  },
  sharePreviewCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  sharePreviewMedia: {
    width: '100%',
    aspectRatio: 0.72,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharePreviewMediaLight: {
    backgroundColor: '#F1F5F9',
  },
  sharePreviewMediaActive: {
    borderWidth: 1.5,
    borderColor: '#4EAFF4',
  },
  sharePreviewMediaActiveLight: {
    borderColor: '#0284C7',
  },
  sharePreviewImage: {
    width: '100%',
    height: '100%',
  },
  sharePreviewFallback: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  sharePreviewFallbackLight: {
    color: '#64748B',
  },
  sharePreviewMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  sharePreviewLabel: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  sharePreviewLabelLight: {
    color: '#0F172A',
  },
  shareActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  shareCancelBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  shareCancelBtnLight: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  shareCancelText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  shareCancelTextLight: {
    color: '#475569',
  },
  shareConfirmBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#4EAFF4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  shareConfirmBtnLight: {
    backgroundColor: '#0284C7',
  },
  shareConfirmText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  shareConfirmTextLight: {
    color: '#FFFFFF',
  },
  shareActionBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  hiddenCombinedCaptureWrap: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    opacity: 0,
  },
  combinedCaptureSheet: {
    width: 360,
    backgroundColor: '#0F172A',
    padding: 8,
    gap: 8,
  },
  combinedCaptureSheetLight: {
    backgroundColor: '#F1EBE3',
  },
  combinedCaptureHalf: {
    width: '100%',
    height: 540,
    borderRadius: 12,
  },
});

export default React.memo(CardDetailCarouselCardUI);
