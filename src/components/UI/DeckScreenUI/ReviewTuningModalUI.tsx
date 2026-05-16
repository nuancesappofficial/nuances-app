import React from 'react';
import {
  Animated,
  Easing,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  useColorScheme,
} from 'react-native';
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

const MODAL_ENTRY_TRANSLATE_Y = 420;
const MODAL_ENTRY_DURATION_MS = 360;
const MODAL_BACKDROP_DURATION_MS = 240;
const MODAL_EXIT_DURATION_MS = 220;
const MIN_QUESTION_COUNT = 1;
const MAX_QUESTION_COUNT = 50;

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
  const [sliderWidth, setSliderWidth] = React.useState(0);
  const entranceY = React.useRef(new Animated.Value(MODAL_ENTRY_TRANSLATE_Y)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;
  const sliderProgress = React.useMemo(() => {
    const clamped = Math.max(MIN_QUESTION_COUNT, Math.min(MAX_QUESTION_COUNT, questionCount));
    return (clamped - MIN_QUESTION_COUNT) / (MAX_QUESTION_COUNT - MIN_QUESTION_COUNT);
  }, [questionCount]);

  const decrement = React.useCallback(() => {
    onChangeQuestionCount(Math.max(MIN_QUESTION_COUNT, questionCount - 1));
  }, [onChangeQuestionCount, questionCount]);

  const increment = React.useCallback(() => {
    onChangeQuestionCount(Math.min(MAX_QUESTION_COUNT, questionCount + 1));
  }, [onChangeQuestionCount, questionCount]);

  const updateQuestionCountFromSlider = React.useCallback(
    (event: GestureResponderEvent) => {
      if (sliderWidth <= 0) return;
      const x = Math.max(0, Math.min(sliderWidth, event.nativeEvent.locationX));
      const next =
        MIN_QUESTION_COUNT + Math.round((x / sliderWidth) * (MAX_QUESTION_COUNT - MIN_QUESTION_COUNT));
      if (next === questionCount) return;
      onChangeQuestionCount(next);
    },
    [onChangeQuestionCount, questionCount, sliderWidth]
  );

  const handleSliderLayout = React.useCallback((event: LayoutChangeEvent) => {
    setSliderWidth(event.nativeEvent.layout.width);
  }, []);

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
            <Pressable
              style={({ pressed }) => [
                styles.counterButton,
                { backgroundColor: palette.modalOptionBg },
                pressed ? styles.pressableIconPressed : null,
              ]}
              onPress={decrement}
            >
              <Text style={[styles.counterSymbol, { color: palette.textOnContainer }]}>−</Text>
            </Pressable>

            <View style={[styles.counterValueWrap, { backgroundColor: palette.mutedSurface }]}>
              <Text style={[styles.counterValue, { color: palette.textOnContainer }]}>{questionCount}</Text>
              <Text style={[styles.counterLabel, { color: palette.secondaryText }]}>questions</Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.counterButton,
                { backgroundColor: palette.modalOptionBg },
                pressed ? styles.pressableIconPressed : null,
              ]}
              onPress={increment}
            >
              <Text style={[styles.counterSymbol, { color: palette.textOnContainer }]}>＋</Text>
            </Pressable>
          </View>

          <View style={styles.sliderBlock}>
            <View
              style={styles.sliderRailTouch}
              onLayout={handleSliderLayout}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={updateQuestionCountFromSlider}
              onResponderMove={updateQuestionCountFromSlider}
            >
              <View style={[styles.sliderRail, { backgroundColor: palette.modalOptionBg }]}>
                <View
                  style={[
                    styles.sliderFill,
                    {
                      width: `${sliderProgress * 100}%`,
                      backgroundColor: MODAL_CTA_COLOR,
                    },
                  ]}
                />
              </View>
              <View
                pointerEvents="none"
                style={[
                  styles.sliderThumb,
                  {
                    left: `${sliderProgress * 100}%`,
                    backgroundColor: MODAL_CTA_COLOR,
                  },
                ]}
              />
            </View>
            <View style={styles.sliderBoundsRow}>
              <Text style={[styles.sliderBoundText, { color: palette.secondaryText }]}>{MIN_QUESTION_COUNT}</Text>
              <Text style={[styles.sliderBoundText, { color: palette.secondaryText }]}>{MAX_QUESTION_COUNT}</Text>
            </View>
          </View>

          <View style={[styles.sectionDivider, { backgroundColor: palette.modalOptionBorder }]} />

          <View style={styles.questionTypeSection}>
            <Text style={[styles.sectionTitle, { color: palette.textOnContainer }]}>Question types</Text>
            <View style={styles.questionTypePillWrap}>
              {REVIEW_QUESTION_TYPE_OPTIONS.map((item) => {
                const active = selectedQuestionTypes.includes(item.key);
                return (
                  <Pressable
                    key={item.key}
                    style={({ pressed }) => [
                      styles.questionTypePill,
                      { backgroundColor: palette.modalOptionBg, borderColor: palette.modalOptionBorder },
                      active ? styles.questionTypePillActive : null,
                      pressed ? styles.pressableMediumPressed : null,
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
                  </Pressable>
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

          <Pressable
            style={({ pressed }) => [
              styles.doneButton,
              { backgroundColor: palette.modalSecondaryButtonBg },
              pressed ? styles.pressablePrimaryPressed : null,
            ]}
            onPress={onClose}
          >
            <Text style={[styles.doneText, { color: palette.modalSecondaryButtonText }]}>Done</Text>
          </Pressable>
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
  sliderBlock: {
    gap: 8,
  },
  sliderRailTouch: {
    height: 34,
    justifyContent: 'center',
  },
  sliderRail: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    borderRadius: 999,
  },
  sliderThumb: {
    position: 'absolute',
    top: 5,
    width: 24,
    height: 24,
    marginLeft: -12,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: TEXT_ON_CTA,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  sliderBoundsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderBoundText: {
    fontSize: 12,
    fontWeight: '700',
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
    paddingHorizontal: 16,
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
    fontSize: 15,
    fontWeight: '700',
  },
  questionTypePillTextActive: {
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
  pressablePrimaryPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  pressableMediumPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  pressableIconPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
});
