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
  return (
    <View style={[styles.coachCard, !isActiveCard && styles.inactiveDetailBlock]}>
      <View style={styles.coachHeader}>
        <View style={styles.coachIconWrap}>
          <Text style={styles.coachIcon}>🎤</Text>
        </View>
        <View>
          <Text style={styles.coachTitle}>Pronunciation Coach</Text>
          <Text style={styles.coachSubTitle}>Practice your pronunciation</Text>
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
                  opacity: isActiveCard && isRecording ? 1 : 0.3,
                },
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.coachControls}>
        {hasRecorded && isActiveCard ? (
          <TouchableOpacity style={styles.smallControlBtn} onPress={onReset}>
            <Text style={styles.smallControlTxt}>↺</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.sidePlaceholder} />
        )}

        <TouchableOpacity
          style={[
            styles.recordBtn,
            isRecording && isActiveCard && styles.recordBtnActive,
            isAnalyzing && isActiveCard && styles.recordBtnDisabled,
          ]}
          onPress={onPrimaryAction}
          disabled={isActiveCard ? isAnalyzing : false}
        >
          <Text style={[styles.recordBtnText, isRecording && isActiveCard && styles.recordBtnTextActive]}>
            {isActiveCard && isAnalyzing ? '…' : isActiveCard && isRecording ? '■' : '🎙️'}
          </Text>
        </TouchableOpacity>

        {hasRecorded && isActiveCard ? (
          <TouchableOpacity
            style={[styles.smallControlBtn, (isRecording || isAnalyzing) && styles.smallControlBtnDisabled]}
            onPress={onPlayPreview}
            disabled={isRecording || isAnalyzing}
          >
            <Text style={styles.smallControlTxt}>▶</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.sidePlaceholder} />
        )}
      </View>

      {isActiveCard && isAnalyzing ? (
        <View style={styles.analyzingWrap}>
          <ActivityIndicator size="small" color="#fff" />
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
              <Text style={styles.feedbackSub}>Azure pronunciation assessment completed</Text>
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
              : ['ʃ', 'ɪ', 't', 'ʃ', 'oʊ'].map((p, i) => (
                  <View key={p + i} style={[styles.phonemeBadge, i === 2 ? styles.phonemeBad : styles.phonemeGood]}>
                    <Text style={styles.phonemeText}>{p}</Text>
                  </View>
                ))}
          </View>

          {pronunciationFeedbackLines.slice(0, 2).map((line, idx) => (
            <Text key={`${line}-${idx}`} style={styles.phonemeHint}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {isActiveCard && !isRecording && !hasRecorded && !isAnalyzing ? (
        <Text style={styles.coachHint}>Tap the microphone to start practicing</Text>
      ) : null}
      {isActiveCard && isRecording ? <Text style={styles.coachHint}>Say "{itemWord}" now...</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  coachCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#143D89',
  },
  inactiveDetailBlock: {
    opacity: 0.9,
  },
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  coachIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachIcon: { fontSize: 20 },
  coachTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  coachSubTitle: { fontSize: 13, color: 'rgba(255,255,255,0.82)' },
  waveContainer: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  waveRow: {
    height: 82,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  waveBar: {
    width: 3,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  coachControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  sidePlaceholder: { width: 48, height: 48 },
  smallControlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallControlBtnDisabled: { opacity: 0.5 },
  smallControlTxt: { color: '#fff', fontSize: 22, fontWeight: '700' },
  recordBtn: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBtnActive: { backgroundColor: '#FF3B30' },
  recordBtnDisabled: { opacity: 0.6 },
  recordBtnText: { fontSize: 30, color: '#007AFF' },
  recordBtnTextActive: { color: '#fff', fontSize: 24 },
  analyzingWrap: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  analyzingText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  feedbackBox: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    padding: 14,
  },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  feedbackCheck: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackCheckText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  feedbackTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  feedbackSub: { color: 'rgba(255,255,255,0.82)', fontSize: 13, marginTop: 2 },
  feedbackScore: { color: '#fff', fontSize: 24, fontWeight: '800' },
  phonemeRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  phonemeBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  phonemeGood: { backgroundColor: 'rgba(52,199,89,0.3)' },
  phonemeBad: { backgroundColor: 'rgba(255,59,48,0.3)' },
  phonemeText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'Courier' },
  phonemeHint: { marginTop: 8, textAlign: 'center', color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  coachHint: { marginTop: 12, textAlign: 'center', color: 'rgba(255,255,255,0.82)', fontSize: 13 },
});
