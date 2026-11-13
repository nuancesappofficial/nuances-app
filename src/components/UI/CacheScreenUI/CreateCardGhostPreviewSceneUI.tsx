import React from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  type TextProps,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { UILanguage } from '@services/settings/userSettings';
import { captureRef } from 'react-native-view-shot';
import Reanimated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  parseCardContextSections,
  parseCulturalBackgroundInsight,
  parseStreamingCulturalBackgroundInsight,
  extractCulturalBackgroundDisplayText,
  removeSourceEchoLines,
  splitInsiderInsight,
} from '../../../features/cards/cardContextSections';
import { NuanceMetricsLeverUI } from '../DeckScreenUI/NuanceMetricsLeverUI';
import { StructuredInsiderInsightUI } from '../DeckScreenUI/StructuredInsiderInsightUI';
import {
  buildProgressiveSentenceSegments,
  quoteLearningTermInText,
} from '../../../features/cards/learningTermQuotes';
import { isPhraseLikeCardSubject, isSameCardUsage } from '../../../features/cards/cardUsage';
import { colorWithAlpha, splitRevealBands } from '../../../features/createCard/steadyReveal';
import { useSteadyReveal } from '../../../features/createCard/useSteadyReveal';
import { renderRevealRuns } from '../shared/revealRuns';
import { FadeWhen } from '../shared/FadeWhen';
import { parseSemanticRelations } from '../../../features/cards/semanticRelations';
import { tUI } from '../../../i18n/uiLanguage';
import { formatPartOfSpeechLabel } from '../../../i18n/partOfSpeech';
import { MODAL_CTA_COLOR, resolveFeedbackColors, resolveThemeColors } from '../../../theme/colors';
import { useAppIsActive } from '../../../hooks/useAppIsActive';
import {
  DEMO_GHOST_PREVIEW_TYPE_INTERVAL_MS,
  DEMO_GHOST_PREVIEW_TYPE_TAIL_MS,
} from '../../../features/createCard/ghostAnimationTiming';

// Pause after the context section finishes revealing, before panning to page 2.
const CONTEXT_READ_PAUSE_MS = 1400;
// Longest wait on page 1 for the rest of the card data before moving on anyway.
const CONTEXT_DATA_WAIT_MAX_MS = 6000;
// Synonym / antonym chips fade in one after another.
const SEMANTIC_CHIP_STAGGER_MS = 140;

export type GhostPreviewCard = {
  displayWord: string;
  partOfSpeech: string;
  definition: string;
  cultural: string;
  collocationsText: string;
  semanticRelationsText: string;
  note: string;
  sourceSentence: string;
  manualMode: boolean;
  phoneticTranscription?: string | null;
  isFavorite?: boolean;
  isBookmarked?: boolean;
};

export type PreviewPhase = 'frontThinking' | 'frontReveal' | 'backReveal' | 'complete';

