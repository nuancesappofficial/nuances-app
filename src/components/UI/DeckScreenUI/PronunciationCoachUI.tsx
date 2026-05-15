import React from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  pronunciationScore: number | null;
  pronunciationFeedbackLines: string[];
  phonemeChips: PhonemeChip[];
  syllableRowPattern?: number[];
  waveformValues: Animated.Value[];
  itemWord: string;
  downloadingPronunciationTarget?: string | null;
  onPlayWord: (word: string) => void;
  onPlaySyllable: (syllable: string) => void;
  onReset: () => void;
  onPrimaryAction: () => void;
  onPlayPreview: () => void;
};

export default function PronunciationCoachUI({
  isActiveCard,
  isRecording,
  hasRecorded,
  showFeedback,
  isAnalyzing,
  pronunciationScore,
  pronunciationFeedbackLines,
  phonemeChips,
  syllableRowPattern,
  waveformValues,
  itemWord,
  downloadingPronunciationTarget,
  onPlayWord,
  onPlaySyllable,
  onReset,
  onPrimaryAction,
  onPlayPreview,
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
  const isReviewState = isActiveCard && hasRecorded && !isRecording && !isAnalyzing;
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
            ? '#CBD5E1'
            : '#94A3B8'
          : '#4EAFF4';
  const buttonIconName: keyof typeof Ionicons.glyphMap = isAnalyzing
    ? 'hourglass-outline'
    : isRecording
      ? 'stop'
      : isReviewState
        ? 'play'
        : 'mic';

  const handlePrimaryPress = () => {
    if (!isActiveCard || isAnalyzing) return;
    if (isReviewState) {
      onPlayPreview();
      return;
    }
    onPrimaryAction();
  };

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

  return (
    <View
      style={[styles.root, !isActiveCard && styles.inactive]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
    >
      <View
        style={[
          styles.waveLineWrap,
          isLight
            ? {
                backgroundColor: '#F8FAFC',
                borderColor: palette.borderSubtle,
              }
            : null,
        ]}
      >
        <View style={styles.waveHeaderRow}>
          <Text style={[styles.waveHeaderTitle, isLight ? { color: palette.textOnContainer } : null]}>
            Pronunciation coach
          </Text>
        </View>
        <View style={[styles.waveGlow, isRecording ? styles.waveGlowActive : null]} />
        <View style={[styles.waveLineBase, isLight ? { backgroundColor: 'rgba(15,23,42,0.10)' } : null]} />
        <View style={styles.waveBarsRow}>
          {waveformValues.map((value, i) => {
            const idleHeight = 12 + Math.round(Math.abs(Math.sin(i * 0.72)) * 34);
            return (
              <Animated.View
                key={`wave-${i}`}
                style={[
                  styles.waveBar,
                  {
                    height: isActiveCard && isRecording ? value : idleHeight,
                    opacity: isActiveCard && isRecording ? 0.98 : isAnalyzing ? 0.34 : 0.18,
                    backgroundColor: waveformTone,
                    shadowColor: isActiveCard && isRecording ? '#4EAFF4' : '#000000',
                    shadowOpacity: isActiveCard && isRecording ? 0.34 : 0,
                  },
                ]}
              />
            );
          })}
        </View>
      </View>

      {phonemeRows.length > 0 ? (
        <>
          {pronunciationScore !== null ? (
            <Text style={[styles.centerScore, { color: scoreColor }]}>{pronunciationScore}%</Text>
          ) : null}

          <View style={styles.syllableBlocksWrap}>
            {phonemeRows.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.syllableRow}>
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
              </View>
            ))}
          </View>

          {pronunciationFeedbackLines.length > 0 ? (
            <Text style={[styles.summaryHint, { color: scoreSemanticTextColor }]}>
              {pronunciationFeedbackLines[0]}
            </Text>
          ) : null}
        </>
      ) : null}

      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[styles.primaryCircle, { backgroundColor: buttonBg }]}
          onPress={handlePrimaryPress}
          activeOpacity={0.88}
          disabled={!isActiveCard || isAnalyzing}
        >
          {isAnalyzing ? (
            <ActivityIndicator size="small" color="#F8FAFC" />
          ) : (
            <Ionicons name={buttonIconName} size={24} color="#F8FAFC" />
          )}
        </TouchableOpacity>

        <Pressable
          style={({ pressed }) => [
            styles.playWordBtn,
            styles.controlSpeakerBtn,
            isLight
              ? {
                  backgroundColor: 'rgba(78,175,244,0.10)',
                  borderColor: palette.borderSubtle,
                }
              : null,
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
          disabled={!isActiveCard || isWordDownloading}
          onPress={() => onPlayWord(itemWord)}
        >
          {isWordDownloading ? (
            <ActivityIndicator size="small" color="#4EAFF4" />
          ) : (
            <Ionicons name="volume-medium-outline" size={20} color={isLight ? palette.textOnContainer : '#CBD5E1'} />
          )}
        </Pressable>

        {isReviewState ? (
          <TouchableOpacity
            style={[styles.retakeBtn, isLight ? { backgroundColor: 'rgba(15,23,42,0.08)' } : null]}
            onPress={onReset}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={16} color={isLight ? '#64748B' : '#94A3B8'} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 2,
    paddingTop: 2,
  },
  inactive: {
    opacity: 0.7,
  },
  waveLineWrap: {
    height: 126,
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(78,175,244,0.18)',
    backgroundColor: 'rgba(15,23,42,0.48)',
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
    marginBottom: 14,
  },
  waveHeaderRow: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  waveHeaderTitle: {
    color: '#E2E8F0',
    fontSize: 22,
    fontWeight: '800',
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
    left: 14,
    right: 14,
    top: 76,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.14)',
  },
  waveGlow: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 48,
    height: 54,
    borderRadius: 999,
    backgroundColor: 'rgba(78,175,244,0.08)',
    opacity: 0.4,
  },
  waveGlowActive: {
    opacity: 0.82,
  },
  waveBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 72,
  },
  waveBar: {
    width: 5,
    borderRadius: 999,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  controlsRow: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
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
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  retakeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(51,65,85,0.45)',
  },
});
