import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { resolveFeedbackColors, type FeedbackColors } from '../../../theme/colors';
import type { UILanguage } from '../../../services/settings/userSettings';
import { tUI } from '../../../i18n/uiLanguage';
import {
  formatIpaPhoneme,
  getIpaPhonemeAudioTarget,
  getIpaSymbol,
} from '../../../services/pronunciation/ipaPhonemes';
import AnimatedGlowPressable from '../shared/AnimatedGlowPressable';
import SiriVoiceWaveButton from '../shared/SiriVoiceWaveButton';
import SiriSpeakerButton from '../shared/SiriSpeakerButton';
import PronunciationPhonemeSectionUI, {
  getPhonemeAccuracyLevel,
} from './PronunciationPhonemeSectionUI';

type PhonemeChip = {
  phoneme: string;
  letters?: string;
  accuracy?: number | null;
  spokenPhoneme?: string | null;
};

type Props = {
  isActiveCard: boolean;
  isRecording: boolean;
  recordingElapsedMs?: number;
  recordingLimitMs?: number;
  hasRecorded: boolean;
  showFeedback: boolean;
  isAnalyzing: boolean;
  analysisError?: string | null;
  resultRevealStep?: number;
  pronunciationScore: number | null;
  pronunciationFeedbackLines: string[];
  phonemeChips: PhonemeChip[];
  recoveredIpaPhonemes?: string[];
  isIpaLookupLoading?: boolean;
  ipaLookupError?: string | null;
  phoneticTranscription?: string | null;
  syllableRowPattern?: number[];
  waveformValues: Animated.Value[];
  recordingMetering?: number | Animated.Value;
  itemWord: string;
  uiLanguage: UILanguage;
  downloadingPronunciationTarget?: string | null;
  isWordPlaying?: boolean;
  onPlayWord: (word: string) => void;
  onPlayIpaPhoneme?: (phoneme: string) => void;
  onReloadIpa?: () => void;
  onReset: () => void;
  onClose: () => void;
  onPrimaryAction: () => void;
};

const PRONUNCIATION_PASS_SCORE = 60;

// ---- Result reveal: mic button flies into the score ring ----
const MORPH_MS = 520;
const RESULT_IN_AT_MS = 460;
const RING_DRAW_MS = 850;
const RING_SIZE = 88;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const EASE_OUT = Easing.bezier(0.3, 0.7, 0.2, 1);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type WindowRect = { x: number; y: number; width: number; height: number };
type MorphGeometry = {
  left: number;
  top: number;
  size: number;
  dx: number;
  dy: number;
  scale: number;
};

function measureInWindowAsync(ref: React.RefObject<View | null>) {
  return new Promise<WindowRect | null>((resolve) => {
    const node = ref.current;
    if (!node) {
      resolve(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  });
}

/**
 * Finds the letters of the weakest phoneme (below 85) inside the word, by
 * walking the phoneme letter groups in order. Returns null when the letter
 * groups don't line up with the word (then nothing is underlined).
 */
function findWeakLetterRange(
  word: string,
  chips: PhonemeChip[]
): { start: number; end: number; accuracy: number } | null {
  const lower = word.toLowerCase();
  let cursor = 0;
  let weakest: { start: number; end: number; accuracy: number } | null = null;
  for (const chip of chips) {
    const letters = chip.letters?.trim().toLowerCase();
    if (!letters) return null;
    const start = lower.indexOf(letters, cursor);
    if (start < 0) return null;
    const end = start + letters.length;
    cursor = end;
    if (
      typeof chip.accuracy === 'number' &&
      getPhonemeAccuracyLevel(chip.accuracy) !== 'ok' &&
      (!weakest || chip.accuracy < weakest.accuracy)
    ) {
      weakest = { start, end, accuracy: chip.accuracy };
    }
  }
  return weakest;
}

function ScoreRing({
  score,
  progress,
  color,
  trackColor,
  textColor,
}: {
  score: number;
  progress: Animated.Value;
  color: string;
  trackColor: string;
  textColor: string;
}) {
  const [shownScore, setShownScore] = React.useState(score);
  React.useEffect(() => {
    const id = progress.addListener(({ value }) => {
      setShownScore(Math.round(score * value));
    });
    return () => progress.removeListener(id);
  }, [progress, score]);

  const dashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, RING_CIRCUMFERENCE * (1 - score / 100)],
  });

  return (
    <View style={styles.scoreRing}>
      <View style={styles.scoreRingSvg}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={trackColor}
            strokeWidth={RING_STROKE}
            fill="none"
          />
          <AnimatedCircle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={color}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
          />
        </Svg>
      </View>
      <Text style={[styles.scoreRingText, { color: textColor }]}>{shownScore}</Text>
    </View>
  );
}