function FixedText(props: TextProps) {
  return <Text {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

export type PreviewRevealState = {
  showFrontWord: boolean;
  showFrontDefinition: boolean;
  showFrontSentence: boolean;
  showFrontTranslation: boolean;
  showBackCollocation: boolean;
  showBackSemanticRelations: boolean;
  showBackExample: boolean;
  showBackCultural: boolean;
  showBackNote: boolean;
};

export const EMPTY_PREVIEW_REVEAL: PreviewRevealState = {
  showFrontWord: false,
  showFrontDefinition: false,
  showFrontSentence: false,
  showFrontTranslation: false,
  showBackCollocation: false,
  showBackSemanticRelations: false,
  showBackExample: false,
  showBackCultural: false,
  showBackNote: false,
};

export const COMPLETE_PREVIEW_REVEAL: PreviewRevealState = {
  showFrontWord: true,
  showFrontDefinition: true,
  showFrontSentence: true,
  showFrontTranslation: true,
  showBackCollocation: true,
  showBackSemanticRelations: true,
  showBackExample: true,
  showBackCultural: true,
  showBackNote: true,
};

const PREVIEW_TYPE_STEPS = 44;

export function getPreviewTypingDuration(text: string): number {
  const length = Math.max(1, text.length);
  const increment = Math.max(1, Math.ceil(length / PREVIEW_TYPE_STEPS));
  const ticks = Math.ceil(length / increment);
  return (
    ticks * DEMO_GHOST_PREVIEW_TYPE_INTERVAL_MS +
    DEMO_GHOST_PREVIEW_TYPE_TAIL_MS
  );
}

type GhostCollocationItem = {
  phrase: string;
  translation?: string;
};

type GhostExampleItem = {
  sentence: string;
  translation?: string;
};

function splitDashPair(value: string): { first: string; second?: string } {
  const [firstRaw, ...secondParts] = value.split(/\s+[—–-]\s+/);
  const first = (firstRaw || value).trim();
  const second = secondParts.join(' — ').trim();
  return second ? { first, second } : { first };
}

function collocationsFromText(raw: string): GhostCollocationItem[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[\n;]+/)
    .map((item) => {
      const pair = splitDashPair(item.trim());
      return pair.second ? { phrase: pair.first, translation: pair.second } : { phrase: pair.first };
    })
    .filter((item) => item.phrase)
    .slice(0, 4);
}

function examplesFromText(raw: string): GhostExampleItem[] {
  if (!raw.trim()) return [];
  return raw
    .split(/\n+/)
    .map((item) => {
      const pair = splitDashPair(item.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim());
      return pair.second ? { sentence: pair.first, translation: pair.second } : { sentence: pair.first };
    })
    .filter((item) => item.sentence)
    .slice(0, 4);
}

function exampleToText(example: GhostExampleItem): string {
  return example.translation ? `${example.sentence}\n${example.translation}` : example.sentence;
}

function collocationToText(collocation: GhostCollocationItem): string {
  return collocation.translation ? `• ${collocation.phrase}\n  ${collocation.translation}` : `• ${collocation.phrase}`;
}

export function buildSentenceTranslationText(card: GhostPreviewCard): string {
  if (!card.cultural.trim()) return '';
  const sentenceTranslation = parseCardContextSections({
    raw: card.cultural,
    displayWord: card.displayWord,
    definition: card.definition || card.displayWord,
    sourceSentence: card.sourceSentence,
    manualMode: card.manualMode,
  }).sentenceTranslation;
  return removeSourceEchoLines(sentenceTranslation, [card.sourceSentence])
    .split('\n')
    .map((line) => quoteLearningTermInText(line, card.displayWord))
    .join('\n');
}

export function buildCulturalBackgroundText(card: GhostPreviewCard, uiLanguage: UILanguage = 'en'): string {
  return parseCardContextSections({
    raw: card.cultural,
    displayWord: card.displayWord,
    definition: card.definition,
    sourceSentence: card.sourceSentence,
    manualMode: card.manualMode,
  }).culturalBackground || tUI(uiLanguage, 'cardDetail.noContext');
}

export function buildExampleSentenceText(card: GhostPreviewCard, _uiLanguage: UILanguage = 'en'): string {
  const structuredExample = parseCardContextSections({
    raw: card.cultural,
    displayWord: card.displayWord,
    definition: card.definition,
    sourceSentence: card.sourceSentence,
    manualMode: card.manualMode,
  }).exampleSentence;
  if (structuredExample) return structuredExample;
  return '';
}

function getGhostCardTone(params: {
  palette: ReturnType<typeof resolveThemeColors>;
  isLight: boolean;
}) {
  const { palette, isLight } = params;
  if (isLight) {
    return {
      pulseShadowColor: '#0F172A',
      chipBg: 'rgba(15,23,42,0.06)',
      chipBorder: 'rgba(15,23,42,0.08)',
      divider: '#E2E8F0',
      statusBg: 'rgba(15,23,42,0.035)',
      statusBorder: 'rgba(15,23,42,0.08)',
      footerBg: 'rgba(15,23,42,0.03)',
      footerBorder: 'rgba(15,23,42,0.08)',
      skeletonBlock: '#E2E8F0',
      skeletonBorder: '#F1F5F9',
      outlineBase: 0.22,
      outlinePulse: 0.22,
      shadowBase: 0.08,
      shadowPulse: 0.08,
    };
  }

  return {
    pulseShadowColor: MODAL_CTA_COLOR,
    chipBg: '#334155',
    chipBorder: 'rgba(148,163,184,0.22)',
    divider: '#334155',
    statusBg: 'rgba(255,255,255,0.03)',
    statusBorder: 'rgba(148,163,184,0.18)',
    footerBg: 'rgba(255,255,255,0.02)',
    footerBorder: 'rgba(148,163,184,0.18)',
    skeletonBlock: '#1F2834',
    skeletonBorder: '#2A374A',
    outlineBase: 0.58,
    outlinePulse: 0.28,
    shadowBase: 0.18,
    shadowPulse: 0.16,
  };
}

// Same target-word mark as the card detail and quiz: highlighter background +
// brand underline, no italic / coloured text.
type TargetWordHighlight = { fg: string; bg: string; line: string };

// Skeleton slider: the handle and its filled track drift back and forth, so
// the loading state reads as "measuring" rather than a frozen placeholder.
function SkeletonLeverTrack({
  color,
  thumbFill,
  from,
  to,
  delayMs,
  durationMs,
  animate,
}: {
  color: string;
  thumbFill: string;
  from: number;
  to: number;
  delayMs: number;
  durationMs: number;
  animate: boolean;
}) {
  const progress = useSharedValue(from);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    if (!animate) {
      progress.value = (from + to) / 2;
      return;
    }
    const ease = Easing.inOut(Easing.cubic);
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(to, { duration: durationMs, easing: ease }),
          withTiming(from, { duration: durationMs, easing: ease })
        ),
        -1,
        false
      )
    );
    return () => cancelAnimation(progress);
  }, [animate, delayMs, durationMs, from, progress, to]);

  const fillStyle = useAnimatedStyle(() => ({ width: progress.value * width }));
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * width - 6 }] }));

  return (
    <View
      style={[styles.contextSkeletonTrack, { backgroundColor: colorWithAlpha(color, 0.45) }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Reanimated.View style={[styles.contextSkeletonFill, { backgroundColor: color }, fillStyle]} />
      <Reanimated.View
        style={[styles.contextSkeletonThumb, { borderColor: color, backgroundColor: thumbFill }, thumbStyle]}
      />
    </View>
  );
}

function ProgressiveText({
  text,
  highlightTerm,
  highlight,
  active,
  animate = true,
  style,
  textProps,
  isStreamComplete = true,
  onComplete,
}: {
  text: string;
  highlightTerm?: string;
  highlight?: TargetWordHighlight;
  active: boolean;
  animate?: boolean;
  style: any;
  textProps?: TextProps;
  isStreamComplete?: boolean;
  onComplete?: () => void;
}) {
  const { segments, cleanText } = React.useMemo(
    () => buildProgressiveSentenceSegments(text, highlightTerm),
    [text, highlightTerm]
  );
  // One steady pace with a soft fading edge (web-LLM style). The full text is
  // always laid out; unrevealed characters are transparent, so nothing moves.
  const { pos, fadeChars } = useSteadyReveal({
    text: cleanText,
    active,
    animate,
    isStreamComplete,
    onComplete,
  });
  const baseColor = React.useMemo(() => StyleSheet.flatten(style)?.color as string | undefined, [style]);

  const boldStyle = React.useCallback(
    (alpha: number) =>
      highlight
        ? {
            fontWeight: '800' as const,
            color: colorWithAlpha(highlight.fg, alpha),
            backgroundColor: colorWithAlpha(highlight.bg, alpha),
            textDecorationLine: 'underline' as const,
            textDecorationColor: colorWithAlpha(highlight.line, alpha),
          }
        : { fontWeight: '800' as const },
    [highlight]
  );

  const renderedContent = React.useMemo(
    () =>
      renderRevealRuns(splitRevealBands(segments, active ? pos : 0, fadeChars), {
        color: baseColor,
        boldStyle,
      }),
    [active, baseColor, boldStyle, fadeChars, pos, segments]
  );

  return (
    <FixedText {...textProps} style={style}>
      {renderedContent}
    </FixedText>
  );
}

function TypedItemLines({
  lines,
  active,
  animate,
  isStreamComplete,
  onComplete,
  primaryStyle,
  secondaryStyle,
}: {
  lines: { text: string; secondary?: boolean }[];
  active: boolean;
  animate: boolean;
  isStreamComplete: boolean;
  onComplete?: () => void;
  primaryStyle: any;
  secondaryStyle: any;
}) {
  const [revealIndex, setRevealIndex] = React.useState(0);

  React.useEffect(() => {
    if (!active) {
      setRevealIndex(0);
    }
  }, [active]);

  // Without animation every line shows at once. Revealing them one effect at a
  // time (line 1 completes -> line 2 activates ...) left the lower lines
  // transparent for a few frames when the finished card mounted: a flicker.
  const shownIndex = animate ? revealIndex : lines.length;

  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;
  const linesLengthRef = React.useRef(lines.length);
  linesLengthRef.current = lines.length;

  const itemGroups = React.useMemo(() => {
    const groups: Array<Array<{ line: { text: string; secondary?: boolean }; index: number }>> = [];
    let currentGroup: Array<{ line: { text: string; secondary?: boolean }; index: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.secondary && currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push({ line, index: i });
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    return groups;
  }, [lines]);

  return (
    <>
      {itemGroups.map((group, groupIndex) => (
        <View key={`typed-item-group-${groupIndex}`} style={styles.previewCollocationLineBlock}>
          {group.map(({ line, index: i }) => (
            <ProgressiveText
              key={`typed-line-${i}`}
              text={line.text}
              active={active && i <= shownIndex}
              animate={animate}
              isStreamComplete={i < lines.length - 1 ? true : isStreamComplete}
              onComplete={() => {
                setRevealIndex((p) => Math.max(p, i + 1));
                if (i === linesLengthRef.current - 1) {
                  onCompleteRef.current?.();
                }
              }}
              style={line.secondary ? secondaryStyle : primaryStyle}
            />
          ))}
        </View>
      ))}
    </>
  );
}

export function CreateCardGhostPreviewScene({
  processingWord,
  card,
  palette,
  isLight,
  hasImage,
  imageUri,
  statusText,
  revealState,
  phase,
  uiLanguage,
  isFavorite = false,
  isBookmarked = false,
  isWordAudioLoading = false,
  streamingText = false,
  isNetworkStreamFinished = false,
  headerAccessory,
  onPlayWord,
  onOpenPronunciationModal,
  onToggleFavorite,
  onOpenAlbumSheet,
  onSecondPageLayout,
  onBackRevealStart,
  onSequentialRevealComplete,
}: {
  processingWord: string;
  card: GhostPreviewCard | null;
  palette: ReturnType<typeof resolveThemeColors>;
  isLight: boolean;
  hasImage: boolean;
  imageUri: string | null;
  statusText: string;
  revealState: PreviewRevealState;
  phase: PreviewPhase;
  uiLanguage: UILanguage;
  isFavorite?: boolean;
  isBookmarked?: boolean;
  isWordAudioLoading?: boolean;
  streamingText?: boolean;
  isNetworkStreamFinished?: boolean;
  headerAccessory?: React.ReactNode;
  onPlayWord?: () => void;
  onOpenPronunciationModal?: () => void;
  onToggleFavorite?: () => void;
  onOpenAlbumSheet?: () => void;
  onSecondPageLayout?: (event: LayoutChangeEvent) => void;
  /** Fired once when the reveal moves on to the second page (back of the card). */
  onBackRevealStart?: () => void;
  onSequentialRevealComplete?: () => void;
}) {
  const frontCaptureRef = React.useRef<View | null>(null);
  const backCaptureRef = React.useRef<View | null>(null);
  const combinedShareRef = React.useRef<View | null>(null);
  const reduceMotion = useReducedMotion();
  const [isSharePickerVisible, setIsSharePickerVisible] = React.useState(false);
  const [shareSelection, setShareSelection] = React.useState<{ front: boolean; back: boolean }>({
    front: true,
    back: false,
  });
  const [sharePreviewUri, setSharePreviewUri] = React.useState<{ front: string | null; back: string | null }>({
    front: null,
    back: null,
  });
  const shareModalAnim = React.useRef(new Animated.Value(0)).current;
  const pulse = useSharedValue(0);
  const isAppActive = useAppIsActive();
  const tone = React.useMemo(() => getGhostCardTone({ palette, isLight }), [isLight, palette]);
  const ui = React.useMemo(
    () =>
      isLight
        ? {
            icon: '#1F2937',
            folderIcon: '#1F2937',
            starActive: '#EF4444',
            starInactive: '#1F2937',
          }
        : {
            icon: '#94A3B8',
            folderIcon: '#94A3B8',
            starActive: '#EF4444',
            starInactive: '#94A3B8',
          },
    [isLight]
  );
  const previewWord = card?.displayWord || processingWord;
  const previewPhonetic = card?.phoneticTranscription?.trim() || '';
  const feedbackColors = React.useMemo(() => resolveFeedbackColors(isLight ? 'light' : 'dark'), [isLight]);
  const targetWordHighlight = React.useMemo<TargetWordHighlight>(() => {
    return {
      fg: isLight ? '#111111' : '#F8FAFC',
      bg: feedbackColors.brandSoft,
      line: feedbackColors.brand,
    };
  }, [feedbackColors, isLight]);
  const isPhraseCard = isPhraseLikeCardSubject(previewWord, card?.partOfSpeech);
  const previewPartOfSpeech = card?.partOfSpeech
    ? formatPartOfSpeechLabel(
        isPhraseCard ? 'phrase' : card.partOfSpeech,
        uiLanguage
      )
    : '';
  const previewDefinition = card?.definition || (card ? '' : statusText);
  const previewSourceSentence = card?.sourceSentence || processingWord;
  const previewContextSections = card
    ? parseCardContextSections({
        raw: card.cultural,
        displayWord: card.displayWord,
        definition: card.definition,
        sourceSentence: card.sourceSentence,
        manualMode: card.manualMode,
      })
    : null;
  const previewTranslation = card ? buildSentenceTranslationText(card) : statusText;
  const previewCollocationItems = card
    ? collocationsFromText(card.collocationsText)
      .filter((item) => !isSameCardUsage(item.phrase, previewWord))
    : [];
  const previewCollocation = previewCollocationItems.length > 0
    ? previewCollocationItems.map(collocationToText).join('\n\n')
    : card
      ? ''
      : statusText;
  const previewSemanticRelations = card
    ? parseSemanticRelations(card.semanticRelationsText)
    : { synonyms: [], antonyms: [] };
  const previewSemanticRelationItems = [
    ...previewSemanticRelations.synonyms.map((relation) => ({ ...relation, kind: 'synonym' as const })),
    ...previewSemanticRelations.antonyms.map((relation) => ({ ...relation, kind: 'antonym' as const })),
  ];
  const previewExampleItems = card ? examplesFromText(buildExampleSentenceText(card, uiLanguage)) : [];
  const previewExample = previewExampleItems.length > 0
    ? previewExampleItems.map(exampleToText).join('\n\n')
    : card
      ? ''
      : statusText;
  const previewCollocationLines = React.useMemo(() => {
    const lines: { text: string; secondary?: boolean }[] = [];
    for (const colloc of previewCollocationItems) {
      lines.push({ text: `• ${colloc.phrase}`, secondary: false });
      if (colloc.translation) {
        lines.push({ text: colloc.translation, secondary: true });
      }
    }
    return lines;
  }, [previewCollocationItems]);
  const previewExampleLines = React.useMemo(() => {
    const lines: { text: string; secondary?: boolean }[] = [];
    for (const example of previewExampleItems) {
      lines.push({ text: example.sentence, secondary: false });
      if (example.translation) {
        lines.push({ text: example.translation, secondary: true });
      }
    }
    return lines;
  }, [previewExampleItems]);
  const previewCultural = card
    ? streamingText && !previewContextSections?.culturalBackground
      ? ''
      : buildCulturalBackgroundText(card, uiLanguage)
    : statusText;
  const previewCulturalInsight = React.useMemo(
    () => parseStreamingCulturalBackgroundInsight(previewCultural),
    [previewCultural]
  );
  const culturalDisplayText = React.useMemo(() => {
    if (previewCulturalInsight?.insider_insight) {
      return previewCulturalInsight.insider_insight;
    }
    return extractCulturalBackgroundDisplayText(previewCultural);
  }, [previewCultural, previewCulturalInsight]);
  const previewStructuredInsight = React.useMemo(
    () => splitInsiderInsight(culturalDisplayText),
    [culturalDisplayText]
  );
  const [isGhostContextExpanded, setIsGhostContextExpanded] = React.useState(true);
  const previewPersonalNote = card?.note?.trim() || tUI(uiLanguage, 'cardDetail.addNote');

  // Sequential Reveal Queue during streaming
  const [streamStage, setStreamStage] = React.useState<
    'init' | 'def' | 'trans' | 'cultural' | 'colloc' | 'semantic' | 'example' | 'complete'
  >('init');

  const prevCardWordRef = React.useRef(card?.displayWord);
  React.useEffect(() => {
    if (card?.displayWord !== prevCardWordRef.current) {
      prevCardWordRef.current = card?.displayWord;
      setStreamStage('init');
      setIsGhostContextExpanded(true);
    }
  }, [card?.displayWord]);

  const isDefStreamComplete =
    isNetworkStreamFinished ||
    Boolean(previewTranslation && previewTranslation !== statusText) ||
    Boolean(culturalDisplayText && culturalDisplayText !== statusText) ||
    Boolean(previewCollocation && previewCollocation !== statusText) ||
    Boolean(previewExample && previewExample !== statusText) ||
    previewSemanticRelationItems.length > 0;

  const isTransStreamComplete =
    isNetworkStreamFinished ||
    Boolean(culturalDisplayText && culturalDisplayText !== statusText) ||
    Boolean(previewCollocation && previewCollocation !== statusText) ||
    Boolean(previewExample && previewExample !== statusText) ||
    previewSemanticRelationItems.length > 0;

  const isCulturalStreamComplete =
    isNetworkStreamFinished ||
    Boolean(previewCollocation && previewCollocation !== statusText) ||
    Boolean(previewExample && previewExample !== statusText) ||
    previewSemanticRelationItems.length > 0;

  const isCollocStreamComplete =
    isNetworkStreamFinished ||
    previewSemanticRelationItems.length > 0 ||
    Boolean(previewExample && previewExample !== statusText);

  const isSemanticStreamComplete =
    isNetworkStreamFinished ||
    Boolean(previewExample && previewExample !== statusText);

  const isExampleStreamComplete = isNetworkStreamFinished;

  React.useEffect(() => {
    if (!streamingText) return;

    if (streamStage === 'init') {
      if (card) {
        setStreamStage('def');
      }
      return;
    }

    if (streamStage === 'def') {
      if (isDefStreamComplete && !previewDefinition.trim()) {
        setStreamStage('trans');
      }
      return;
    }

    if (streamStage === 'trans') {
      if (
        isTransStreamComplete &&
        (!previewTranslation.trim() || previewTranslation === statusText)
      ) {
        setStreamStage('cultural');
      }
      return;
    }

    if (streamStage === 'cultural') {
      if (
        isCulturalStreamComplete &&
        (!culturalDisplayText.trim() || culturalDisplayText === statusText)
      ) {
        setStreamStage('colloc');
      }
      return;
    }

    if (streamStage === 'colloc') {
      if (
        isCollocStreamComplete &&
        previewCollocationItems.length === 0 &&
        (!previewCollocation.trim() || previewCollocation === statusText)
      ) {
        setStreamStage('semantic');
      }
      return;
    }

    if (streamStage === 'semantic') {
      if (previewSemanticRelationItems.length > 0) {
        const timer = setTimeout(() => {
          setStreamStage((current) => (current === 'semantic' ? 'example' : current));
        }, Math.max(280, 120 + previewSemanticRelationItems.length * SEMANTIC_CHIP_STAGGER_MS + 200));
        return () => clearTimeout(timer);
      }
      if (isSemanticStreamComplete && previewSemanticRelationItems.length === 0) {
        setStreamStage('example');
      }
      return;
    }

    if (streamStage === 'example') {
      if (
        isExampleStreamComplete &&
        previewExampleItems.length === 0 &&
        (!previewExample.trim() || previewExample === statusText)
      ) {
        setStreamStage('complete');
        onSequentialRevealComplete?.();
      }
      return;
    }
  }, [
    card,
    culturalDisplayText,
    isCollocStreamComplete,
    isCulturalStreamComplete,
    isDefStreamComplete,
    isExampleStreamComplete,
    isSemanticStreamComplete,
    isTransStreamComplete,
    onSequentialRevealComplete,
    previewCollocation,
    previewCollocationItems.length,
    previewDefinition,
    previewExample,
    previewExampleItems.length,
    previewSemanticRelationItems.length,
    previewTranslation,
    statusText,
    streamStage,
    streamingText,
  ]);

  const handleDefComplete = React.useCallback(() => {
    setStreamStage((current) => (current === 'def' ? 'trans' : current));
  }, []);

  const handleTransComplete = React.useCallback(() => {
    setStreamStage((current) => (current === 'trans' ? 'cultural' : current));
  }, []);

  // Move on to page 2 only when (a) the reader had a moment with the finished
  // context section and (b) all card data has arrived, so page 2 is laid out at
  // its final size and the screen needs a single move (no growth afterwards).
  const [culturalDoneAt, setCulturalDoneAt] = React.useState<number | null>(null);
  const handleCulturalComplete = React.useCallback(() => {
    setCulturalDoneAt((current) => current ?? Date.now());
  }, []);
  React.useEffect(() => {
    if (culturalDoneAt === null || streamStage !== 'cultural') return;
    const waitedMs = Date.now() - culturalDoneAt;
    const dataReady = isNetworkStreamFinished;
    // Never stall on page 1 for long if the network is slow.
    const delay = dataReady
      ? Math.max(0, CONTEXT_READ_PAUSE_MS - waitedMs)
      : Math.max(0, CONTEXT_DATA_WAIT_MAX_MS - waitedMs);
    const timer = setTimeout(() => {
      setStreamStage((current) => (current === 'cultural' ? 'colloc' : current));
    }, delay);
    return () => clearTimeout(timer);
  }, [culturalDoneAt, isNetworkStreamFinished, streamStage]);
  React.useEffect(() => {
    if (streamStage === 'init') setCulturalDoneAt(null);
  }, [streamStage]);

  const handleCollocComplete = React.useCallback(() => {
    setStreamStage((current) => (current === 'colloc' ? 'semantic' : current));
  }, []);

  const handleExampleComplete = React.useCallback(() => {
    setStreamStage((current) => (current === 'example' ? 'complete' : current));
    onSequentialRevealComplete?.();
  }, [onSequentialRevealComplete]);

  const effectivePhase: PreviewPhase = streamingText
    ? streamStage === 'colloc' || streamStage === 'semantic' || streamStage === 'example'
      ? 'backReveal'
      : streamStage === 'complete'
      ? 'complete'
      : 'frontReveal'
    : phase;

  const effectiveRevealState = React.useMemo<PreviewRevealState>(() => {
    if (!streamingText) return revealState;

    switch (streamStage) {
      case 'init':
        return {
          ...EMPTY_PREVIEW_REVEAL,
          showFrontWord: true,
          showFrontSentence: true,
        };
      case 'def':
        return {
          ...EMPTY_PREVIEW_REVEAL,
          showFrontWord: true,
          showFrontSentence: true,
          showFrontDefinition: true,
        };
      case 'trans':
        return {
          ...EMPTY_PREVIEW_REVEAL,
          showFrontWord: true,
          showFrontSentence: true,
          showFrontDefinition: true,
          showFrontTranslation: true,
        };
      case 'cultural':
        return {
          ...EMPTY_PREVIEW_REVEAL,
          showFrontWord: true,
          showFrontSentence: true,
          showFrontDefinition: true,
          showFrontTranslation: true,
          showBackCultural: true,
        };
      case 'colloc':
        return {
          ...EMPTY_PREVIEW_REVEAL,
          showFrontWord: true,
          showFrontSentence: true,
          showFrontDefinition: true,
          showFrontTranslation: true,
          showBackCultural: true,
          showBackCollocation: true,
        };
      case 'semantic':
        return {
          ...EMPTY_PREVIEW_REVEAL,
          showFrontWord: true,
          showFrontSentence: true,
          showFrontDefinition: true,
          showFrontTranslation: true,
          showBackCultural: true,
          showBackCollocation: true,
          showBackSemanticRelations: true,
        };
      case 'example':
      case 'complete':
        return COMPLETE_PREVIEW_REVEAL;
      default:
        return EMPTY_PREVIEW_REVEAL;
    }
  }, [revealState, streamStage, streamingText]);

  const isThinking = effectivePhase === 'frontThinking';
  const backVisible = effectivePhase === 'backReveal' || effectivePhase === 'complete';
  const onBackRevealStartRef = React.useRef(onBackRevealStart);
  onBackRevealStartRef.current = onBackRevealStart;
  React.useEffect(() => {
    if (backVisible) onBackRevealStartRef.current?.();
  }, [backVisible]);
  const shouldAnimateText =
    !reduceMotion && (streamingText || effectivePhase !== 'complete');
  const canPlayWord = Boolean(onPlayWord && previewWord.trim());

  React.useEffect(() => {
    if (!isAppActive || reduceMotion || effectivePhase === 'complete') {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
    return () => {
      cancelAnimation(pulse);
    };
  }, [effectivePhase, isAppActive, pulse, reduceMotion]);

  const animatedCardStyle = useAnimatedStyle(() => {
    const borderTint = tone.outlineBase + pulse.value * tone.outlinePulse;
    return {
      borderColor: `rgba(78,175,244,${borderTint})`,
      shadowOpacity: tone.shadowBase + pulse.value * tone.shadowPulse,
    };
  }, [tone]);

  const animatedSkeletonPulseStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + pulse.value * 0.45,
  }));

  const hasContextData =
    Boolean(previewCulturalInsight) ||
    Boolean(previewStructuredInsight.hookText && culturalDisplayText !== statusText) ||
    effectiveRevealState.showBackCultural;
  const isContextShowing = effectivePhase === 'complete' || effectiveRevealState.showBackCultural;
  const skeletonBar = (width: `${number}%`, height: number, extra?: object) => (
    <Reanimated.View
      style={[styles.skeletonTextLine, { width, height, backgroundColor: tone.skeletonBlock }, extra, animatedSkeletonPulseStyle]}
    />
  );
  // Mirrors the real context section (NuanceMetricsLeverUI + StructuredInsiderInsightUI):
  // two lever rows (label · track with thumb · label · score badge), a two-line
  // hook, two grey bento boxes (small label + three body lines), the toggle row.
  const bentoSurface = isLight ? '#F4F5F7' : '#1F2834';
  const skeletonLeverRow = (
    lever: { from: number; to: number; delayMs: number; durationMs: number },
    marginTop = 0
  ) => (
    <View style={[styles.contextSkeletonLeverRow, { marginTop }]}>
      {skeletonBar('100%', 8, styles.contextSkeletonAxis)}
      <SkeletonLeverTrack
        color={tone.skeletonBlock}
        thumbFill={palette.containerBg}
        from={lever.from}
        to={lever.to}
        delayMs={lever.delayMs}
        durationMs={lever.durationMs}
        animate={!reduceMotion}
      />
      {skeletonBar('100%', 8, styles.contextSkeletonAxis)}
      {skeletonBar('100%', 18, styles.contextSkeletonBadge)}
    </View>
  );
  const skeletonBento = (lastLineWidth: `${number}%`) => (
    <View style={[styles.contextSkeletonBento, { backgroundColor: bentoSurface }]}>
      {skeletonBar('34%', 9, { marginBottom: 9 })}
      {skeletonBar('96%', 12, styles.contextSkeletonBodyLine)}
      {skeletonBar('90%', 12, styles.contextSkeletonBodyLine)}
      {skeletonBar(lastLineWidth, 12, styles.contextSkeletonBodyLine)}
    </View>
  );
  // Which lever rows the real section will have. Unknown until the data
  // arrives (show both); some words have no formality / intensity at all.
  const skeletonLevers = previewCulturalInsight
    ? {
        formality: previewCulturalInsight.metrics.formality != null,
        intensity: previewCulturalInsight.metrics.intensity != null,
      }
    : { formality: true, intensity: true };
  const renderContextSkeleton = () => (
    <View>
      {skeletonLevers.formality || skeletonLevers.intensity ? (
        <View style={styles.contextSkeletonLevers}>
          {/* Different ranges and timing per row, so the two handles never move in sync. */}
          {skeletonLevers.formality
            ? skeletonLeverRow({ from: 0.25, to: 0.72, delayMs: 0, durationMs: 2300 })
            : null}
          {skeletonLevers.intensity
            ? skeletonLeverRow(
                { from: 0.62, to: 0.3, delayMs: 400, durationMs: 2700 },
                skeletonLevers.formality ? 10 : 0
              )
            : null}
        </View>
      ) : null}
      <View style={styles.contextSkeletonHook}>
        {skeletonBar('94%', 15, styles.contextSkeletonHookLine)}
        {skeletonBar('68%', 15, styles.contextSkeletonHookLine)}
      </View>
      <View style={styles.contextSkeletonBentoList}>
        {skeletonBento('58%')}
        {skeletonBento('72%')}
      </View>
      {skeletonBar('26%', 11, styles.contextSkeletonToggle)}
    </View>
  );
  // While streaming, page 2 keeps a skeleton until all of its data has arrived
  // (partial data would lay it out small and then grow).
  const showBackSkeleton = Boolean(streamingText) && !isNetworkStreamFinished && !backVisible;
  // Page 2 before its data arrives: about its final size, so it does not grow.
  const renderBackSkeleton = () => (
    <View style={styles.backSkeleton}>
      {skeletonBar('26%', 10)}
      {skeletonBar('80%', 16)}
      {skeletonBar('50%', 12)}
      {skeletonBar('26%', 10, { marginTop: 14 })}
      <View style={styles.backSkeletonChips}>
        {skeletonBar('46%', 48, { borderRadius: 14 })}
        {skeletonBar('46%', 48, { borderRadius: 14 })}
      </View>
      {skeletonBar('26%', 10, { marginTop: 14 })}
      {skeletonBar('96%', 16)}
      {skeletonBar('88%', 16)}
      {skeletonBar('60%', 12)}
    </View>
  );

  const captureFacePreview = React.useCallback(async (face: 'front' | 'back') => {
    const ref = face === 'front' ? frontCaptureRef.current : backCaptureRef.current;
    if (!ref) return null;
    try {
      return await captureRef(ref, {
        format: 'png',
        quality: 0.9,
        result: 'tmpfile',
      });
    } catch {
      return null;
    }
  }, []);

  const captureAndShareFace = React.useCallback(
    async (face: 'front' | 'back') => {
      const ref = face === 'front' ? frontCaptureRef.current : backCaptureRef.current;
      if (!ref) return;
      const uri = await captureRef(ref, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Share.share({
        url: uri,
        message: `${previewWord} (${face})`,
      });
    },
    [previewWord]
  );

  const openSharePicker = React.useCallback(async () => {
    setIsSharePickerVisible(true);
    const [front, back] = await Promise.all([captureFacePreview('front'), captureFacePreview('back')]);
    setSharePreviewUri({ front, back });
  }, [captureFacePreview]);

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
    const selectedCount = Number(shareSelection.front) + Number(shareSelection.back);
    if (!selectedCount) return;
    setIsSharePickerVisible(false);
    if (shareSelection.front && shareSelection.back && combinedShareRef.current) {
      const uri = await captureRef(combinedShareRef.current, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Share.share({
        url: uri,
        message: `${previewWord} (front + back)`,
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
  }, [captureAndShareFace, previewWord, shareSelection.back, shareSelection.front]);

  return (
    <View style={styles.previewScene}>
      <Reanimated.View
        ref={frontCaptureRef}
        collapsable={false}
        style={[styles.previewCardShell, { backgroundColor: palette.containerBg, shadowColor: tone.pulseShadowColor }, animatedCardStyle]}
      >
        {hasImage && imageUri ? <Image source={{ uri: imageUri }} style={styles.previewHeroImage} resizeMode="cover" /> : null}
        <View style={styles.previewBody}>
          {/* 1. 單字標題獨立列 */}
          <View style={styles.previewWordRow}>
            <Reanimated.View entering={FadeIn.duration(240)}>
              <ProgressiveText
                text={previewWord}
                active={effectiveRevealState.showFrontWord || isThinking}
                animate={shouldAnimateText}
                style={[styles.previewWord, { color: palette.textOnContainer }]}
                textProps={{
                  adjustsFontSizeToFit: true,
                  minimumFontScale: 0.72,
                  numberOfLines: 2,
                }}
              />
            </Reanimated.View>
          </View>

          {/* 1b. 音標列 + 播放喇叭 */}
          <View style={styles.previewIpaRow}>
            {isThinking && !previewPhonetic ? (
              <Reanimated.View
                style={[
                  styles.skeletonIpaLine,
                  { backgroundColor: tone.skeletonBlock },
                  animatedSkeletonPulseStyle,
                ]}
              />
            ) : previewPhonetic ? (
              <Text style={[styles.previewIpaText, { color: palette.secondaryText }]} numberOfLines={1}>
                {previewPhonetic}
              </Text>
            ) : null}
            <Pressable
              disabled={!canPlayWord}
              onPress={onPlayWord}
              hitSlop={styles.previewActionHitSlop}
              style={({ pressed }) => [
                styles.previewSpeakerBtn,
                { borderColor: tone.divider },
                !canPlayWord ? styles.previewSpeakerBtnDisabled : null,
                pressed && canPlayWord ? styles.previewActionIconBtnPressed : null,
              ]}
            >
              <Ionicons
                name={isWordAudioLoading ? 'ellipsis-horizontal' : 'volume-medium-outline'}
                size={20}
                color={palette.secondaryText}
              />
            </Pressable>
          </View>
          {headerAccessory}

          {/* 2. 詞性膠囊 Badge + 釋義橫條 */}
          <View style={styles.previewMeaningRow}>
            {previewPartOfSpeech ? (
              <Reanimated.View entering={FadeIn.duration(220)} style={[styles.previewPosChip, { backgroundColor: tone.chipBg, borderColor: tone.chipBorder }]}>
                <Text style={[styles.previewPosChipText, { color: palette.secondaryText }]}>
                  {previewPartOfSpeech}
                </Text>
              </Reanimated.View>
            ) : isThinking && !effectiveRevealState.showFrontDefinition ? (
              <Reanimated.View
                style={[
                  styles.skeletonPosBadge,
                  { backgroundColor: tone.skeletonBlock },
                  animatedSkeletonPulseStyle,
                ]}
              />
            ) : null}
            <View style={styles.previewMeaningTextSlot}>
              <ProgressiveText
                text={previewDefinition}
                active={effectiveRevealState.showFrontDefinition}
                animate={shouldAnimateText}
                isStreamComplete={isDefStreamComplete}
                onComplete={handleDefComplete}
                style={[styles.previewDefinitionText, { color: palette.textOnContainer }]}
              />
              {isThinking && !effectiveRevealState.showFrontDefinition ? (
                <View style={[styles.previewStatusSlot, { backgroundColor: tone.statusBg, borderColor: tone.statusBorder }]}>
                  <Reanimated.Text allowFontScaling={false} maxFontSizeMultiplier={1} key={statusText} entering={FadeIn.duration(280)} exiting={FadeOut.duration(220)} style={[styles.previewStatusText, { color: palette.secondaryText }]}>
                    {statusText}
                  </Reanimated.Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* 分隔線 1 */}
          <View style={[styles.previewDivider, { backgroundColor: tone.divider }]} />

          {/* 3. 雙語例句區塊 */}
          <View style={styles.previewFrontSection}>
            {isThinking && !previewSourceSentence ? (
              <View style={styles.skeletonSentenceBlock}>
                <Reanimated.View
                  style={[
                    styles.skeletonTextLine,
                    { width: '92%', height: 16, backgroundColor: tone.skeletonBlock },
                    animatedSkeletonPulseStyle,
                  ]}
                />
                <Reanimated.View
                  style={[
                    styles.skeletonTextLine,
                    { width: '74%', height: 16, backgroundColor: tone.skeletonBlock, marginTop: 10 },
                    animatedSkeletonPulseStyle,
                  ]}
                />
              </View>
            ) : (
              <>
                <ProgressiveText
                  text={previewSourceSentence}
                  highlightTerm={previewWord}
                  highlight={targetWordHighlight}
                  active={effectiveRevealState.showFrontSentence}
                  animate={shouldAnimateText}
                  style={[styles.previewSentenceText, { color: palette.textOnContainer }]}
                />
                <ProgressiveText
                  text={previewTranslation}
                  highlightTerm={previewWord}
                  highlight={targetWordHighlight}
                  active={effectiveRevealState.showFrontTranslation}
                  animate={shouldAnimateText}
                  isStreamComplete={isTransStreamComplete}
                  onComplete={handleTransComplete}
                  style={[styles.previewSentenceText, styles.previewTranslationText, { color: palette.textOnContainer }]}
                />
              </>
            )}
          </View>

          {/* 4. 細節辨析/指標區塊 (Nuance Metrics & Insight) */}
          <View style={styles.previewSectionBlock}>
            <FixedText style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>
              {tUI(uiLanguage, 'cardDetail.context')}
            </FixedText>
            {hasContextData ? (
              <View>
                {/* Laid out as soon as the data exists and faded in on its turn, so
                    this section reaches its final height once instead of growing. */}
                {previewCulturalInsight ? (
                  <FadeWhen visible={effectivePhase === 'complete' || effectiveRevealState.showBackCultural}>
                    <NuanceMetricsLeverUI
                      formality={previewCulturalInsight.metrics.formality}
                      intensity={previewCulturalInsight.metrics.intensity}
                      ui={{
                        noteText: palette.textOnContainer,
                        secondaryText: palette.secondaryText,
                        divider: tone.divider,
                      }}
                      animate={shouldAnimateText && effectiveRevealState.showBackCultural}
                    />
                  </FadeWhen>
                ) : null}
                {effectiveRevealState.showBackCultural ||
                (previewStructuredInsight.hookText && culturalDisplayText !== statusText) ? (
                  <StructuredInsiderInsightUI
                    insight={previewStructuredInsight}
                    isExpanded={isGhostContextExpanded}
                    onToggleExpand={() => setIsGhostContextExpanded((prev) => !prev)}
                    showToggle={effectivePhase === 'complete' || isCulturalStreamComplete}
                    reserveToggleSpace
                    textColor={palette.textOnContainer}
                    secondaryTextColor={palette.secondaryText}
                    uiLanguage={uiLanguage}
                    isLight={isLight}
                    contentScale={1}
                    collapsedLines={2}
                    animate={
                      shouldAnimateText &&
                      (streamStage === 'cultural' || !effectiveRevealState.showBackCultural)
                    }
                    active={effectiveRevealState.showBackCultural}
                    isStreamComplete={isCulturalStreamComplete}
                    onComplete={handleCulturalComplete}
                  />
                ) : null}
                {/* Loading skeleton stays on top until the context section's turn,
                    over the already laid-out (still invisible) content. */}
                <FadeWhen
                  visible={!isContextShowing}
                  duration={260}
                  style={[StyleSheet.absoluteFill, styles.contextSkeletonOverlay]}
                >
                  {renderContextSkeleton()}
                </FadeWhen>
              </View>
            ) : (
              // No data yet: a skeleton at about the final size keeps the card
              // from shrinking now and expanding later.
              <View style={styles.contextSkeletonInFlow}>{renderContextSkeleton()}</View>
            )}
          </View>

          {/* 5. 底部操作列：左「練發音」膠囊 + 右 3 顆圖示 (Share, Heart, Folder) */}
          <View style={styles.cardActionRow}>
            {isThinking && !canPlayWord ? (
              <Reanimated.View
                style={[
                  styles.skeletonPracticePill,
                  { backgroundColor: tone.skeletonBlock },
                  animatedSkeletonPulseStyle,
                ]}
              />
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.practiceButton,
                  { backgroundColor: feedbackColors.mic },
                  pressed ? styles.previewActionIconBtnPressed : null,
                ]}
                onPress={onOpenPronunciationModal}
              >
                <Ionicons name="mic" size={18} color="#FFFFFF" />
                <Text style={styles.practiceButtonText} numberOfLines={1}>
                  {tUI(uiLanguage, 'cardDetail.practicePronunciation')}
                </Text>
              </Pressable>
            )}

            <View style={styles.secondaryActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryActionBtn,
                  pressed ? styles.previewActionIconBtnPressed : null,
                ]}
                onPress={() => void openSharePicker()}
                hitSlop={styles.previewActionHitSlop}
              >
                <Ionicons name="share-outline" size={24} color={ui.icon} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.secondaryActionBtn,
                  pressed ? styles.previewActionIconBtnPressed : null,
                ]}
                onPress={onToggleFavorite}
                hitSlop={styles.previewActionHitSlop}
              >
                <Ionicons
                  name={isFavorite ? 'heart' : 'heart-outline'}
                  size={24}
                  color={isFavorite ? feedbackColors.bad : ui.icon}
                />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.secondaryActionBtn,
                  pressed ? styles.previewActionIconBtnPressed : null,
                ]}
                onPress={onOpenAlbumSheet}
                hitSlop={styles.previewActionHitSlop}
              >
                <Ionicons
                  name={isBookmarked ? 'folder' : 'folder-outline'}
                  size={24}
                  color={isBookmarked ? feedbackColors.brand : ui.icon}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </Reanimated.View>

      <Reanimated.View
        ref={backCaptureRef}
        collapsable={false}
        onLayout={onSecondPageLayout}
        style={[styles.previewCardShell, { backgroundColor: palette.containerBg, shadowColor: tone.pulseShadowColor, opacity: backVisible ? 1 : 0.9 }, animatedCardStyle]}
      >
        <View style={styles.previewBody}>
          {showBackSkeleton ? (
            renderBackSkeleton()
          ) : (
            <>
          {previewCollocationItems.length > 0 ? (
            <View style={styles.previewSectionBlock}>
              <FadeWhen visible={effectiveRevealState.showBackCollocation}>
                <FixedText style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>
                  {tUI(uiLanguage, isPhraseCard ? 'cardDetail.commonUsage' : 'cardDetail.collocation')}
                </FixedText>
              </FadeWhen>
              <TypedItemLines
                lines={previewCollocationLines}
                active={effectiveRevealState.showBackCollocation}
                animate={shouldAnimateText}
                isStreamComplete={isCollocStreamComplete}
                onComplete={handleCollocComplete}
                primaryStyle={[styles.previewCollocationItem, { color: palette.textOnContainer }]}
                secondaryStyle={[styles.previewCollocationTranslation, { color: palette.secondaryText }]}
              />
            </View>
          ) : previewCollocation ? (
            <View style={styles.previewSectionBlock}>
              <FadeWhen visible={effectiveRevealState.showBackCollocation}>
                <FixedText style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>
                  {tUI(uiLanguage, isPhraseCard ? 'cardDetail.commonUsage' : 'cardDetail.collocation')}
                </FixedText>
              </FadeWhen>
              <ProgressiveText
                text={previewCollocation}
                active={effectiveRevealState.showBackCollocation}
                animate={shouldAnimateText}
                isStreamComplete={isCollocStreamComplete}
                onComplete={handleCollocComplete}
                style={[styles.previewBackMainText, { color: palette.textOnContainer }]}
              />
            </View>
          ) : null}

          {previewSemanticRelationItems.length > 0 ? (
            <View style={styles.previewSectionBlock}>
              <FadeWhen visible={effectiveRevealState.showBackSemanticRelations}>
                <FixedText style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>
                  {tUI(uiLanguage, 'cardDetail.semanticRelations')}
                </FixedText>
              </FadeWhen>
              <View style={styles.previewSemanticChipWrap}>
                {previewSemanticRelationItems.map((relation, chipIndex) => (
                  <FadeWhen
                    key={`${relation.kind}-${relation.term}`}
                    visible={effectiveRevealState.showBackSemanticRelations}
                    delay={shouldAnimateText ? 120 + chipIndex * SEMANTIC_CHIP_STAGGER_MS : 0}
                    duration={260}
                  >
                  <View
                    style={[
                      styles.previewSemanticChip,
                      {
                        backgroundColor: isLight ? 'rgba(78,175,244,0.09)' : 'rgba(78,175,244,0.12)',
                        borderColor: isLight ? 'rgba(46,126,194,0.24)' : 'rgba(101,185,247,0.28)',
                      },
                    ]}
                  >
                    <FixedText
                      style={[
                        styles.previewSemanticChipSymbol,
                        { color: relation.kind === 'synonym' ? MODAL_CTA_COLOR : palette.secondaryText },
                      ]}
                    >
                      {relation.kind === 'synonym' ? '≈' : '≠'}
                    </FixedText>
                    <View style={styles.previewSemanticChipTextBlock}>
                      <FixedText style={[styles.previewSemanticChipTerm, { color: palette.textOnContainer }]} numberOfLines={1}>
                        {relation.term}
                      </FixedText>
                      {relation.translation ? (
                        <FixedText style={[styles.previewSemanticChipTranslation, { color: palette.secondaryText }]} numberOfLines={1}>
                          {relation.translation}
                        </FixedText>
                      ) : null}
                    </View>
                  </View>
                  </FadeWhen>
                ))}
              </View>
            </View>
          ) : null}

          {previewExampleItems.length > 0 ? (
            <View style={styles.previewSectionBlock}>
              <FadeWhen visible={effectiveRevealState.showBackExample}>
                <FixedText style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>
                  {tUI(uiLanguage, 'cardDetail.exampleSentence')}
                </FixedText>
              </FadeWhen>
              <TypedItemLines
                lines={previewExampleLines}
                active={effectiveRevealState.showBackExample}
                animate={shouldAnimateText}
                isStreamComplete={isExampleStreamComplete}
                onComplete={handleExampleComplete}
                primaryStyle={[styles.previewCollocationItem, { color: palette.textOnContainer }]}
                secondaryStyle={[styles.previewCollocationTranslation, { color: palette.secondaryText }]}
              />
            </View>
          ) : previewExample ? (
            <View style={styles.previewSectionBlock}>
              <FadeWhen visible={effectiveRevealState.showBackExample}>
                <FixedText style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>
                  {tUI(uiLanguage, 'cardDetail.exampleSentence')}
                </FixedText>
              </FadeWhen>
              <ProgressiveText
                text={previewExample}
                active={effectiveRevealState.showBackExample}
                animate={shouldAnimateText}
                isStreamComplete={isExampleStreamComplete}
                onComplete={handleExampleComplete}
                style={[styles.previewBackMainText, { color: palette.textOnContainer }]}
              />
            </View>
          ) : null}

          <FadeWhen visible={effectiveRevealState.showBackNote} style={styles.previewSectionBlock} duration={300}>
            <FixedText style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>
              {tUI(uiLanguage, 'cardDetail.personalNotes')}
            </FixedText>
            <ProgressiveText text={previewPersonalNote} active={effectiveRevealState.showBackNote} animate={shouldAnimateText} style={[styles.previewSectionBody, { color: palette.textOnContainer }]} />
          </FadeWhen>
            </>
          )}
        </View>
      </Reanimated.View>

      <Modal
        visible={isSharePickerVisible}
        transparent
        animationType="none"
        onRequestClose={() => setIsSharePickerVisible(false)}
      >
        <Pressable style={styles.shareModalBackdrop} onPress={() => setIsSharePickerVisible(false)}>
          <Animated.View
            style={[
              styles.shareModalSheet,
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
            <Pressable onPress={() => undefined}>
              <Text style={styles.shareModalTitle}>{tUI(uiLanguage, 'cardDetail.shareScreens')}</Text>
              <View style={styles.sharePreviewRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.sharePreviewCard,
                    pressed ? styles.sharePreviewCardPressed : null,
                  ]}
                  onPress={() => toggleShareSelection('front')}
                >
                  <View style={[styles.sharePreviewMedia, shareSelection.front ? styles.sharePreviewMediaActive : null]}>
                    {sharePreviewUri.front ? (
                      <Image source={{ uri: sharePreviewUri.front }} style={styles.sharePreviewImage} resizeMode="cover" />
                    ) : (
                      <Text style={styles.sharePreviewFallback}>{tUI(uiLanguage, 'cardDetail.front')}</Text>
                    )}
                  </View>
                  <View style={styles.sharePreviewMetaRow}>
                    <Ionicons name={shareSelection.front ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={shareSelection.front ? '#4EAFF4' : '#94A3B8'} />
                    <Text style={styles.sharePreviewLabel}>{tUI(uiLanguage, 'cardDetail.front')}</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.sharePreviewCard,
                    pressed ? styles.sharePreviewCardPressed : null,
                  ]}
                  onPress={() => toggleShareSelection('back')}
                >
                  <View style={[styles.sharePreviewMedia, shareSelection.back ? styles.sharePreviewMediaActive : null]}>
                    {sharePreviewUri.back ? (
                      <Image source={{ uri: sharePreviewUri.back }} style={styles.sharePreviewImage} resizeMode="cover" />
                    ) : (
                      <Text style={styles.sharePreviewFallback}>{tUI(uiLanguage, 'cardDetail.back')}</Text>
                    )}
                  </View>
                  <View style={styles.sharePreviewMetaRow}>
                    <Ionicons name={shareSelection.back ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={shareSelection.back ? '#4EAFF4' : '#94A3B8'} />
                    <Text style={styles.sharePreviewLabel}>{tUI(uiLanguage, 'cardDetail.back')}</Text>
                  </View>
                </Pressable>
              </View>

              <View style={styles.shareActionRow}>
                <Pressable
                  style={({ pressed }) => [styles.shareCancelBtn, pressed ? styles.shareActionBtnPressed : null]}
                  onPress={() => setIsSharePickerVisible(false)}
                >
                  <Text style={styles.shareCancelText}>{tUI(uiLanguage, 'common.cancel')}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.shareConfirmBtn, pressed ? styles.shareActionBtnPressed : null]}
                  onPress={() => void submitShareSelection()}
                >
                  <Text style={styles.shareConfirmText}>{tUI(uiLanguage, 'cardDetail.share')}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <View pointerEvents="none" style={styles.hiddenCombinedCaptureWrap}>
        <View ref={combinedShareRef} collapsable={false} style={styles.combinedCaptureSheet}>
          {sharePreviewUri.front ? (
            <Image source={{ uri: sharePreviewUri.front }} style={styles.combinedCaptureHalf} resizeMode="cover" />
          ) : null}
          {sharePreviewUri.back ? (
            <Image source={{ uri: sharePreviewUri.back }} style={styles.combinedCaptureHalf} resizeMode="cover" />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  previewScene: { gap: 16 },
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
  previewBody: { flex: 1 },
  previewWordRow: {
    marginBottom: 4,
  },
  previewWord: { fontSize: 34, fontWeight: '800', lineHeight: 38 },
  previewIpaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  previewIpaText: {
    fontSize: 15,
    fontWeight: '500',
  },
  previewSpeakerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSpeakerBtnDisabled: { opacity: 0.36 },
  previewMeaningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  previewPosChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  previewPosChipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.35 },
  previewMeaningTextSlot: {
    flex: 1,
  },
  previewDefinitionText: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  previewStatusSlot: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    marginTop: 4,
  },
  previewStatusText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: 0.3,
    opacity: 0.56,
  },
  previewDivider: { marginTop: 16, marginBottom: 14, height: 1, borderRadius: 999 },
  previewFrontSection: { marginTop: 4, gap: 10 },
  previewSentenceText: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  previewTranslationText: { marginTop: 2 },
  previewSectionBlock: { marginTop: 18 },
  previewSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  previewSectionBody: { fontSize: 18, lineHeight: 26, fontWeight: '500' },
  previewSectionBodyStrong: { fontSize: 19, lineHeight: 27, fontWeight: '600' },
  previewBackMainText: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  previewCollocationLineBlock: {
    marginBottom: 12,
  },
  previewCollocationItem: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  previewCollocationTranslation: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
    paddingLeft: 12,
  },
  skeletonIpaLine: {
    width: 88,
    height: 16,
    borderRadius: 6,
  },
  skeletonPosBadge: {
    width: 44,
    height: 24,
    borderRadius: 999,
  },
  skeletonTextLine: {
    borderRadius: 6,
  },
  skeletonSentenceBlock: {
    gap: 10,
    paddingVertical: 2,
  },
  // Context skeleton: same metrics as NuanceMetricsLeverUI / StructuredInsiderInsightUI.
  contextSkeletonLevers: { paddingVertical: 6, marginBottom: 6 },
  contextSkeletonLeverRow: { flexDirection: 'row', alignItems: 'center', height: 18 },
  contextSkeletonAxis: { width: 24, marginHorizontal: 3, borderRadius: 4 },
  contextSkeletonTrack: { flex: 1, height: 4, borderRadius: 2, marginHorizontal: 8, justifyContent: 'center' },
  contextSkeletonFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, opacity: 0.9 },
  contextSkeletonThumb: {
    position: 'absolute',
    left: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
  },
  contextSkeletonBadge: { width: 24, borderRadius: 5, marginLeft: 6 },
  contextSkeletonHook: { marginTop: 2, marginBottom: 10 },
  contextSkeletonHookLine: { marginVertical: 4.5, borderRadius: 5 },
  contextSkeletonBentoList: { marginTop: 2, gap: 9 },
  contextSkeletonBento: { paddingVertical: 11, paddingHorizontal: 13, borderRadius: 14 },
  contextSkeletonBodyLine: { marginVertical: 5, borderRadius: 5 },
  contextSkeletonToggle: { marginTop: 14, marginBottom: 6, borderRadius: 5 },
  contextSkeletonInFlow: {},
  contextSkeletonOverlay: {
    overflow: 'hidden',
  },
  backSkeleton: {
    gap: 8,
    minHeight: 330,
  },
  backSkeletonChips: {
    flexDirection: 'row',
    gap: 10,
  },
  skeletonMetricsBlock: {
    gap: 8,
    paddingVertical: 2,
  },
  skeletonPracticePill: {
    width: 104,
    height: 40,
    borderRadius: 20,
  },
  skeletonActionIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  previewSemanticChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewSemanticChip: {
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
  previewSemanticChipSymbol: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '800',
  },
  previewSemanticChipTextBlock: {
    flexShrink: 1,
  },
  previewSemanticChipTerm: {
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '700',
  },
  previewSemanticChipTranslation: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  cardActionRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingHorizontal: 2,
  },
  practiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 21,
    shadowColor: '#4EAFF4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  practiceButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  secondaryActionBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewActionIconBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
  previewActionHitSlop: {
    top: 10,
    right: 10,
    bottom: 10,
    left: 10,
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
  },
  shareModalTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sharePreviewMediaActive: {
    borderColor: '#4EAFF4',
  },
  sharePreviewImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  sharePreviewFallback: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
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
  shareCancelText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  shareConfirmBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#4EAFF4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  shareConfirmText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
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
  combinedCaptureHalf: {
    width: '100%',
    height: 540,
    borderRadius: 12,
  },
});
