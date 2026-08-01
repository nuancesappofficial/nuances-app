import React from 'react';
import {
  Animated,
  Easing,
  type GestureResponderEvent,
  Image,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tUI } from '../../../i18n/uiLanguage';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import {
  TEXT_ON_CTA,
  MODAL_CTA_COLOR,
  resolveThemeColors,
} from '../../../theme/colors';
import {
  DEFAULT_REVIEW_QUESTION_TYPES,
  REVIEW_QUESTION_TYPE_OPTIONS,
  type ReviewQuestionType,
} from '../../../features/deck/reviewPreferences';
import type { UILanguage } from '../../../services/settings/userSettings';

type Props = {
  visible: boolean;
  questionCount: number;
  todayNewWordsOnly?: boolean;
  selectedQuestionTypes: ReviewQuestionType[];
  sourceAlbums?: Array<{
    id: string;
    label: string;
    emoji?: string;
    color?: string;
    coverImageUri?: string;
  }>;
  selectedSourceAlbumIds?: string[];
  uiLanguage: UILanguage;
  onClose: () => void;
  onChangeQuestionCount: (value: number) => void;
  onChangeTodayNewWordsOnly?: (value: boolean) => void;
  onChangeSelectedQuestionTypes: (value: ReviewQuestionType[]) => void;
  onChangeSelectedSourceAlbumIds?: (value: string[]) => void;
};

const MODAL_ENTRY_TRANSLATE_Y = 420;
const MODAL_ENTRY_DURATION_MS = 360;
const MODAL_BACKDROP_DURATION_MS = 240;
const MODAL_EXIT_DURATION_MS = 220;
const MIN_QUESTION_COUNT = 1;
const MAX_QUESTION_COUNT = 50;
const QUESTION_TYPE_PRESENTATION: Record<
  ReviewQuestionType,
  {
    icon: keyof typeof Ionicons.glyphMap;
    labelKey:
      | 'review.questionType.fillBlank'
      | 'review.questionType.spelling'
      | 'review.questionType.guessWord'
      | 'review.questionType.guessMeaning'
      | 'review.questionType.contextMeaning'
      | 'review.questionType.partOfSpeech'
      | 'review.questionType.pronunciation';
  }
> = {
  fill_blank: {
    icon: 'remove-circle-outline',
    labelKey: 'review.questionType.fillBlank',
  },
  spelling: {
    icon: 'keypad-outline',
    labelKey: 'review.questionType.spelling',
  },
  translation_to_word: {
    icon: 'language-outline',
    labelKey: 'review.questionType.guessMeaning',
  },
  word_to_translation: {
    icon: 'language-outline',
    labelKey: 'review.questionType.guessMeaning',
  },
  sentence_to_translation: {
    icon: 'language-outline',
    labelKey: 'review.questionType.guessMeaning',
  },
  part_of_speech: {
    icon: 'shapes-outline',
    labelKey: 'review.questionType.partOfSpeech',
  },
  pronunciation: {
    icon: 'mic-outline',
    labelKey: 'review.questionType.pronunciation',
  },
};

