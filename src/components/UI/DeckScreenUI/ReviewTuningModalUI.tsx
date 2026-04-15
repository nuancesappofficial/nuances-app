import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  visible: boolean;
  questionCount: number;
  onClose: () => void;
  onChangeQuestionCount: (value: number) => void;
};

const QUICK_OPTIONS = [5, 10, 15, 20];

export default function ReviewTuningModalUI({
  visible,
  questionCount,
  onClose,
  onChangeQuestionCount,
}: Props) {
  const decrement = React.useCallback(() => {
    onChangeQuestionCount(Math.max(1, questionCount - 1));
  }, [onChangeQuestionCount, questionCount]);

  const increment = React.useCallback(() => {
    onChangeQuestionCount(Math.min(50, questionCount + 1));
  }, [onChangeQuestionCount, questionCount]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheet}>
          <Text style={styles.eyebrow}>REVIEW TUNING</Text>
          <Text style={styles.title}>Decide how many cards to play</Text>
          <Text style={styles.subtitle}>This setting will be remembered for this album.</Text>

          <View style={styles.counterRow}>
            <TouchableOpacity style={styles.counterButton} onPress={decrement}>
              <Text style={styles.counterSymbol}>−</Text>
            </TouchableOpacity>

            <View style={styles.counterValueWrap}>
              <Text style={styles.counterValue}>{questionCount}</Text>
              <Text style={styles.counterLabel}>questions</Text>
            </View>

            <TouchableOpacity style={styles.counterButton} onPress={increment}>
              <Text style={styles.counterSymbol}>＋</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.quickRow}>
            {QUICK_OPTIONS.map((value) => {
              const active = value === questionCount;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.quickChip, active && styles.quickChipActive]}
                  onPress={() => onChangeQuestionCount(value)}
                >
                  <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>{value}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    borderRadius: 24,
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    gap: 16,
  },
  eyebrow: {
    color: '#8D93A1',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#B4BBC8',
    fontSize: 14,
    lineHeight: 20,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  counterButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#1E232D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterSymbol: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  counterValueWrap: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: '#181C23',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
  },
  counterLabel: {
    marginTop: 2,
    color: '#97A0AF',
    fontSize: 13,
    fontWeight: '600',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickChip: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#1A1E27',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipActive: {
    backgroundColor: '#E5FF4F',
  },
  quickChipText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  quickChipTextActive: {
    color: '#101010',
  },
  doneButton: {
    marginTop: 4,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '800',
  },
});
