import React from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { resolveThemeColors } from '../../../theme/colors';

type PhonemeChip = {
  phoneme: string;
  letters?: string;
  accuracy?: number | null;
  spokenPhoneme?: string | null;
};

type Props = {
  isActiveCard: boolean;
  isRecording: boolean;
  hasRecorded: boolean;
  showFeedback: boolean;
  isAnalyzing: boolean;
  analysisError?: string | null;
  resultRevealStep?: number;
  pronunciationScore: number | null;
  pronunciationFeedbackLines: string[];
  phonemeChips: PhonemeChip[];
  phoneticTranscription?: string | null;
  syllableRowPattern?: number[];
  waveformValues: Animated.Value[];
  itemWord: string;
  downloadingPronunciationTarget?: string | null;
  onPlayWord: (word: string) => void;
  onPlaySyllable: (syllable: string) => void;
  onReset: () => void;
  onPrimaryAction: () => void;
};

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
  phoneticTranscription,
  syllableRowPattern,
  waveformValues,
  itemWord,
  downloadingPronunciationTarget,
  onPlayWord,
  onPlaySyllable,
  onReset,
  onPrimaryAction,
}: Props) {
  const colorScheme = useColorScheme();
  const isLight = colorScheme === 'light';
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const BLOCK_BASE = React.useMemo(
    () => ({
      paddingVertical: 20,
      labelFontSize: 20,
      labelLineHeight: 22,
      scoreFontSize: 25,
      scoreLineHeight: 42,
    }),
    []
  );
  const getRowScale = React.useCallback((count: number) => {
    if (count <= 1) return 1.2;
    if (count === 2) return 1.0;
    return 0.84;
  }, []);
  const ghostStatusTexts = React.useMemo(
    () => [
      'Listening to waveform...',
      'Mapping phonemes...',
      'Comparing native timing...',
      'Scoring pronunciation...',
    ],
    []
  );
  const [ghostStatusIndex, setGhostStatusIndex] = React.useState(0);
  React.useEffect(() => {
    if (!isAnalyzing) {
      setGhostStatusIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setGhostStatusIndex((current) => (current + 1) % ghostStatusTexts.length);
    }, 1550);
    return () => clearInterval(timer);
  }, [ghostStatusTexts.length, isAnalyzing]);
  const scoreColor =
    pronunciationScore == null
      ? isLight
        ? '#64748B'
        : '#94A3B8'
      : pronunciationScore >= 85
        ? '#4EAFF4'
        : pronunciationScore >= 60
          ? isLight
            ? '#334155'
            : '#F8FAFC'
          : '#FF6B6B';
  const scoreSemanticTextColor =
    pronunciationScore == null
      ? isLight
        ? '#64748B'
        : '#CBD5E1'
      : pronunciationScore >= 85
        ? isLight
          ? '#0369A1'
          : '#BFE7FF'
        : pronunciationScore >= 60
          ? isLight
            ? '#334155'
            : '#F8FAFC'
          : '#FFD0D0';
  const waveformTone = isRecording ? '#4EAFF4' : isAnalyzing ? '#94A3B8' : isLight ? '#64748B' : '#475569';
  const wordDownloadTarget = itemWord.trim() ? `word:${itemWord.trim()}` : null;
  const isWordDownloading = Boolean(wordDownloadTarget && downloadingPronunciationTarget === wordDownloadTarget);
  const phonemeRows = React.useMemo(() => {
    const chips = phonemeChips || [];
    const n = chips.length;
    if (n <= 0) return [] as PhonemeChip[][];

    if (syllableRowPattern && syllableRowPattern.length > 0) {
      const rows: PhonemeChip[][] = [];
      let cursor = 0;
      for (const takeRaw of syllableRowPattern) {
        const take = Math.max(0, Math.floor(takeRaw));
        if (take <= 0) continue;
        if (cursor >= n) break;
        rows.push(chips.slice(cursor, cursor + take));
        cursor += take;
      }
      if (cursor < n) {
        rows.push(chips.slice(cursor));
      }
      return rows.filter((row) => row.length > 0);
    }

    // 每個單字一列：把 phoneme 依 target phrase 的單字數分配到各列
    const words = (itemWord || '')
      .trim()
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean);
    const wordCount = Math.max(1, words.length);
    if (wordCount === 1) return [chips];

    const rows: PhonemeChip[][] = Array.from({ length: wordCount }, () => []);
    const minTake = Math.min(wordCount, n);
    let cursor = 0;
    for (let i = 0; i < minTake; i += 1) {
      rows[i].push(chips[cursor]);
      cursor += 1;
    }

    const weightBase = words.map((w) => Math.max(1, w.length));
    const weightTotal = weightBase.reduce((sum, v) => sum + v, 0);
    while (cursor < n) {
      let bestIdx = 0;
      let bestLoad = Number.POSITIVE_INFINITY;
      for (let i = 0; i < wordCount; i += 1) {
        const targetShare = weightBase[i] / weightTotal;
        const load = rows[i].length / targetShare;
        if (load < bestLoad) {
          bestLoad = load;
          bestIdx = i;
        }
      }
      rows[bestIdx].push(chips[cursor]);
      cursor += 1;
    }
    return rows.filter((row) => row.length > 0);
  }, [itemWord, phonemeChips, syllableRowPattern]);
  const ipaPreviewText = React.useMemo(() => {
    const direct = (phoneticTranscription || '').trim();
    if (direct) return direct;
    const chips = (phonemeChips || [])
      .map((chip) => (chip.phoneme || '').trim())
      .filter(Boolean);
    if (chips.length > 0) return chips.join(' ');
    return 'Record to reveal IPA phonemes';
  }, [phonemeChips, phoneticTranscription]);
  const hasResultContent = pronunciationScore !== null || phonemeRows.length > 0 || pronunciationFeedbackLines.length > 0;
  const isReviewState = isActiveCard && hasRecorded && hasResultContent && !isRecording && !isAnalyzing;
  const showLoadingState = isActiveCard && isAnalyzing;
  const showFailState = isActiveCard && Boolean(analysisError) && !isRecording && !isAnalyzing;
  const showScoreResult = pronunciationScore !== null && resultRevealStep >= 1;
  const showPhonemeResult = phonemeRows.length > 0 && resultRevealStep >= 2;
  const showSummaryResult = pronunciationFeedbackLines.length > 0 && resultRevealStep >= 3;
  const showRevealPreparingState = isActiveCard && hasResultContent && !isRecording && !isAnalyzing && resultRevealStep <= 0;
  const showIntroState =
    isActiveCard &&
    !isRecording &&
    !isAnalyzing &&
    !analysisError &&
    !hasResultContent &&
    !showRevealPreparingState;
  const buttonBg = !isActiveCard
    ? isLight
      ? '#CBD5E1'
      : '#334155'
    : isAnalyzing
      ? '#64748B'
      : isRecording
        ? '#FF6B6B'
        : isReviewState
          ? isLight
            ? 'rgba(15,23,42,0.10)'
            : 'rgba(148,163,184,0.18)'
          : '#4EAFF4';
  const buttonIconName: keyof typeof Ionicons.glyphMap = isAnalyzing
    ? 'hourglass-outline'
    : isRecording
      ? 'stop'
      : isReviewState
        ? 'refresh'
        : 'mic';
  const speakerDisabled = !isActiveCard || isWordDownloading || isRecording || isAnalyzing;
  const speakerIconColor = isReviewState
    ? '#F8FAFC'
    : isLight
      ? palette.textOnContainer
      : '#CBD5E1';
  const handlePrimaryPress = () => {
    if (!isActiveCard || isAnalyzing) return;
    if (isReviewState) {
      onReset();
      return;
    }
    onPrimaryAction();
  };
  const renderWaveform = React.useCallback(
    (variant: 'panel' | 'resting') => {
      const isPanel = variant === 'panel';
      return (
        <View style={[styles.waveLineWrap, isPanel ? styles.waveLineWrapPanel : null]}>
          <View
            style={[
              styles.waveGlow,
              isRecording ? styles.waveGlowActive : null,
              isLight ? { backgroundColor: 'rgba(78,175,244,0.10)' } : null,
              isPanel ? styles.waveGlowPanel : null,
            ]}
          />
          <View style={[styles.waveLineBase, isLight ? { backgroundColor: 'rgba(15,23,42,0.14)' } : null]} />
          <View style={[styles.waveBarsRow, isPanel ? styles.waveBarsRowPanel : null]}>
            {waveformValues.map((value, i) => {
              const idleHeight = 2;
              return (
                <Animated.View
                  key={`wave-${variant}-${i}`}
                  style={[
                    styles.waveBar,
                    isPanel ? styles.waveBarPanel : null,
                    {
                      height: isActiveCard && isRecording ? value : idleHeight,
                      opacity: isActiveCard && isRecording ? 0.98 : isAnalyzing ? 0.28 : 0.18,
                      backgroundColor: waveformTone,
                      shadowColor: isActiveCard && isRecording ? '#4EAFF4' : '#000000',
                      shadowOpacity: isActiveCard && isRecording ? 0.42 : 0,
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>
      );
    },
    [isActiveCard, isAnalyzing, isLight, isRecording, waveformTone, waveformValues]
  );

  return (
    <View
      style={[styles.root, !isActiveCard && styles.inactive]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
    >
      <View style={[styles.resultsPanel, showIntroState ? styles.resultsPanelCompact : null]}>
        {isRecording ? (
          <Reanimated.View
            key="recording-wave-panel"
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(180)}
            style={styles.recordingPanel}
          >
            <BlurView
              pointerEvents="none"
              intensity={isLight ? 18 : 28}
              tint={isLight ? 'light' : 'dark'}
              style={styles.crossBlurLayer}
            />
            <Text style={[styles.recordingEyebrow, isLight ? { color: '#0369A1' } : null]}>Listening</Text>
            <Text style={[styles.recordingWord, isLight ? { color: '#0F172A' } : null]}>{itemWord}</Text>
            {renderWaveform('panel')}
          </Reanimated.View>
        ) : showLoadingState || showRevealPreparingState ? (
          <Reanimated.View
            key="analysis-ghost-panel"
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(180)}
            style={styles.analysisGhostPanel}
          >
            <BlurView
              pointerEvents="none"
              intensity={isLight ? 12 : 18}
              tint={isLight ? 'light' : 'dark'}
              style={styles.crossBlurLayer}
            />
            <View style={styles.ghostScoreSlot}>
              <Text style={[styles.ghostScoreText, isLight ? { color: 'rgba(15,23,42,0.16)' } : null]}>--%</Text>
            </View>
            <View style={styles.ghostPhonemeRow}>
              {[0, 1, 2].map((item) => (
                <View
                  key={`ghost-phoneme-${item}`}
                  style={[
                    styles.ghostPhonemeBlock,
                    isLight
                      ? {
                          backgroundColor: 'rgba(15,23,42,0.04)',
                          borderColor: 'rgba(15,23,42,0.08)',
                        }
                      : null,
                  ]}
                />
              ))}
            </View>
            <Reanimated.Text
              key={ghostStatusTexts[ghostStatusIndex]}
              entering={FadeIn.duration(260)}
              exiting={FadeOut.duration(180)}
              style={[styles.analysisGhostStatus, isLight ? { color: '#64748B' } : null]}
            >
              {showRevealPreparingState ? 'Preparing score...' : ghostStatusTexts[ghostStatusIndex]}
            </Reanimated.Text>
          </Reanimated.View>
        ) : showFailState ? (
          <Reanimated.View
            key="analysis-fail-panel"
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(180)}
            style={styles.analysisStatePanel}
          >
            <View style={[styles.analysisStateIcon, styles.analysisStateIconError]}>
              <Ionicons name="warning-outline" size={22} color="#FF6B6B" />
            </View>
            <Text style={[styles.analysisStateTitle, isLight ? { color: '#0F172A' } : null]}>
              Analysis failed
            </Text>
            <Text style={[styles.analysisStateBody, isLight ? { color: '#64748B' } : null]}>
              {analysisError}
            </Text>
            <Text style={[styles.analysisStateHint, isLight ? { color: '#0369A1' } : null]}>
              Tap the mic below to try again.
            </Text>
          </Reanimated.View>
        ) : hasResultContent ? (
          <Reanimated.View key="analysis-result-panel" entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)}>
            {showScoreResult ? (
              <Reanimated.Text entering={FadeIn.duration(220)} style={[styles.centerScore, { color: scoreColor }]}>
                {pronunciationScore}%
              </Reanimated.Text>
            ) : null}

            {showPhonemeResult ? <View style={styles.syllableBlocksWrap}>
              {phonemeRows.map((row, rowIndex) => (
                <Reanimated.View key={`row-${rowIndex}`} entering={FadeIn.duration(220).delay(rowIndex * 70)} style={styles.syllableRow}>
                  {row.map((chip, idx) => {
                    const rowScale = getRowScale(row.length);
                    const dynPaddingVertical = Math.round(BLOCK_BASE.paddingVertical * rowScale);
                    const dynLabelFontSize = Math.round(BLOCK_BASE.labelFontSize * rowScale);
                    const dynLabelLineHeight = Math.round(BLOCK_BASE.labelLineHeight * rowScale);
                    const dynScoreFontSize = Math.round(BLOCK_BASE.scoreFontSize * rowScale);
                    const dynScoreLineHeight = Math.round(BLOCK_BASE.scoreLineHeight * rowScale);
                    const chipScore =
                      typeof chip.accuracy === 'number' && Number.isFinite(chip.accuracy) ? chip.accuracy : null;
                    const displayText = (chip.letters || chip.phoneme || '').trim() || `Part ${idx + 1}`;
                    const pronunciationText = (chip.spokenPhoneme || chip.phoneme || chip.letters || '').trim();
                    const isSyllableDownloading =
                      Boolean(pronunciationText) && downloadingPronunciationTarget === `syllable:${pronunciationText}`;
                    return (
                      <Pressable
                        key={`${chip.phoneme}-${rowIndex}-${idx}`}
                        disabled={!isActiveCard || !pronunciationText}
                        onPress={() => onPlaySyllable(pronunciationText)}
                        style={({ pressed }) => [
                          styles.syllableBlock,
                          { paddingVertical: dynPaddingVertical },
                          isLight
                            ? {
                                backgroundColor: '#F8FAFC',
                                borderColor: palette.borderSubtle,
                              }
                            : null,
                          isSyllableDownloading
                            ? [
                                styles.syllableBlockDownloading,
                                {
                                  backgroundColor: isLight ? 'rgba(78,175,244,0.12)' : 'rgba(78,175,244,0.14)',
                                  borderColor: '#4EAFF4',
                                },
                              ]
                            : null,
                          pressed
                            ? [
                                styles.syllableBlockPressed,
                                {
                                  backgroundColor: isLight ? 'rgba(78,175,244,0.16)' : 'rgba(78,175,244,0.18)',
                                  borderColor: '#4EAFF4',
                                },
                              ]
                            : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.syllableBlockLabel,
                            {
                              color: scoreSemanticTextColor,
                              fontSize: dynLabelFontSize,
                              lineHeight: dynLabelLineHeight,
                            },
                          ]}
                        >
                          {displayText}
                        </Text>
                        <View style={[styles.syllableBlockScoreSlot, { minHeight: dynScoreLineHeight }]}>
                          {isSyllableDownloading ? (
                            <ActivityIndicator size="small" color="#4EAFF4" />
                          ) : (
                            <Text
                              style={[
                                styles.syllableBlockScore,
                                {
                                  fontSize: dynScoreFontSize,
                                  lineHeight: dynScoreLineHeight,
                                  color:
                                    chipScore === null
                                      ? isLight
                                        ? '#94A3B8'
                                        : '#64748B'
                                      : chipScore >= 85
                                      ? '#4EAFF4'
                                      : chipScore >= 60
                                        ? isLight
                                          ? '#334155'
                                          : '#F8FAFC'
                                        : '#FF6B6B',
                                },
                              ]}
                            >
                              {chipScore === null ? '—' : `${Math.round(chipScore)}%`}
                            </Text>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </Reanimated.View>
              ))}
            </View> : null}

            {showSummaryResult ? (
              <Reanimated.Text entering={FadeIn.duration(220)} style={[styles.summaryHint, { color: scoreSemanticTextColor }]}>
                {pronunciationFeedbackLines[0]}
              </Reanimated.Text>
            ) : null}
          </Reanimated.View>
        ) : showIntroState ? (
          <Reanimated.View
            key="pronunciation-intro-panel"
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(180)}
            style={[
              styles.introPanel,
              isLight
                ? {
                    backgroundColor: 'rgba(78,175,244,0.08)',
                    borderColor: 'rgba(78,175,244,0.18)',
                  }
                : null,
            ]}
          >
            <BlurView
              pointerEvents="none"
              intensity={isLight ? 10 : 16}
              tint={isLight ? 'light' : 'dark'}
              style={styles.crossBlurLayer}
            />
            <Text style={[styles.introEyebrow, isLight ? { color: '#0369A1' } : null]}>Pronunciation coach</Text>
            <Text style={[styles.introWord, isLight ? { color: '#0F172A' } : null]}>{itemWord}</Text>
            <Text style={[styles.introBody, isLight ? { color: '#64748B' } : null]}>
              {ipaPreviewText}
            </Text>
          </Reanimated.View>
        ) : null}
      </View>

      <View style={styles.audioControlCenter}>
        <View style={[styles.restingWaveSlot, isRecording ? styles.restingWaveSlotRecording : styles.restingWaveSlotIdle]}>
          {isRecording ? renderWaveform('resting') : null}
        </View>

        <View style={styles.controlsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryCircle,
              isRecording ? styles.primaryCircleRecording : null,
              isReviewState ? styles.primaryCircleReview : null,
              {
                backgroundColor: buttonBg,
                borderColor: isReviewState
                  ? isLight
                    ? palette.borderSubtle
                    : 'rgba(148,163,184,0.28)'
                  : isRecording
                    ? '#4EAFF4'
                  : 'transparent',
              },
              pressed && isActiveCard && !isAnalyzing ? styles.primaryCirclePressed : null,
            ]}
            onPress={handlePrimaryPress}
            disabled={!isActiveCard || isAnalyzing}
          >
            {isAnalyzing ? (
              <ActivityIndicator size="small" color="#F8FAFC" />
            ) : (
              <Ionicons
                name={buttonIconName}
                size={isReviewState ? 20 : 25}
                color={isReviewState ? (isLight ? '#64748B' : '#CBD5E1') : '#F8FAFC'}
              />
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.playWordBtn,
              styles.controlSpeakerBtn,
              isReviewState ? styles.controlSpeakerBtnReview : null,
              isLight
                ? {
                    backgroundColor: isReviewState ? '#4EAFF4' : 'rgba(78,175,244,0.10)',
                    borderColor: palette.borderSubtle,
                  }
                : null,
              isRecording ? styles.controlSpeakerBtnHidden : null,
              pressed
                ? [
                    styles.controlSpeakerBtnPressed,
                    {
                      backgroundColor: isLight ? 'rgba(78,175,244,0.18)' : 'rgba(78,175,244,0.16)',
                      borderColor: '#4EAFF4',
                    },
                  ]
                : null,
              isWordDownloading
                ? [
                    styles.controlSpeakerBtnDownloading,
                    {
                      backgroundColor: isLight ? 'rgba(78,175,244,0.16)' : 'rgba(78,175,244,0.18)',
                      borderColor: '#4EAFF4',
                    },
                  ]
                : null,
            ]}
            disabled={speakerDisabled}
            onPress={() => onPlayWord(itemWord)}
          >
            {isWordDownloading ? (
              <ActivityIndicator size="small" color="#4EAFF4" />
            ) : (
              <Ionicons name="volume-medium-outline" size={isReviewState ? 23 : 20} color={speakerIconColor} />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 2,
    paddingTop: 2,
    minHeight: 384,
  },
  inactive: {
    opacity: 0.7,
  },
  resultsPanel: {
    height: 206,
    justifyContent: 'flex-start',
  },
  resultsPanelCompact: {
    height: 156,
  },
  crossBlurLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    opacity: 0.42,
  },
  introPanel: {
    minHeight: 146,
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: 'rgba(30,41,59,0.34)',
    borderColor: 'rgba(148,163,184,0.14)',
    paddingHorizontal: 20,
    paddingVertical: 18,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  introEyebrow: {
    color: '#BFE7FF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  introWord: {
    marginTop: 8,
    color: '#F8FAFC',
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '900',
  },
  introBody: {
    marginTop: 10,
    color: '#94A3B8',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
  },
  recordingPanel: {
    minHeight: 192,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(78,175,244,0.24)',
    backgroundColor: 'rgba(78,175,244,0.08)',
    paddingHorizontal: 14,
    paddingTop: 16,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  recordingEyebrow: {
    color: '#BFE7FF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  recordingWord: {
    marginTop: 5,
    color: '#F8FAFC',
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  analysisGhostPanel: {
    minHeight: 192,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
    borderRadius: 24,
  },
  ghostScoreSlot: {
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostScoreText: {
    color: 'rgba(148,163,184,0.20)',
    fontSize: 52,
    lineHeight: 56,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  ghostPhonemeRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  ghostPhonemeBlock: {
    flex: 1,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    backgroundColor: 'rgba(30,41,59,0.38)',
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  analysisGhostStatus: {
    marginTop: 12,
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    letterSpacing: 0.35,
    opacity: 0.68,
    textAlign: 'center',
  },
  analysisStatePanel: {
    minHeight: 192,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  analysisStateIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(78,175,244,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(78,175,244,0.34)',
  },
  analysisStateIconLight: {
    backgroundColor: 'rgba(78,175,244,0.10)',
    borderColor: 'rgba(78,175,244,0.26)',
  },
  analysisStateIconError: {
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderColor: 'rgba(255,107,107,0.34)',
  },
  analysisStateTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  analysisStateBody: {
    marginTop: 8,
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  analysisStateHint: {
    marginTop: 10,
    color: '#BFE7FF',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  audioControlCenter: {
    marginTop: 10,
    alignItems: 'center',
    gap: 6,
  },
  restingWaveSlot: {
    width: '100%',
    height: 92,
  },
  restingWaveSlotIdle: {
    height: 0,
  },
  restingWaveSlotRecording: {
    opacity: 0,
  },
  waveLineWrap: {
    width: '100%',
    height: 92,
    justifyContent: 'center',
    overflow: 'visible',
    paddingHorizontal: 8,
  },
  waveLineWrapPanel: {
    height: 104,
    marginTop: 2,
  },
  playWordBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'rgba(30,41,59,0.5)',
  },
  controlSpeakerBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  controlSpeakerBtnReview: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderColor: '#4EAFF4',
    backgroundColor: '#4EAFF4',
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 7 },
  },
  controlSpeakerBtnHidden: {
    opacity: 0,
    transform: [{ scale: 0.82 }],
  },
  controlSpeakerBtnPressed: {
    transform: [{ scale: 0.94 }],
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  controlSpeakerBtnDownloading: {
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  waveLineBase: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 45,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.14)',
  },
  waveGlow: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 18,
    height: 58,
    borderRadius: 999,
    backgroundColor: 'rgba(78,175,244,0.08)',
    opacity: 0,
  },
  waveGlowActive: {
    opacity: 0.9,
  },
  waveGlowPanel: {
    top: 10,
    height: 78,
    left: 12,
    right: 12,
  },
  waveBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 82,
  },
  waveBarsRowPanel: {
    height: 96,
    gap: 6,
  },
  waveBar: {
    width: 5,
    borderRadius: 999,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  waveBarPanel: {
    width: 6,
  },
  controlsRow: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  centerScore: {
    marginTop: 6,
    marginBottom: 4,
    textAlign: 'center',
    fontSize: 52,
    lineHeight: 56,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  syllableBlocksWrap: {
    marginTop: 6,
    gap: 14,
  },
  syllableRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  syllableBlock: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'rgba(30,41,59,0.62)',
    paddingHorizontal: 10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syllableBlockPressed: {
    transform: [{ scale: 0.96 }],
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  syllableBlockDownloading: {
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  syllableBlockLabel: {
    color: '#F8FAFC',
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '700',
  },
  syllableBlockScore: {
    fontSize: 25,
    lineHeight: 42,
    fontWeight: '800',
  },
  syllableBlockScoreSlot: {
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryHint: {
    color: '#94A3B8',
    fontSize: 17,
    lineHeight: 25,
    marginTop: 8,
    fontWeight: '600',
  },
  primaryCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  primaryCircleRecording: {
    borderRadius: 20,
    shadowOpacity: 0.42,
    shadowRadius: 18,
  },
  primaryCircleReview: {
    width: 52,
    height: 52,
    borderRadius: 26,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  primaryCirclePressed: {
    opacity: 0.92,
    transform: [{ scale: 0.94 }],
  },
});