export default function ReviewTuningModalUI({
  visible,
  questionCount,
  todayNewWordsOnly = false,
  selectedQuestionTypes,
  sourceAlbums = [],
  selectedSourceAlbumIds = [],
  uiLanguage,
  onClose,
  onChangeQuestionCount,
  onChangeTodayNewWordsOnly,
  onChangeSelectedQuestionTypes,
  onChangeSelectedSourceAlbumIds,
}: Props) {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const palette = React.useMemo(
    () => resolveThemeColors(colorScheme),
    [colorScheme]
  );
  const modalSurface = isDarkMode ? palette.modalBg : '#F3EFE9';
  const optionSurface = isDarkMode ? palette.mutedSurface : '#FFFFFF';
  const optionBorder = isDarkMode ? palette.modalOptionBorder : '#E2DDD6';
  const selectedSurface = isDarkMode
    ? 'rgba(78,175,244,0.16)'
    : '#EAF5FC';
  const selectedBorder = isDarkMode ? MODAL_CTA_COLOR : '#85C7EF';
  const [shouldRender, setShouldRender] = React.useState(visible);
  const [sliderWidth, setSliderWidth] = React.useState(0);
  const entranceY = React.useRef(
    new Animated.Value(MODAL_ENTRY_TRANSLATE_Y)
  ).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;
  const sliderProgress = React.useMemo(() => {
    const clamped = Math.max(
      MIN_QUESTION_COUNT,
      Math.min(MAX_QUESTION_COUNT, questionCount)
    );
    return (
      (clamped - MIN_QUESTION_COUNT) / (MAX_QUESTION_COUNT - MIN_QUESTION_COUNT)
    );
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
        MIN_QUESTION_COUNT +
        Math.round(
          (x / sliderWidth) * (MAX_QUESTION_COUNT - MIN_QUESTION_COUNT)
        );
      if (next === questionCount) return;
      onChangeQuestionCount(next);
    },
    [onChangeQuestionCount, questionCount, sliderWidth]
  );

  const handleSliderLayout = React.useCallback((event: LayoutChangeEvent) => {
    setSliderWidth(event.nativeEvent.layout.width);
  }, []);

  const toggleQuestionType = React.useCallback(
    (questionType: ReviewQuestionType) => {
      const isSelected = selectedQuestionTypes.includes(questionType);
      if (isSelected && selectedQuestionTypes.length === 1) return;
      onChangeSelectedQuestionTypes(
        isSelected
          ? selectedQuestionTypes.filter((type) => type !== questionType)
          : [...selectedQuestionTypes, questionType]
      );
    },
    [onChangeSelectedQuestionTypes, selectedQuestionTypes]
  );

  const selectAllQuestionTypes = React.useCallback(() => {
    onChangeSelectedQuestionTypes(DEFAULT_REVIEW_QUESTION_TYPES);
  }, [onChangeSelectedQuestionTypes]);

  const toggleSourceAlbum = React.useCallback(
    (albumId: string) => {
      if (!onChangeSelectedSourceAlbumIds) return;
      if (albumId === 'all') {
        onChangeSelectedSourceAlbumIds(['all']);
        return;
      }

      const withoutAll = selectedSourceAlbumIds.filter((id) => id !== 'all');
      const isSelected = withoutAll.includes(albumId);
      const next = isSelected
        ? withoutAll.filter((id) => id !== albumId)
        : [...withoutAll, albumId];
      onChangeSelectedSourceAlbumIds(
        next.length > 0 ? Array.from(new Set(next)) : ['all']
      );
    },
    [onChangeSelectedSourceAlbumIds, selectedSourceAlbumIds]
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
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View
            style={[styles.backdrop, { opacity: backdropOpacity }]}
          />
        </Pressable>
        <Animated.View
          style={[styles.sheetWrap, { transform: [{ translateY: entranceY }] }]}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: modalSurface }]}
            onPress={() => undefined}
          >
            <ScrollView
              style={styles.contentScroll}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <Text style={[styles.eyebrow, { color: palette.secondaryText }]}>
                {tUI(uiLanguage, 'review.tuningEyebrow')}
              </Text>

              <View style={styles.counterRow}>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.counterButton,
                    {
                      backgroundColor: optionSurface,
                      borderColor: optionBorder,
                    },
                    pressed ? styles.pressableIconPressed : null,
                  ]}
                  onPress={decrement}
                >
                  <Text
                    style={[
                      styles.counterSymbol,
                      { color: palette.textOnContainer },
                    ]}
                  >
                    −
                  </Text>
                </Pressable>

                <View
                  style={[
                    styles.counterValueWrap,
                    {
                      backgroundColor: optionSurface,
                      borderColor: optionBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.counterValue,
                      { color: palette.textOnContainer },
                    ]}
                  >
                    {questionCount}
                  </Text>
                  <Text
                    style={[
                      styles.counterLabel,
                      { color: palette.secondaryText },
                    ]}
                  >
                    {tUI(uiLanguage, 'review.questionsLabel')}
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.counterButton,
                    {
                      backgroundColor: optionSurface,
                      borderColor: optionBorder,
                    },
                    pressed ? styles.pressableIconPressed : null,
                  ]}
                  onPress={increment}
                >
                  <Text
                    style={[
                      styles.counterSymbol,
                      { color: palette.textOnContainer },
                    ]}
                  >
                    ＋
                  </Text>
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
                  <View
                    style={[
                      styles.sliderRail,
                      { backgroundColor: optionBorder },
                    ]}
                  >
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
                  <Text
                    style={[
                      styles.sliderBoundText,
                      { color: palette.secondaryText },
                    ]}
                  >
                    {MIN_QUESTION_COUNT}
                  </Text>
                  <Text
                    style={[
                      styles.sliderBoundText,
                      { color: palette.secondaryText },
                    ]}
                  >
                    {MAX_QUESTION_COUNT}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.sectionDivider,
                  { backgroundColor: optionBorder },
                ]}
              />

              <View style={styles.questionTypeHeader}>
                <Text
                  style={[
                    styles.questionTypeTitle,
                    { color: palette.textOnContainer },
                  ]}
                >
                  {tUI(uiLanguage, 'review.questionTypes')}
                </Text>
                {selectedQuestionTypes.length <
                DEFAULT_REVIEW_QUESTION_TYPES.length ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.selectAllButton,
                      pressed ? styles.pressableMediumPressed : null,
                    ]}
                    onPress={selectAllQuestionTypes}
                  >
                    <Text
                      style={[styles.selectAllText, { color: MODAL_CTA_COLOR }]}
                    >
                      {tUI(uiLanguage, 'review.selectAllQuestionTypes')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.questionTypeGrid}>
                {REVIEW_QUESTION_TYPE_OPTIONS.map((option) => {
                  const presentation = QUESTION_TYPE_PRESENTATION[option.key];
                  const isSelected = selectedQuestionTypes.includes(option.key);
                  return (
                    <Pressable
                      key={option.key}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={tUI(
                        uiLanguage,
                        presentation.labelKey
                      )}
                      style={({ pressed }) => [
                        styles.questionTypeOption,
                        {
                          backgroundColor: isSelected
                            ? selectedSurface
                            : optionSurface,
                          borderColor: isSelected
                            ? selectedBorder
                            : optionBorder,
                        },
                        pressed ? styles.questionTypeOptionPressed : null,
                      ]}
                      onPress={() => toggleQuestionType(option.key)}
                    >
                      <Ionicons
                        name={presentation.icon}
                        size={18}
                        color={
                          isSelected ? MODAL_CTA_COLOR : palette.secondaryText
                        }
                      />
                      <Text
                        style={[
                          styles.questionTypeOptionText,
                          {
                            color: isSelected
                              ? palette.textOnContainer
                              : palette.secondaryText,
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {tUI(uiLanguage, presentation.labelKey)}
                      </Text>
                      <Ionicons
                        name={
                          isSelected ? 'checkmark-circle' : 'ellipse-outline'
                        }
                        size={17}
                        color={
                          isSelected
                            ? MODAL_CTA_COLOR
                            : optionBorder
                        }
                      />
                    </Pressable>
                  );
                })}
              </View>

              {sourceAlbums.length > 0 && onChangeSelectedSourceAlbumIds ? (
                <>
                  <View
                    style={[
                      styles.sectionDivider,
                      { backgroundColor: optionBorder },
                    ]}
                  />
                  <Text
                    style={[
                      styles.questionTypeTitle,
                      { color: palette.textOnContainer },
                    ]}
                  >
                    {tUI(uiLanguage, 'review.sourceAlbums')}
                  </Text>
                  <View style={styles.questionTypeGrid}>
                    {sourceAlbums.map((album) => {
                      const isSelected = selectedSourceAlbumIds.includes(
                        album.id
                      );
                      return (
                        <Pressable
                          key={album.id}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isSelected }}
                          accessibilityLabel={album.label}
                          style={({ pressed }) => [
                            styles.questionTypeOption,
                            {
                              backgroundColor: isSelected
                                ? selectedSurface
                                : optionSurface,
                              borderColor: isSelected
                                ? selectedBorder
                                : optionBorder,
                            },
                            pressed ? styles.questionTypeOptionPressed : null,
                          ]}
                          onPress={() => toggleSourceAlbum(album.id)}
                        >
                          <View
                            style={[
                              styles.sourceAlbumPreview,
                              {
                                backgroundColor:
                                  album.color || palette.modalOptionBg,
                              },
                            ]}
                          >
                            {album.coverImageUri ? (
                              <Image
                                source={{ uri: album.coverImageUri }}
                                style={styles.sourceAlbumCover}
                                resizeMode="cover"
                              />
                            ) : (
                              <Text style={styles.sourceAlbumEmoji}>
                                {album.emoji || '📁'}
                              </Text>
                            )}
                          </View>
                          <Text
                            style={[
                              styles.questionTypeOptionText,
                              {
                                color: isSelected
                                  ? palette.textOnContainer
                                  : palette.secondaryText,
                              },
                            ]}
                            numberOfLines={2}
                          >
                            {album.label}
                          </Text>
                          <Ionicons
                            name={
                              isSelected
                                ? 'checkmark-circle'
                                : 'ellipse-outline'
                            }
                            size={17}
                            color={
                              isSelected
                                ? MODAL_CTA_COLOR
                                : optionBorder
                            }
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {onChangeTodayNewWordsOnly ? (
                <>
                  <View
                    style={[
                      styles.sectionDivider,
                      { backgroundColor: optionBorder },
                    ]}
                  />
                  <View
                    style={[
                      styles.toggleRow,
                      {
                        backgroundColor: optionSurface,
                        borderColor: optionBorder,
                      },
                    ]}
                  >
                    <View style={styles.toggleCopy}>
                      <Text
                        style={[
                          styles.toggleLabel,
                          { color: palette.textOnContainer },
                        ]}
                      >
                        {tUI(uiLanguage, 'review.todayNewWordsOnly')}
                      </Text>
                    </View>
                    <Switch
                      value={todayNewWordsOnly}
                      onValueChange={onChangeTodayNewWordsOnly}
                      trackColor={{
                        false: optionBorder,
                        true: MODAL_CTA_COLOR,
                      }}
                      thumbColor={TEXT_ON_CTA}
                      ios_backgroundColor={optionBorder}
                    />
                  </View>
                </>
              ) : null}
            </ScrollView>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.doneButton,
                {
                  backgroundColor: isDarkMode
                    ? palette.modalSecondaryButtonBg
                    : optionSurface,
                  borderColor: optionBorder,
                },
                pressed ? styles.pressablePrimaryPressed : null,
              ]}
              onPress={onClose}
            >
              <Text
                style={[
                  styles.doneText,
                  {
                    color: isDarkMode
                      ? palette.modalSecondaryButtonText
                      : palette.textOnContainer,
                  },
                ]}
              >
                {tUI(uiLanguage, 'common.done')}
              </Text>
            </Pressable>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
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
    maxHeight: '92%',
    flexShrink: 1,
  },
  contentScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  content: {
    gap: 16,
    paddingBottom: 2,
  },
  eyebrow: {
    color: '#8D93A1',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
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
    borderWidth: 1,
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
    borderWidth: 1,
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
  sourceAlbumEmoji: {
    fontSize: 17,
    textAlign: 'center',
  },
  sourceAlbumPreview: {
    width: 30,
    height: 30,
    borderRadius: 9,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceAlbumCover: {
    width: '100%',
    height: '100%',
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
  questionTypeHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  questionTypeTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  selectAllButton: {
    minHeight: 28,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: '800',
  },
  questionTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  questionTypeOption: {
    minHeight: 54,
    flexBasis: '48%',
    flexGrow: 1,
    maxWidth: '49%',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  questionTypeOptionPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.99 }],
  },
  questionTypeOptionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
  },
  doneButton: {
    marginTop: 4,
    borderRadius: BUTTON_TOKENS.radius.lg,
    borderWidth: 1,
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
    opacity: 0.96,
    transform: [{ scale: 0.99 }],
  },
  pressableIconPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
});