export default function PronunciationCoachUI({
  isActiveCard,
  isRecording,
  hasRecorded,
  showFeedback,
  isAnalyzing,
  analysisError,
  resultRevealStep = 3,
  pronunciationScore,
  pronunciationFeedbackLines,
  phonemeChips,
  recoveredIpaPhonemes = [],
  isIpaLookupLoading = false,
  ipaLookupError,
  waveformValues,
  recordingMetering,
  itemWord,
  uiLanguage,
  downloadingPronunciationTarget,
  isWordPlaying = false,
  onPlayWord,
  onPlayIpaPhoneme,
  onReloadIpa,
  onReset,
  onClose,
  onPrimaryAction,
}: Props) {
  const colorScheme = useColorScheme();
  const isLight = colorScheme === 'light';
  const reduceMotion = useReducedMotion();
  const palette = React.useMemo(
    () =>
      isLight
        ? {
            cardBg: '#F7F9FC',
            cardBorder: '#D9E2EC',
            primaryText: '#111111',
            secondaryText: '#8A8E97',
            softButtonBg: '#FFFFFF',
            softButtonBorder: 'rgba(0,0,0,0.06)',
            phonemeSurface: '#EEF2F7',
            phonemeBorder: '#D9E2EC',
            nextButtonBg: '#4EAFF4',
            nextButtonText: '#0F172A',
            successTint: 'rgba(52,199,89,0.18)',
            successText: '#34C759',
            errorTint: 'rgba(255,107,107,0.14)',
            errorText: '#FF6B6B',
          }
        : {
            cardBg: '#1E293B',
            cardBorder: '#334155',
            primaryText: '#F8FAFC',
            secondaryText: '#94A3B8',
            softButtonBg: 'rgba(255,255,255,0.08)',
            softButtonBorder: '#334155',
            phonemeSurface: 'rgba(255,255,255,0.08)',
            phonemeBorder: '#334155',
            nextButtonBg: '#4EAFF4',
            nextButtonText: '#0F172A',
            successTint: 'rgba(52,199,89,0.2)',
            successText: '#34C759',
            errorTint: 'rgba(255,107,107,0.15)',
            errorText: '#FF6B6B',
          },
    [isLight]
  );
  const feedback: FeedbackColors = resolveFeedbackColors(colorScheme);
  const hasResultContent =
    pronunciationScore !== null ||
    phonemeChips.length > 0 ||
    pronunciationFeedbackLines.length > 0;
  const showResult =
    isActiveCard &&
    (hasRecorded || showFeedback) &&
    hasResultContent &&
    !isRecording &&
    !isAnalyzing;
  const passed =
    typeof pronunciationScore === 'number' &&
    pronunciationScore >= PRONUNCIATION_PASS_SCORE;
  // Front = record screen, back = result. Opacity cross-fade + morph (no 3D flip).
  const frontOpacity = React.useRef(new Animated.Value(showResult ? 0 : 1)).current;
  const backOpacity = React.useRef(new Animated.Value(showResult ? 1 : 0)).current;
  const ringProgress = React.useRef(new Animated.Value(showResult ? 1 : 0)).current;
  const wordReveal = React.useRef(new Animated.Value(showResult ? 1 : 0)).current;
  const footerReveal = React.useRef(new Animated.Value(showResult ? 1 : 0)).current;
  const morphProgress = React.useRef(new Animated.Value(0)).current;
  const morphOpacity = React.useRef(new Animated.Value(0)).current;
  const [morph, setMorph] = React.useState<MorphGeometry | null>(null);
  const [staggerChips, setStaggerChips] = React.useState(false);
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const [activeIpaTarget, setActiveIpaTarget] = React.useState<string | null>(null);
  const cardShellRef = React.useRef<View>(null);
  const micRef = React.useRef<View>(null);
  const ringRef = React.useRef<View>(null);
  const isFirstRunRef = React.useRef(true);

  React.useEffect(() => {
    // Initial values already match showResult on mount.
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }

    let cancelled = false;
    let running: Animated.CompositeAnimation | null = null;

    const setFinal = (result: boolean) => {
      frontOpacity.setValue(result ? 0 : 1);
      backOpacity.setValue(result ? 1 : 0);
      ringProgress.setValue(result ? 1 : 0);
      wordReveal.setValue(result ? 1 : 0);
      footerReveal.setValue(result ? 1 : 0);
      morphOpacity.setValue(0);
      setMorph(null);
      setIsTransitioning(false);
    };

    if (reduceMotion) {
      setStaggerChips(false);
      setFinal(showResult);
      return;
    }

    if (!showResult) {
      setStaggerChips(false);
      setMorph(null);
      morphOpacity.setValue(0);
      setIsTransitioning(true);
      running = Animated.parallel([
        Animated.timing(backOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(frontOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]);
      running.start(() => {
        if (cancelled) return;
        ringProgress.setValue(0);
        wordReveal.setValue(0);
        footerReveal.setValue(0);
        setIsTransitioning(false);
      });
      return () => {
        cancelled = true;
        running?.stop();
      };
    }

    // Result arrived: mic button → score ring, then details float in.
    setIsTransitioning(true);
    setStaggerChips(true);
    backOpacity.setValue(0);
    ringProgress.setValue(0);
    wordReveal.setValue(0);
    footerReveal.setValue(0);

    void Promise.all([
      measureInWindowAsync(cardShellRef),
      measureInWindowAsync(micRef),
      measureInWindowAsync(ringRef),
    ]).then(([shell, mic, ring]) => {
      if (cancelled) return;
      const geometry: MorphGeometry | null =
        shell && mic && ring
          ? {
              left: mic.x - shell.x,
              top: mic.y - shell.y,
              size: mic.width,
              dx: ring.x + ring.width / 2 - (mic.x + mic.width / 2),
              dy: ring.y + ring.height / 2 - (mic.y + mic.height / 2),
              scale: ring.width / mic.width,
            }
          : null;
      if (geometry) {
        morphProgress.setValue(0);
        morphOpacity.setValue(1);
        setMorph(geometry);
      }
      running = Animated.parallel([
        Animated.timing(frontOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(morphProgress, {
          toValue: 1,
          duration: MORPH_MS,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(geometry ? RESULT_IN_AT_MS : 120),
          Animated.parallel([
            Animated.timing(backOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
            Animated.timing(morphOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
            Animated.timing(ringProgress, {
              toValue: 1,
              duration: RING_DRAW_MS,
              easing: EASE_OUT,
              useNativeDriver: false,
            }),
            Animated.sequence([
              Animated.delay(120),
              Animated.timing(wordReveal, {
                toValue: 1,
                duration: 380,
                easing: EASE_OUT,
                useNativeDriver: true,
              }),
            ]),
            Animated.sequence([
              Animated.delay(620),
              Animated.timing(footerReveal, {
                toValue: 1,
                duration: 380,
                easing: EASE_OUT,
                useNativeDriver: true,
              }),
            ]),
          ]),
        ]),
      ]);
      running.start(() => {
        if (cancelled) return;
        setMorph(null);
        setIsTransitioning(false);
      });
    });

    return () => {
      cancelled = true;
      running?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, showResult]);

  const handleRetryPress = React.useCallback(() => {
    if (isTransitioning) return;
    if (reduceMotion) {
      onReset();
      return;
    }
    setIsTransitioning(true);
    Animated.parallel([
      Animated.timing(backOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(frontOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start(() => {
      setIsTransitioning(false);
      onReset();
    });
  }, [isTransitioning, reduceMotion, backOpacity, frontOpacity, onReset]);

  React.useEffect(() => {
    if (!activeIpaTarget) return;
    if (downloadingPronunciationTarget === activeIpaTarget) return;
    const timer = setTimeout(() => {
      setActiveIpaTarget((current) => (current === activeIpaTarget ? null : current));
    }, 700);
    return () => clearTimeout(timer);
  }, [activeIpaTarget, downloadingPronunciationTarget]);

  const wordRevealStyle = {
    opacity: wordReveal,
    transform: [
      { translateY: wordReveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
    ],
  };
  const footerRevealStyle = {
    opacity: footerReveal,
    transform: [
      { translateY: footerReveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
    ],
  };
  const weakLetterRange = React.useMemo(
    () => findWeakLetterRange(itemWord, phonemeChips),
    [itemWord, phonemeChips]
  );
  const weakLetterColor =
    weakLetterRange && getPhonemeAccuracyLevel(weakLetterRange.accuracy) === 'bad'
      ? feedback.bad
      : feedback.warn;
  const wordDownloadTarget = itemWord.trim() ? `word:${itemWord.trim()}` : null;
  const isWordDownloading = Boolean(
    wordDownloadTarget &&
      downloadingPronunciationTarget === wordDownloadTarget
  );
  const playbackBusy = isWordDownloading || isWordPlaying;
  const phonemeSectionItems = React.useMemo(() => {
    const scoredItems = phonemeChips.flatMap((chip, index) => {
      const ipa = getIpaSymbol(chip.phoneme);
      if (!ipa) return [];
      const audioTarget = getIpaPhonemeAudioTarget(ipa);
      const loading = Boolean(
        audioTarget && downloadingPronunciationTarget === audioTarget
      );
      return [{
        id: `${audioTarget || ipa}:score:${index}`,
        value: ipa,
        label: formatIpaPhoneme(ipa),
        accuracy: chip.accuracy,
        loading,
        active: Boolean(
          audioTarget &&
            activeIpaTarget === audioTarget &&
            !loading
        ),
      }];
    });
    if (scoredItems.length > 0) return scoredItems;

    return recoveredIpaPhonemes.flatMap((rawPhoneme, index) => {
      const ipa = getIpaSymbol(rawPhoneme);
      if (!ipa) return [];
      const audioTarget = getIpaPhonemeAudioTarget(ipa);
      const loading = Boolean(
        audioTarget && downloadingPronunciationTarget === audioTarget
      );
      return [{
        id: `${audioTarget || ipa}:recovered:${index}`,
        value: ipa,
        label: formatIpaPhoneme(ipa),
        accuracy: null,
        loading,
        active: Boolean(
          audioTarget &&
            activeIpaTarget === audioTarget &&
            !loading
        ),
      }];
    });
  }, [
    activeIpaTarget,
    downloadingPronunciationTarget,
    phonemeChips,
    recoveredIpaPhonemes,
  ]);
  const showPhonemes =
    phonemeSectionItems.length > 0 && resultRevealStep >= 2;

  return (
    <View style={styles.root}>
      <View ref={cardShellRef} collapsable={false} style={styles.cardShell}>
        <Animated.View
          pointerEvents={showResult ? 'none' : 'auto'}
          style={[
            styles.cardFace,
            styles.frontFace,
            showResult ? styles.cardFaceAbsolute : styles.cardFaceRelative,
            {
              backgroundColor: palette.cardBg,
              borderColor: palette.cardBorder,
              opacity: frontOpacity,
            },
          ]}
        >
          <Text
            style={[
              styles.questionWord,
              { color: palette.primaryText },
              itemWord.length > 16
                ? styles.questionWordSmall
                : itemWord.length > 10
                ? styles.questionWordMedium
                : null,
            ]}
            numberOfLines={2}
          >
            {itemWord}
          </Text>

          <SiriSpeakerButton
            isPlaying={isWordPlaying}
            isLoading={isWordDownloading}
            disabled={!isActiveCard || playbackBusy || isRecording || isAnalyzing}
            size={76}
            idleBackgroundColor="#FFFFFF"
            idleBorderColor="#E2E8F0"
            activeBackgroundColor="#FFFFFF"
            activeBorderColor="#E2E8F0"
            glowColor="#2997FF"
            iconColor="#0F172A"
            activeIconColor="#2997FF"
            onPress={() => onPlayWord(itemWord)}
          />

          <View style={styles.micContainer}>
            {analysisError ? (
              <Text style={[styles.pronunciationQuizError, { color: palette.errorText }]}>
                {analysisError}
              </Text>
            ) : null}

            <View ref={micRef} collapsable={false}>
            <SiriVoiceWaveButton
              isRecording={isRecording}
              isAnalyzing={isAnalyzing}
              metering={recordingMetering ?? waveformValues[0]}
              disabled={!isActiveCard || isAnalyzing}
              pressedStyle={
                isActiveCard && !isAnalyzing
                  ? styles.pronunciationButtonPressed
                  : null
              }
              idleBackgroundColor={feedback.mic}
              idleBorderColor={feedback.mic}
              activeBackgroundColor={feedback.mic}
              activeBorderColor={feedback.mic}
              glowColor={feedback.mic}
              iconColor="#FFFFFF"
              activeBarColor="#FFFFFF"
              inactiveBarColor="#FFFFFF"
              size={144}
              onPress={onPrimaryAction}
            />
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.frontCloseButton,
              {
                backgroundColor: palette.softButtonBg,
                borderColor: palette.softButtonBorder,
              },
              pressed ? styles.secondaryButtonPressed : null,
            ]}
            onPress={onClose}
          >
            <Text style={[styles.closeButtonText, { color: palette.primaryText }]}>
              {tUI(uiLanguage, 'common.close')}
            </Text>
          </Pressable>
        </Animated.View>

        <Animated.View
          pointerEvents={showResult ? 'auto' : 'none'}
          style={[
            styles.cardFace,
            styles.backFace,
            showResult ? styles.cardFaceRelative : styles.cardFaceAbsolute,
            {
              backgroundColor: palette.cardBg,
              borderColor: palette.cardBorder,
              opacity: backOpacity,
            },
          ]}
        >
          <View style={styles.resultContent}>
            <View ref={ringRef} collapsable={false} style={styles.scoreRingSlot}>
              {pronunciationScore !== null ? (
                <ScoreRing
                  score={pronunciationScore}
                  progress={ringProgress}
                  color={passed ? feedback.ok : feedback.bad}
                  trackColor={feedback.track}
                  textColor={palette.primaryText}
                />
              ) : null}
            </View>

            <Animated.View style={[styles.resultWordRow, wordRevealStyle]}>
              <Text
                style={[
                  styles.answerWord,
                  styles.resultWord,
                  { color: palette.primaryText },
                  itemWord.length > 16
                    ? styles.answerWordSmall
                    : itemWord.length > 10
                    ? styles.answerWordMedium
                    : null,
                ]}
                numberOfLines={2}
              >
                {weakLetterRange ? (
                  <>
                    {itemWord.slice(0, weakLetterRange.start)}
                    <Text
                      style={[
                        styles.weakLetters,
                        { color: weakLetterColor, textDecorationColor: weakLetterColor },
                      ]}
                    >
                      {itemWord.slice(weakLetterRange.start, weakLetterRange.end)}
                    </Text>
                    {itemWord.slice(weakLetterRange.end)}
                  </>
                ) : (
                  itemWord
                )}
              </Text>

              <SiriSpeakerButton
                isPlaying={isWordPlaying}
                isLoading={isWordDownloading}
                disabled={playbackBusy}
                size={44}
                idleBackgroundColor={palette.softButtonBg}
                idleBorderColor={palette.softButtonBorder}
                activeBackgroundColor={palette.softButtonBg}
                activeBorderColor={palette.softButtonBorder}
                glowColor={feedback.brand}
                iconColor={palette.primaryText}
                activeIconColor={feedback.brand}
                onPress={() => onPlayWord(itemWord)}
              />
            </Animated.View>

            {showPhonemes ? (
              <PronunciationPhonemeSectionUI
                items={phonemeSectionItems}
                uiLanguage={uiLanguage}
                primaryTextColor={palette.primaryText}
                secondaryTextColor={palette.secondaryText}
                surfaceColor={palette.phonemeSurface}
                borderColor={palette.phonemeBorder}
                accentColor={feedback.brand}
                staggerIn={staggerChips}
                staggerBaseDelayMs={RESULT_IN_AT_MS - 160}
                onPressItem={(item) => {
                  const audioTarget = getIpaPhonemeAudioTarget(item.value);
                  if (audioTarget) setActiveIpaTarget(audioTarget);
                  onPlayIpaPhoneme?.(item.value);
                }}
              />
            ) : null}
          </View>

          <Animated.View style={[styles.answerActionFooter, footerRevealStyle]}>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.retryButton,
                {
                  backgroundColor: palette.softButtonBg,
                  borderColor: palette.softButtonBorder,
                },
                pressed ? styles.secondaryButtonPressed : null,
              ]}
              onPress={handleRetryPress}
            >
              <Ionicons name="refresh" size={18} color={palette.primaryText} />
              <Text style={[styles.retryButtonText, { color: palette.primaryText }]}>
                {tUI(uiLanguage, 'review.playAgain')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.resultCloseButton,
                {
                  backgroundColor: feedback.brand,
                  borderColor: feedback.brand,
                },
                pressed ? styles.secondaryButtonPressed : null,
              ]}
              onPress={onClose}
            >
              <Text style={[styles.closeButtonText, { color: feedback.onBrand }]}>
                {tUI(uiLanguage, 'common.close')}
              </Text>
            </Pressable>
          </Animated.View>
        </Animated.View>

        {morph ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.morphCircle,
              {
                left: morph.left,
                top: morph.top,
                width: morph.size,
                height: morph.size,
                borderRadius: morph.size / 2,
                backgroundColor: feedback.mic,
                shadowColor: feedback.mic,
                opacity: morphOpacity,
                transform: [
                  {
                    translateX: morphProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, morph.dx],
                    }),
                  },
                  {
                    translateY: morphProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, morph.dy],
                    }),
                  },
                  {
                    scale: morphProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, morph.scale],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 540,
    backgroundColor: 'transparent',
  },
  cardShell: {
    width: '100%',
    minHeight: 540,
    position: 'relative',
  },
  cardFace: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
    minHeight: 540,
    backfaceVisibility: 'hidden',
  },
  cardFaceAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardFaceRelative: {
    position: 'relative',
    minHeight: 540,
  },
  frontFace: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  micContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frontCloseButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  backFace: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  questionWord: {
    fontSize: 31,
    lineHeight: 40,
    fontWeight: '700',
    textAlign: 'center',
  },
  questionWordMedium: {
    fontSize: 26,
    lineHeight: 34,
  },
  questionWordSmall: {
    fontSize: 21,
    lineHeight: 28,
  },
  pronunciationQuizError: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  pronunciationButtonPressed: {
    opacity: 0.9,
    borderColor: '#4EAFF4',
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  resultContent: {
    width: '100%',
    minHeight: 0,
    alignItems: 'center',
    gap: 12,
  },
  answerWord: {
    fontSize: 31,
    lineHeight: 40,
    fontWeight: '700',
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  answerWordMedium: {
    fontSize: 26,
    lineHeight: 34,
  },
  answerWordSmall: {
    fontSize: 21,
    lineHeight: 28,
  },
  answerScore: {
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '900',
    alignSelf: 'stretch',
  },
  ipaRecovery: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 9,
  },
  ipaRecoveryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  ipaRecoveryButton: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
  },
  ipaRecoveryButtonText: {
    fontSize: 14,
    fontWeight: '900',
  },
  answerActionFooter: {
    width: '100%',
    flexShrink: 0,
    paddingTop: 12,
    gap: 8,
  },
  retryButton: {
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '900',
  },
  resultCloseButton: {
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonPressed: {
    opacity: 0.82,
  },
  scoreRingSlot: {
    width: RING_SIZE,
    height: RING_SIZE,
    marginTop: 8,
  },
  scoreRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRingSvg: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ rotate: '-90deg' }],
  },
  scoreRingText: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  resultWordRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  resultWord: {
    alignSelf: 'auto',
    flexShrink: 1,
  },
  weakLetters: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  },
  morphCircle: {
    position: 'absolute',
    zIndex: 10,
    elevation: 10,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
});
