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
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { parseCardContextSections } from '../../../features/cards/cardContextSections';
import { quoteLearningTermInText } from '../../../features/cards/learningTermQuotes';
import { isPhraseLikeCardSubject, isSameCardUsage } from '../../../features/cards/cardUsage';
import { parseSemanticRelations } from '../../../features/cards/semanticRelations';
import { tUI } from '../../../i18n/uiLanguage';
import { formatPartOfSpeechLabel } from '../../../i18n/partOfSpeech';
import { MODAL_CTA_COLOR, resolveThemeColors } from '../../../theme/colors';
import { useAppIsActive } from '../../../hooks/useAppIsActive';
import {
  DEMO_GHOST_PREVIEW_TYPE_INTERVAL_MS,
  DEMO_GHOST_PREVIEW_TYPE_TAIL_MS,
  DEMO_GHOST_TEXT_UPDATE_INTERVAL_MS,
} from '../../../features/createCard/ghostAnimationTiming';

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
  const sourceComparable = card.sourceSentence
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return sentenceTranslation
    .split('\n')
    .filter((line) => {
      const lineComparable = line
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
      return !sourceComparable || lineComparable !== sourceComparable;
    })
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
    outlineBase: 0.58,
    outlinePulse: 0.28,
    shadowBase: 0.18,
    shadowPulse: 0.16,
  };
}

