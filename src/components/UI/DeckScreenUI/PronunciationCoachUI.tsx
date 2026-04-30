import React from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
  waveformValues: Animated.Value[];
  itemWord: string;
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
  waveformValues,
  itemWord,
  onReset,
  onPrimaryAction,
  onPlayPreview,
}: Props) {
  const ctaLabel = isActiveCard && isAnalyzing ? 'Analyzing...' : isActiveCard && isRecording ? 'Stop' : 'Start';

  return (
    <View style={[styles.coachCard, !isActiveCard && styles.inactiveDetailBlock]}>
      <View style={styles.coachHeader}>
        <View style={styles.coachHeaderLeft}>
          <View style={styles.coachIconWrap}>
            <Text style={styles.coachIcon}>🎙️</Text>
          </View>
          <View>
            <Text style={styles.coachTitle}>Pronunciation Coach</Text>
            <Text style={styles.coachSubTitle}>Train it like real conversation</Text>
          </View>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>
            {isActiveCard && isRecording ? 'REC' : isActiveCard && isAnalyzing ? 'AI' : 'READY'}
          </Text>
        </View>
      </View>

      <View style={styles.waveContainer}>
        <View style={styles.waveRow}>
          {waveformValues.map((value, i) => (
            <Animated.View
              key={`wave-${i}`}
              style={[
                styles.waveBar,
                {
                  height: value,
                  opacity: isActiveCard && isRecording ? 1 : 0.34,
                },
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.coachControls}>
        <TouchableOpacity
          style={[
            styles.primaryActionBtn,
            isRecording && isActiveCard && styles.primaryActionBtnActive,
            isAnalyzing && isActiveCard && styles.primaryActionBtnDisabled,
          ]}
          onPress={onPrimaryAction}
          disabled={isActiveCard ? isAnalyzing : false}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryActionIcon}>{isActiveCard && isRecording ? '■' : '🎤'}</Text>
          <Text style={styles.primaryActionText}>{ctaLabel}</Text>
        </TouchableOpacity>

        <View style={styles.secondaryActions}>
          <TouchableOpacity
            style={[styles.secondaryBtn, (!hasRecorded || !isActiveCard || isRecording || isAnalyzing) && styles.secondaryBtnDisabled]}
            onPress={onPlayPreview}
            disabled={!hasRecorded || !isActiveCard || isRecording || isAnalyzing}
          >
            <Text style={styles.secondaryBtnText}>▶</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, (!hasRecorded || !isActiveCard) && styles.secondaryBtnDisabled]}
            onPress={onReset}
            disabled={!hasRecorded || !isActiveCard}
          >
            <Text style={styles.secondaryBtnText}>↺</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isActiveCard && isAnalyzing ? (
        <View style={styles.analyzingWrap}>
          <ActivityIndicator size="small" color="#1D4ED8" />
          <Text style={styles.analyzingText}>Azure 發音分析中...</Text>
        </View>
      ) : null}

      {isActiveCard && showFeedback && pronunciationScore !== null ? (
        <View style={styles.feedbackBox}>
          <View style={styles.feedbackRow}>
            <View style={styles.feedbackCheck}>
              <Text style={styles.feedbackCheckText}>✓</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.feedbackTitle}>Great job!</Text>
              <Text style={styles.feedbackSub}>Pronunciation assessment completed</Text>
            </View>
            <Text style={styles.feedbackScore}>{pronunciationScore}%</Text>
          </View>

          <View style={styles.phonemeRow}>
            {phonemeChips.length > 0
              ? phonemeChips.map((phonemeItem, i) => (
                  <View
                    key={`${phonemeItem.phoneme}-${i}`}
                    style={[
                      styles.phonemeBadge,
                      phonemeItem.accuracy < 80 ? styles.phonemeBad : styles.phonemeGood,
                    ]}
                  >
                    <Text style={styles.phonemeText}>{phonemeItem.letters || phonemeItem.phoneme}</Text>
                  </View>
                ))
              : null}
          </View>

          {pronunciationFeedbackLines.slice(0, 2).map((line, idx) => (
            <Text key={`${line}-${idx}`} style={styles.phonemeHint}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {isActiveCard && !isRecording && !hasRecorded && !isAnalyzing ? (
        <Text style={styles.coachHint}>Tap Start and read: "{itemWord}"</Text>
      ) : null}
      {isActiveCard && isRecording ? <Text style={styles.coachHint}>Recording... say "{itemWord}" now</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  coachCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.09)',
  },
  inactiveDetailBlock: {
    opacity: 0.88,
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  coachHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  coachIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EAF0FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachIcon: { fontSize: 16 },
  coachTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  coachSubTitle: { fontSize: 12, color: '#64748B' },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#E5EEFF',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.28)',
  },
  statusPillText: {
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  waveContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  waveRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  waveBar: {
    width: 3,
    backgroundColor: '#2563EB',
    borderRadius: 2,
  },
  coachControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryActionBtn: {
    flex: 1,
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: '#F59E0B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  primaryActionBtnActive: { backgroundColor: '#EF4444', shadowColor: '#EF4444' },
  primaryActionBtnDisabled: { opacity: 0.62 },
  primaryActionIcon: { fontSize: 18 },
  primaryActionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E6ECF6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  secondaryBtnDisabled: {
    opacity: 0.45,
  },
  secondaryBtnText: {
    color: '#1F2937',
    fontSize: 18,
    fontWeight: '800',
  },
  analyzingWrap: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  analyzingText: { color: '#334155', fontSize: 13, fontWeight: '600' },
  feedbackBox: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.1)',
    padding: 14,
  },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  feedbackCheck: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackCheckText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  feedbackTitle: { color: '#111827', fontSize: 15, fontWeight: '700' },
  feedbackSub: { color: '#6B7280', fontSize: 13, marginTop: 2 },
  feedbackScore: { color: '#111827', fontSize: 24, fontWeight: '800' },
  phonemeRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  phonemeBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  phonemeGood: { backgroundColor: 'rgba(52,199,89,0.15)' },
  phonemeBad: { backgroundColor: 'rgba(255,59,48,0.16)' },
  phonemeText: { color: '#111827', fontSize: 15, fontWeight: '700', fontFamily: 'Courier' },
  phonemeHint: { marginTop: 8, textAlign: 'center', color: '#6B7280', fontSize: 12 },
  coachHint: { marginTop: 12, textAlign: 'center', color: '#475569', fontSize: 13 },
});
