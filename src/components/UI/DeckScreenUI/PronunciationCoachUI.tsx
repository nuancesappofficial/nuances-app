import React from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type PhonemeChip = {
  phoneme: string;
  letters?: string;
  accuracy: number;
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
  onPlayWord,
  onPlaySyllable,
  onReset,
  onPrimaryAction,
  onPlayPreview,
}: Props) {
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
  const hasRunSummary =
    isActiveCard &&
    (pronunciationScore !== null || phonemeChips.length > 0 || pronunciationFeedbackLines.length > 0);
  const buttonBg = !isActiveCard
    ? '#334155'
    : isAnalyzing
      ? '#64748B'
      : isRecording
        ? '#FF6B6B'
        : isReviewState
          ? '#94A3B8'
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
      ? '#94A3B8'
      : pronunciationScore >= 85
        ? '#4EAFF4'
        : pronunciationScore >= 60
          ? '#F8FAFC'
          : '#FF6B6B';
  const scoreSemanticTextColor =
    pronunciationScore == null
      ? '#CBD5E1'
      : pronunciationScore >= 85
        ? '#BFE7FF'
        : pronunciationScore >= 60
          ? '#F8FAFC'
          : '#FFD0D0';
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
      <View style={styles.waveLineWrap}>
        <View style={styles.waveHeaderRow}>
          <Text style={styles.waveHeaderTitle}>Pronunciation coach</Text>
          <TouchableOpacity
            style={styles.playWordBtn}
            activeOpacity={0.86}
            onPress={() => onPlayWord(itemWord)}
          >
            <Ionicons name="volume-medium-outline" size={18} color="#CBD5E1" />
          </TouchableOpacity>
        </View>
        <View style={styles.waveLineBase} />
        <View style={styles.waveBarsRow}>
          {waveformValues.map((value, i) => (
            <Animated.View
              key={`wave-${i}`}
              style={[
                styles.waveBar,
                {
                  height: value,
                  opacity: isActiveCard && isRecording ? 0.95 : 0.12,
                  backgroundColor: isActiveCard && isRecording ? '#4EAFF4' : '#334155',
                },
              ]}
            />
          ))}
        </View>
      </View>

      {hasRunSummary ? (
        <>
          {pronunciationScore !== null ? (
            <Text style={[styles.centerScore, { color: scoreColor }]}>{pronunciationScore}%</Text>
          ) : null}

          {phonemeRows.length > 0 ? (
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
                    return (
                    <TouchableOpacity
                      key={`${chip.phoneme}-${rowIndex}-${idx}`}
                      activeOpacity={0.88}
                      onPress={() => onPlaySyllable((chip.letters || chip.phoneme || '').trim())}
                      style={[styles.syllableBlock, { paddingVertical: dynPaddingVertical }]}
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
                        {(chip.letters || chip.phoneme || '').trim() || `Part ${idx + 1}`}
                      </Text>
                      <Text
                        style={[
                          styles.syllableBlockScore,
                          {
                            fontSize: dynScoreFontSize,
                            lineHeight: dynScoreLineHeight,
                            color:
                              chip.accuracy >= 85 ? '#4EAFF4' : chip.accuracy >= 60 ? '#F8FAFC' : '#FF6B6B',
                          },
                        ]}
                      >
                        {Math.round(chip.accuracy)}%
                      </Text>
                    </TouchableOpacity>
                  )})}
                </View>
              ))}
            </View>
          ) : null}

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

        {isReviewState ? (
          <TouchableOpacity style={styles.retakeBtn} onPress={onReset} activeOpacity={0.85}>
            <Ionicons name="refresh" size={16} color="#94A3B8" />
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
    height: 68,
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 10,
    marginBottom: 10,
  },
  waveHeaderRow: {
    marginBottom: 12,
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
  waveLineBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 999,
    backgroundColor: '#334155',
  },
  waveBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 26,
  },
  waveBar: {
    width: 2,
    borderRadius: 999,
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
  syllableBlockLabel: {
    color: '#F8FAFC',
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '700',
  },
  syllableBlockScore: {
    marginTop: 4,
    fontSize: 25,
    lineHeight: 42,
    fontWeight: '800',
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