function ProgressiveText({
  text,
  active,
  animate = true,
  style,
  textProps,
}: {
  text: string;
  active: boolean;
  animate?: boolean;
  style: any;
  textProps?: TextProps;
}) {
  const textUnits = React.useMemo(() => Array.from(text), [text]);
  const targetUnitsRef = React.useRef(textUnits);
  const previousTextRef = React.useRef(text);
  const initialVisibleCount = active && !animate ? textUnits.length : 0;
  const visibleCountRef = React.useRef(initialVisibleCount);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [visibleCount, setVisibleCount] = React.useState(initialVisibleCount);

  const stopRevealTimer = React.useCallback(() => {
    if (!intervalRef.current) return;
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const setVisibleCountSynced = React.useCallback((next: number) => {
    visibleCountRef.current = next;
    setVisibleCount(next);
  }, []);

  const startRevealTimer = React.useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      const targetLength = targetUnitsRef.current.length;
      const current = visibleCountRef.current;
      if (current >= targetLength) {
        stopRevealTimer();
        return;
      }
      const remaining = targetLength - current;
      const step = remaining > 80 ? 6 : remaining > 30 ? 3 : remaining > 10 ? 2 : 1;
      setVisibleCountSynced(Math.min(targetLength, current + step));
    }, DEMO_GHOST_TEXT_UPDATE_INTERVAL_MS);
  }, [setVisibleCountSynced, stopRevealTimer]);

  React.useEffect(() => {
    const previousText = previousTextRef.current;
    targetUnitsRef.current = textUnits;
    previousTextRef.current = text;

    if (!active) {
      stopRevealTimer();
      setVisibleCountSynced(0);
      return;
    }
    if (!animate) {
      stopRevealTimer();
      setVisibleCountSynced(textUnits.length);
      return;
    }
    if (textUnits.length === 0) {
      stopRevealTimer();
      setVisibleCountSynced(0);
      return;
    }

    // Streaming appends should preserve everything already revealed. If the
    // final normalized value differs, retain only its unchanged prefix.
    if (!text.startsWith(previousText)) {
      const previousUnits = Array.from(previousText);
      let commonPrefixLength = 0;
      while (
        commonPrefixLength < previousUnits.length &&
        commonPrefixLength < textUnits.length &&
        previousUnits[commonPrefixLength] === textUnits[commonPrefixLength]
      ) {
        commonPrefixLength += 1;
      }
      setVisibleCountSynced(
        Math.min(visibleCountRef.current, commonPrefixLength)
      );
    }

    startRevealTimer();
  }, [
    active,
    animate,
    setVisibleCountSynced,
    startRevealTimer,
    stopRevealTimer,
    text,
    textUnits,
  ]);

  React.useEffect(() => stopRevealTimer, [stopRevealTimer]);

  return (
    <FixedText {...textProps} style={style}>
      {active ? textUnits.slice(0, visibleCount).join('') : ''}
    </FixedText>
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
  headerAccessory,
  onPlayWord,
  onOpenPronunciationModal,
  onToggleFavorite,
  onOpenAlbumSheet,
  onSecondPageLayout,
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
  headerAccessory?: React.ReactNode;
  onPlayWord?: () => void;
  onOpenPronunciationModal?: () => void;
  onToggleFavorite?: () => void;
  onOpenAlbumSheet?: () => void;
  onSecondPageLayout?: (event: LayoutChangeEvent) => void;
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
  const previewCultural = card
    ? streamingText && !previewContextSections?.culturalBackground
      ? ''
      : buildCulturalBackgroundText(card, uiLanguage)
    : statusText;
  const previewPersonalNote = card?.note?.trim() || tUI(uiLanguage, 'cardDetail.addNote');
  const isThinking = phase === 'frontThinking';
  const backVisible = phase === 'backReveal' || phase === 'complete';
  const shouldAnimateText =
    !reduceMotion && (streamingText || phase !== 'complete');
  const canPlayWord = Boolean(onPlayWord && previewWord.trim());

  React.useEffect(() => {
    if (!isAppActive || reduceMotion || phase === 'complete') {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
    return () => {
      cancelAnimation(pulse);
    };
  }, [isAppActive, phase, pulse, reduceMotion]);

  const animatedCardStyle = useAnimatedStyle(() => {
    const borderTint = tone.outlineBase + pulse.value * tone.outlinePulse;
    return {
      borderColor: `rgba(78,175,244,${borderTint})`,
      shadowOpacity: tone.shadowBase + pulse.value * tone.shadowPulse,
    };
  }, [tone]);

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
          <View style={styles.previewHeaderRow}>
            <View style={styles.previewHeaderMain}>
              <Reanimated.View entering={FadeIn.duration(240)}>
                <ProgressiveText
                  text={previewWord}
                  active={revealState.showFrontWord || isThinking}
                  animate={shouldAnimateText}
                  style={[styles.previewWord, { color: palette.textOnContainer }]}
                  textProps={{
                    adjustsFontSizeToFit: true,
                    minimumFontScale: 0.72,
                    numberOfLines: 2,
                  }}
                />
              </Reanimated.View>
              {previewPartOfSpeech ? (
                <Reanimated.View entering={FadeIn.duration(220)} style={[styles.previewPosChip, { backgroundColor: tone.chipBg, borderColor: tone.chipBorder }]}>
                  <ProgressiveText
                    text={previewPartOfSpeech}
                    active={revealState.showFrontWord || isThinking}
                    animate={shouldAnimateText}
                    style={[styles.previewPosChipText, { color: palette.secondaryText }]}
                    textProps={{
                      adjustsFontSizeToFit: true,
                      minimumFontScale: 0.75,
                      numberOfLines: 1,
                    }}
                  />
                </Reanimated.View>
              ) : null}
            </View>
            <Pressable
              disabled={!canPlayWord}
              onPress={onPlayWord}
              hitSlop={styles.previewActionHitSlop}
              style={({ pressed }) => [
                styles.previewAudioWrap,
                !canPlayWord ? styles.previewAudioWrapDisabled : null,
                pressed && canPlayWord ? styles.previewActionIconBtnPressed : null,
              ]}
            >
              <Ionicons
                name={isWordAudioLoading ? 'ellipsis-horizontal' : 'volume-medium-outline'}
                size={28}
                color={palette.secondaryText}
              />
            </Pressable>
          </View>
          {headerAccessory}

          <View style={styles.previewDefinitionRow}>
            <ProgressiveText text={previewDefinition} active={revealState.showFrontDefinition} animate={shouldAnimateText} style={[styles.previewDefinitionText, { color: palette.textOnContainer }]} />
            {isThinking && !revealState.showFrontDefinition ? (
              <View style={[styles.previewStatusSlot, { backgroundColor: tone.statusBg, borderColor: tone.statusBorder }]}>
                <Reanimated.Text allowFontScaling={false} maxFontSizeMultiplier={1} key={statusText} entering={FadeIn.duration(280)} exiting={FadeOut.duration(220)} style={[styles.previewStatusText, { color: palette.secondaryText }]}>
                  {statusText}
                </Reanimated.Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.previewDivider, { backgroundColor: tone.divider }]} />

          <View style={styles.previewFrontSection}>
            <ProgressiveText text={previewSourceSentence} active={revealState.showFrontSentence} animate={shouldAnimateText} style={[styles.previewSentenceText, { color: palette.textOnContainer }]} />
            <ProgressiveText text={previewTranslation} active={revealState.showFrontTranslation} animate={shouldAnimateText} style={[styles.previewSentenceText, styles.previewTranslationText, { color: palette.textOnContainer }]} />
          </View>

          <View style={styles.previewSectionBlock}>
            <FixedText style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>
              {tUI(uiLanguage, 'cardDetail.context')}
            </FixedText>
            <ProgressiveText text={previewCultural} active={revealState.showBackCultural} animate={shouldAnimateText} style={[styles.previewSectionBody, { color: palette.textOnContainer }]} />
          </View>

          <View style={styles.previewFooterRow}>
            <Pressable
              style={({ pressed }) => [styles.previewActionIconBtn, pressed ? styles.previewActionIconBtnPressed : null]}
              onPress={onOpenPronunciationModal}
              hitSlop={styles.previewActionHitSlop}
            >
              <Ionicons name="mic-outline" size={28} color={ui.icon} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.previewActionIconBtn, pressed ? styles.previewActionIconBtnPressed : null]}
              onPress={() => void openSharePicker()}
              hitSlop={styles.previewActionHitSlop}
            >
              <Ionicons name="share-outline" size={28} color={ui.icon} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.previewActionIconBtn, pressed ? styles.previewActionIconBtnPressed : null]}
              onPress={onToggleFavorite}
              hitSlop={styles.previewActionHitSlop}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={28}
                color={isFavorite ? ui.starActive : ui.starInactive}
              />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.previewActionIconBtn, pressed ? styles.previewActionIconBtnPressed : null]}
              onPress={onOpenAlbumSheet}
              hitSlop={styles.previewActionHitSlop}
            >
              <Ionicons
                name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                size={28}
                color={isBookmarked ? '#4EAFF4' : ui.folderIcon}
              />
            </Pressable>
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
          {previewCollocation ? <View style={styles.previewSectionBlock}>
            <FixedText style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>
              {tUI(uiLanguage, isPhraseCard ? 'cardDetail.commonUsage' : 'cardDetail.collocation')}
            </FixedText>
            <ProgressiveText text={previewCollocation} active={revealState.showBackCollocation} animate={shouldAnimateText} style={[styles.previewBackMainText, { color: palette.textOnContainer }]} />
          </View> : null}

          {previewSemanticRelationItems.length > 0 ? (
            <View style={[styles.previewSectionBlock, { opacity: revealState.showBackSemanticRelations ? 1 : 0 }]}>
              <FixedText style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>
                {tUI(uiLanguage, 'cardDetail.semanticRelations')}
              </FixedText>
              <View style={styles.previewSemanticChipWrap}>
                {previewSemanticRelationItems.map((relation) => (
                  <View
                    key={`${relation.kind}-${relation.term}`}
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
                ))}
              </View>
            </View>
          ) : null}

          {previewExample ? (
            <View style={styles.previewSectionBlock}>
              <FixedText style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>
                {tUI(uiLanguage, 'cardDetail.exampleSentence')}
              </FixedText>
              <ProgressiveText text={previewExample} active={revealState.showBackExample} animate={shouldAnimateText} style={[styles.previewBackMainText, { color: palette.textOnContainer }]} />
            </View>
          ) : null}

          <View style={styles.previewSectionBlock}>
            <FixedText style={[styles.previewSectionLabel, { color: palette.secondaryText }]}>
              {tUI(uiLanguage, 'cardDetail.personalNotes')}
            </FixedText>
            <ProgressiveText text={previewPersonalNote} active={revealState.showBackNote} animate={shouldAnimateText} style={[styles.previewSectionBody, { color: palette.textOnContainer }]} />
          </View>
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
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  previewHeaderMain: { flex: 1, paddingRight: 12 },
  previewWord: { fontSize: 34, fontWeight: '800', lineHeight: 38 },
  previewPosChip: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  previewPosChipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.35 },
  previewAudioWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  previewAudioWrapDisabled: { opacity: 0.36 },
  previewDefinitionRow: { marginTop: 18 },
  previewDefinitionText: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
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
  previewDivider: { marginTop: 18, height: 1, borderRadius: 999 },
  previewFrontSection: { marginTop: 18, gap: 12 },
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
  previewFooterRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 1,
  },
  previewActionIconBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    backgroundColor: 'transparent',
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
  },
  sharePreviewMediaActive: {
    borderWidth: 1,
    borderColor: '#4EAFF4',
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
