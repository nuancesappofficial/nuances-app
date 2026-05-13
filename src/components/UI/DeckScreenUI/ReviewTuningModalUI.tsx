import React from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Switch, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import { TEXT_ON_CTA, MODAL_CTA_COLOR, resolveThemeColors } from '../../../theme/colors';
import {
  REVIEW_QUESTION_TYPE_OPTIONS,
  type ReviewQuestionType,
} from '../../../features/deck/reviewPreferences';

type Props = {
  visible: boolean;
  questionCount: number;
  todayNewWordsOnly?: boolean;
  selectedQuestionTypes: ReviewQuestionType[];
  onClose: () => void;
  onChangeQuestionCount: (value: number) => void;
  onChangeTodayNewWordsOnly?: (value: boolean) => void;
  onChangeSelectedQuestionTypes: (value: ReviewQuestionType[]) => void;
};

const QUICK_OPTIONS = [5, 10, 15, 20];
const MODAL_ENTRY_TRANSLATE_Y = 420;
const MODAL_ENTRY_DURATION_MS = 360;
const MODAL_BACKDROP_DURATION_MS = 240;
const MODAL_EXIT_DURATION_MS = 220;

export default function ReviewTuningModalUI({
  visible,
  questionCount,
  todayNewWordsOnly = false,
  selectedQuestionTypes,
  onClose,
  onChangeQuestionCount,
  onChangeTodayNewWordsOnly,
  onChangeSelectedQuestionTypes,
}: Props) {
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const [shouldRender, setShouldRender] = React.useState(visible);
  const entranceY = React.useRef(new Animated.Value(MODAL_ENTRY_TRANSLATE_Y)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;

  const decrement = React.useCallback(() => {
    onChangeQuestionCount(Math.max(1, questionCount - 1));
  }, [onChangeQuestionCount, questionCount]);

  const increment = React.useCallback(() => {
    onChangeQuestionCount(Math.min(50, questionCount + 1));
  }, [onChangeQuestionCount, questionCount]);

  const toggleQuestionType = React.useCallback(
    (type: ReviewQuestionType) => {
      const hasType = selectedQuestionTypes.includes(type);
      if (hasType && selectedQuestionTypes.length === 1) return;
      const next = hasType
        ? selectedQuestionTypes.filter((item) => item !== type)
        : [...selectedQuestionTypes, type];
      onChangeSelectedQuestionTypes(next);
    },
    [onChangeSelectedQuestionTypes, selectedQuestionTypes]
  );

  React.useEffect(() => {
    if (visible) {
      setShouldRender(true);
      entranceY.setValue(MODAL_ENTRY_TRANSLATE_Y);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(entranceY, {
          toValue: 0,
          duration: MODAL_ENTRY_DURATION_MS,
          easing: Easing.bezier(0.3, 0.2, 0.4, 1),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: MODAL_BACKDROP_DURATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!shouldRender) return;
    Animated.parallel([
      Animated.timing(entranceY, {
        toValue: MODAL_ENTRY_TRANSLATE_Y,
        duration: MODAL_EXIT_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: MODAL_EXIT_DURATION_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setShouldRender(false);
    });
  }, [backdropOpacity, entranceY, shouldRender, visible]);

  if (!shouldRender) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.rootPressable} onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        <Animated.View style={[styles.sheetWrap, { transform: [{ translateY: entranceY }] }]}>
          <Pressable style={[styles.sheet, { backgroundColor: palette.modalBg }]} onPress={() => undefined}>
          <Text style={[styles.eyebrow, { color: palette.secondaryText }]}>REVIEW TUNING</Text>

          <View style={styles.counterRow}>
            <TouchableOpacity style={[styles.counterButton, { backgroundColor: palette.modalOptionBg }]} onPress={decrement}>
              <Text style={[styles.counterSymbol, { color: palette.textOnContainer }]}>−</Text>
            </TouchableOpacity>

            <View style={[styles.counterValueWrap, { backgroundColor: palette.mutedSurface }]}>
              <Text style={[styles.counterValue, { color: palette.textOnContainer }]}>{questionCount}</Text>
              <Text style={[styles.counterLabel, { color: palette.secondaryText }]}>questions</Text>
            </View>

            <TouchableOpacity style={[styles.counterButton, { backgroundColor: palette.modalOptionBg }]} onPress={increment}>
              <Text style={[styles.counterSymbol, { color: palette.textOnContainer }]}>＋</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.quickRow}>
            {QUICK_OPTIONS.map((value) => {
              const active = value === questionCount;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.quickChip, { backgroundColor: palette.modalOptionBg }, active && styles.quickChipActive]}
                  onPress={() => onChangeQuestionCount(value)}
                >
                  <Text style={[styles.quickChipText, { color: palette.textOnContainer }, active && styles.quickChipTextActive]}>{value}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.sectionDivider, { backgroundColor: palette.modalOptionBorder }]} />

          <View style={styles.questionTypeSection}>
            <Text style={[styles.sectionTitle, { color: palette.textOnContainer }]}>Question types</Text>
            <View style={styles.questionTypePillWrap}>
              {REVIEW_QUESTION_TYPE_OPTIONS.map((item) => {
                const active = selectedQuestionTypes.includes(item.key);
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[
                      styles.questionTypePill,
                      { backgroundColor: palette.modalOptionBg, borderColor: palette.modalOptionBorder },
                      active ? styles.questionTypePillActive : null,
                    ]}
                    onPress={() => toggleQuestionType(item.key)}
                  >
                    <Text
                      style={[
                        styles.questionTypePillText,
                        { color: palette.textOnContainer },
                        active ? styles.questionTypePillTextActive : null,
                      ]}
                    >
                      {item.shortLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {onChangeTodayNewWordsOnly ? (
            <>
              <View style={[styles.sectionDivider, { backgroundColor: palette.modalOptionBorder }]} />
              <View
                style={[
                  styles.toggleRow,
                  {
                    backgroundColor: palette.mutedSurface,
                    borderColor: palette.modalOptionBorder,
                  },
                ]}
              >
                <View style={styles.toggleCopy}>
                  <Text style={[styles.toggleLabel, { color: palette.textOnContainer }]}>Today&apos;s new words only</Text>
                </View>
                <Switch
                  value={todayNewWordsOnly}
                  onValueChange={onChangeTodayNewWordsOnly}
                  trackColor={{ false: palette.modalOptionBg, true: MODAL_CTA_COLOR }}
                  thumbColor={TEXT_ON_CTA}
                  ios_backgroundColor={palette.modalOptionBg}
                />
              </View>
            </>
          ) : null}

          <TouchableOpacity style={[styles.doneButton, { backgroundColor: palette.modalSecondaryButtonBg }]} onPress={onClose}>
            <Text style={[styles.doneText, { color: palette.modalSecondaryButtonText }]}>Done</Text>
          </TouchableOpacity>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rootPressable: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#02213D',
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
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
  questionTypeSection: {
    gap: 8,
  },
  questionTypePillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  questionTypePill: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionTypePillActive: {
    backgroundColor: MODAL_CTA_COLOR,
    borderColor: MODAL_CTA_COLOR,
  },
  questionTypePillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  questionTypePillTextActive: {
    color: TEXT_ON_CTA,
  },
  quickChip: {
    flex: 1,
    borderRadius: BUTTON_TOKENS.radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    minHeight: BUTTON_TOKENS.height.regular,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipActive: {
    backgroundColor: MODAL_CTA_COLOR,
  },
  quickChipText: {
    color: '#FFFFFF',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  quickChipTextActive: {
    color: TEXT_ON_CTA,
  },
  toggleRow: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  toggleCopy: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  doneButton: {
    marginTop: 4,
    borderRadius: BUTTON_TOKENS.radius.lg,
    backgroundColor: '#FFFFFF',
    minHeight: BUTTON_TOKENS.height.prominent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: '#111111',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
});
