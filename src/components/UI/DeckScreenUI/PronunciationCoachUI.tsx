import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';
import type { UILanguage } from '../../../services/settings/userSettings';
import { tUI } from '../../../i18n/uiLanguage';
import {
  formatIpaPhoneme,
  getIpaPhonemeAudioTarget,
  getIpaSymbol,
} from '../../../services/pronunciation/ipaPhonemes';
import AnimatedGlowPressable from '../shared/AnimatedGlowPressable';
import PronunciationPhonemeSectionUI from './PronunciationPhonemeSectionUI';

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
  const flipProgress = React.useRef(new Animated.Value(showResult ? 1 : 0)).current;
  const [isFlipping, setIsFlipping] = React.useState(false);
  const [activeIpaTarget, setActiveIpaTarget] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (reduceMotion) {
      flipProgress.setValue(showResult ? 1 : 0);
      setIsFlipping(false);
      return;
    }
    setIsFlipping(true);
    Animated.timing(flipProgress, {
      toValue: showResult ? 1 : 0,
      duration: 380,
      useNativeDriver: true,
    }).start(() => {
      setIsFlipping(false);
    });
  }, [flipProgress, reduceMotion, showResult]);

  React.useEffect(() => {
    if (!activeIpaTarget) return;
    if (downloadingPronunciationTarget === activeIpaTarget) return;
    const timer = setTimeout(() => {
      setActiveIpaTarget((current) => (current === activeIpaTarget ? null : current));
    }, 700);
    return () => clearTimeout(timer);
  }, [activeIpaTarget, downloadingPronunciationTarget]);

  const frontRotate = flipProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backRotate = flipProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });
  const wordDownloadTarget = itemWord.trim() ? `word:${itemWord.trim()}` : null;
  const isWordDownloading = Boolean(
    wordDownloadTarget &&
      downloadingPronunciationTarget === wordDownloadTarget
  );
  const playbackBusy = isWordDownloading || isWordPlaying;
  const showScore = pronunciationScore !== null && resultRevealStep >= 1;
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
      <View style={styles.cardShell}>
        <Animated.View
          pointerEvents={showResult ? 'none' : 'auto'}
          style={[
            styles.cardFace,
            styles.frontFace,
            showResult ? styles.cardFaceAbsolute : styles.cardFaceRelative,
            {
              backgroundColor: palette.cardBg,
              borderColor: palette.cardBorder,
              display: !isFlipping && showResult ? 'none' : 'flex',
            },
            isFlipping
              ? { transform: [{ perspective: 1200 }, { rotateY: frontRotate }] }
              : null,
          ]}
        >
          <Text style={[styles.questionEyebrow, { color: palette.secondaryText }]}>
            {tUI(uiLanguage, 'review.prompt.pronounceWord').toUpperCase()}
          </Text>
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

          <View style={styles.pronunciationQuizPanel}>
            <AnimatedGlowPressable
              accessibilityRole="button"
              accessibilityLabel={tUI(uiLanguage, 'review.playPronunciation')}
              active={playbackBusy}
              style={styles.pronunciationWordButton}
              pressedStyle={!playbackBusy ? styles.pronunciationButtonPressed : null}
              idleBackgroundColor={palette.softButtonBg}
              idleBorderColor={palette.softButtonBorder}
              disabled={!isActiveCard || playbackBusy || isRecording || isAnalyzing}
              onPress={() => onPlayWord(itemWord)}
            >
              {isWordDownloading ? (
                <ActivityIndicator size="small" color="#4EAFF4" />
              ) : (
                <Ionicons
                  name="volume-medium-outline"
                  size={40}
                  color={isWordPlaying ? '#BFE7FF' : palette.primaryText}
                />
              )}
            </AnimatedGlowPressable>

            <Text style={[styles.pronunciationQuizHint, { color: palette.secondaryText }]}>
              {tUI(uiLanguage, 'review.pronunciationHint')}
            </Text>

            {analysisError ? (
              <Text style={[styles.pronunciationQuizError, { color: palette.errorText }]}>
                {analysisError}
              </Text>
            ) : null}

            <View
              pointerEvents="none"
              style={[
                styles.pronunciationRecordingWaveRow,
                !isRecording ? styles.pronunciationRecordingWaveRowIdle : null,
              ]}
            >
              {waveformValues.map((value, index) => (
                <Animated.View
                  key={`coach-wave-${index}`}
                  style={[
                    styles.pronunciationRecordingWaveBar,
                    { height: value, backgroundColor: '#4EAFF4' },
                  ]}
                />
              ))}
            </View>

            <AnimatedGlowPressable
              accessibilityRole="button"
              active={isRecording}
              style={styles.pronunciationQuizButton}
              pressedStyle={
                isActiveCard && !isAnalyzing
                  ? styles.pronunciationButtonPressed
                  : null
              }
              idleBackgroundColor={palette.nextButtonBg}
              idleBorderColor={palette.nextButtonBg}
              disabled={!isActiveCard || isAnalyzing}
              onPress={onPrimaryAction}
            >
              {isAnalyzing ? (
                <ActivityIndicator size="small" color={palette.nextButtonText} />
              ) : (
                <Ionicons
                  name={isRecording ? 'stop' : 'mic'}
                  size={30}
                  color={isRecording ? '#BFE7FF' : palette.nextButtonText}
                />
              )}
            </AnimatedGlowPressable>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.closeButton,
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
          </View>
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
              display: !isFlipping && !showResult ? 'none' : 'flex',
            },
            isFlipping
              ? { transform: [{ perspective: 1200 }, { rotateY: backRotate }] }
              : null,
          ]}
        >
          <View style={styles.resultContent}>
            <View
              style={[
                styles.resultTag,
                {
                  backgroundColor: passed
                    ? palette.successTint
                    : palette.errorTint,
                  borderColor: passed
                    ? palette.successText
                    : palette.errorText,
                },
              ]}
            >
              <Ionicons
                name={passed ? 'checkmark' : 'close'}
                size={12}
                color={passed ? palette.successText : palette.errorText}
              />
              <Text
                style={[
                  styles.resultTagText,
                  {
                    color: passed
                      ? palette.successText
                      : palette.errorText,
                  },
                ]}
              >
                {tUI(
                  uiLanguage,
                  passed ? 'pronunciation.pass' : 'pronunciation.fail'
                )}
              </Text>
            </View>

            <Text
              style={[
                styles.answerWord,
                { color: palette.primaryText },
                itemWord.length > 16
                  ? styles.answerWordSmall
                  : itemWord.length > 10
                  ? styles.answerWordMedium
                  : null,
              ]}
              numberOfLines={2}
            >
              {itemWord}
            </Text>

            {showScore ? (
              <Text
                style={[
                  styles.answerScore,
                  {
                    color: passed
                      ? palette.successText
                      : palette.errorText,
                  },
                ]}
              >
                {pronunciationScore}%
              </Text>
            ) : null}

            <AnimatedGlowPressable
              accessibilityRole="button"
              accessibilityLabel={tUI(uiLanguage, 'review.playPronunciation')}
              active={playbackBusy}
              style={styles.pronunciationAnswerWordButton}
              pressedStyle={!playbackBusy ? styles.pronunciationButtonPressed : null}
              idleBackgroundColor={palette.softButtonBg}
              idleBorderColor={palette.softButtonBorder}
              disabled={playbackBusy}
              onPress={() => onPlayWord(itemWord)}
            >
              {isWordDownloading ? (
                <ActivityIndicator size="small" color="#4EAFF4" />
              ) : (
                <Ionicons
                  name="volume-medium-outline"
                  size={28}
                  color={isWordPlaying ? '#BFE7FF' : palette.primaryText}
                />
              )}
            </AnimatedGlowPressable>

            {showPhonemes ? (
              <PronunciationPhonemeSectionUI
                items={phonemeSectionItems}
                uiLanguage={uiLanguage}
                primaryTextColor={palette.primaryText}
                secondaryTextColor={palette.secondaryText}
                surfaceColor={palette.phonemeSurface}
                borderColor={palette.phonemeBorder}
                onPressItem={(item) => {
                  const audioTarget = getIpaPhonemeAudioTarget(item.value);
                  if (audioTarget) setActiveIpaTarget(audioTarget);
                  onPlayIpaPhoneme?.(item.value);
                }}
              />
            ) : null}
          </View>

          <View style={styles.answerActionFooter}>
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
              onPress={onReset}
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
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 480,
    backgroundColor: 'transparent',
  },
  cardShell: {
    width: '100%',
    position: 'relative',
  },
  cardFace: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
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
    minHeight: 480,
  },
  frontFace: {
    justifyContent: 'space-between',
  },
  backFace: {
    justifyContent: 'flex-start',
  },
  questionEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  questionWord: {
    flex: 1,
    marginTop: 18,
    fontSize: 31,
    lineHeight: 40,
    fontWeight: '700',
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  questionWordMedium: {
    fontSize: 26,
    lineHeight: 34,
  },
  questionWordSmall: {
    fontSize: 21,
    lineHeight: 28,
  },
  pronunciationQuizPanel: {
    flexShrink: 1,
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pronunciationWordButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pronunciationQuizHint: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  pronunciationQuizError: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  pronunciationRecordingWaveRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginVertical: 2,
  },
  pronunciationRecordingWaveRowIdle: {
    opacity: 0,
  },
  pronunciationRecordingWaveBar: {
    width: 5,
    borderRadius: 999,
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.36,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  pronunciationQuizButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00E5FF',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  closeButton: {
    width: '86%',
    minHeight: 44,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
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
  resultTag: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resultTagText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  answerWord: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    alignSelf: 'stretch',
  },
  answerWordMedium: {
    fontSize: 28,
    lineHeight: 34,
  },
  answerWordSmall: {
    fontSize: 22,
    lineHeight: 28,
  },
  answerScore: {
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '900',
    alignSelf: 'stretch',
  },
  pronunciationAnswerWordButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
});
