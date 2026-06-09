import React from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Text as SvgText } from 'react-native-svg';
import Animated, {
  FadeIn,
  FadeInRight,
  FadeOut,
  FadeOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import AnimatedSplashV2 from '../../components/UI/shared/AnimatedSplashV2';
import { useAppTour } from '../../contexts/AppTourContext';
import { BUTTON_TOKENS } from '../../theme/buttonTokens';
import {
  MODAL_CTA_COLOR,
  MODAL_CTA_COLOR_BORDER,
  TEXT_ON_CTA,
  resolveThemeColors,
} from '../../theme/colors';
import { supabase } from '../../services/supabase/client';
import {
  LEARNING_LANGUAGE_OPTIONS,
  getDefaultTTSVoiceForLearningLanguages,
  getPrimaryAIReplyLanguageForLearningLanguages,
  type LearningLanguage,
  loadUserSettings,
  normalizeAIBreakdownMode,
  normalizeLearningLanguages,
  saveUserSettings,
} from '../../services/settings/userSettings';
import { prepareOCRLanguagesForLearningLanguages } from '../../services/ocr/languagePacks';

type OnboardingStep = 1 | 2 | 3 | 4;

type OnboardingAnswers = {
  learningLanguages: LearningLanguage[];
  captureHabit: string;
  stumbleContext: string;
  breakdownDepth: string;
};

type StickerOption = {
  value: string;
  label: string;
  imageSource: ImageSourcePropType;
};

type Props = {
  userId: string;
  onComplete: () => void;
};

const Q1_SCREENSHOT_IMAGE = require('../../../assets/onboarding_q1_assets/screenshot-icon-cutout.png');
const Q1_NOTE_IMAGE = require('../../../assets/onboarding_q1_assets/sticky-note-cutout.png');
const Q1_SEARCH_IMAGE = require('../../../assets/onboarding_q1_assets/search-icon-cutout.png');
const Q2_BOOK_IMAGE = require('../../../assets/onboarding_q2_assets/q2-book-cutout.png');
const Q2_HEADPHONES_IMAGE = require('../../../assets/onboarding_q2_assets/q2-headphones-cutout.png');
const Q2_TV_IMAGE = require('../../../assets/onboarding_q2_assets/q2-tv-cutout.png');
const Q3_NODES_IMAGE = require('../../../assets/onboarding_q3_assets/q3-nodes-cutout.png');
const Q3_BUBBLE_IMAGE = require('../../../assets/onboarding_q3_assets/q3-bubble-cutout.png');
const Q3_LIGHTNING_IMAGE = require('../../../assets/onboarding_q3_assets/q3-lightning-cutout.png');

const CAPTURE_HABIT_OPTIONS: StickerOption[] = [
  { value: 'screenshot_dust', label: 'Screenshot', imageSource: Q1_SCREENSHOT_IMAGE },
  { value: 'notes_graveyard', label: 'Notes', imageSource: Q1_NOTE_IMAGE },
  { value: 'google_focus_break', label: 'Search', imageSource: Q1_SEARCH_IMAGE },
];

const STUMBLE_CONTEXT_OPTIONS: StickerOption[] = [
  { value: 'deep_reading', label: 'Reading', imageSource: Q2_BOOK_IMAGE },
  { value: 'on_the_go', label: 'Listening', imageSource: Q2_HEADPHONES_IMAGE },
  { value: 'browsing_watching', label: 'Watching', imageSource: Q2_TV_IMAGE },
];

const BREAKDOWN_DEPTH_OPTIONS: StickerOption[] = [
  { value: 'short_punchy', label: 'Clarity', imageSource: Q3_LIGHTNING_IMAGE  },
  { value: 'context', label: 'Application', imageSource: Q3_BUBBLE_IMAGE },
  { value: 'deep_dive', label: 'Mastery', imageSource: Q3_NODES_IMAGE},
];

const ALL_STICKER_OPTIONS = [
  ...CAPTURE_HABIT_OPTIONS,
  ...STUMBLE_CONTEXT_OPTIONS,
  ...BREAKDOWN_DEPTH_OPTIONS,
];

const EMPTY_SELECTED_BY_STEP: Record<OnboardingStep, string[]> = {
  1: [],
  2: [],
  3: [],
  4: [],
};

const QUESTION_TRANSITION_IN_MS = 360;
const QUESTION_TRANSITION_OUT_MS = 260;

function getProgressLabel(step: OnboardingStep): string {
  return `${step}/4`;
}

function getOnboardingErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'object' && error !== null) {
    const maybeMessage = 'message' in error && typeof error.message === 'string' ? error.message : '';
    const maybeDetails = 'details' in error && typeof error.details === 'string' ? error.details : '';
    const maybeHint = 'hint' in error && typeof error.hint === 'string' ? error.hint : '';
    const parts = [maybeMessage, maybeDetails, maybeHint].map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) return parts.join('\n');
  }
  if (typeof error === 'string' && error.trim()) return error;
  return 'Unable to save onboarding data. Please try again.';
}

function triggerOnboardingQuestionHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function mapBreakdownDepthToEnglishLevel(value: string): string {
  if (value.includes('deep_dive')) return 'advanced';
  if (value.includes('short_punchy')) return 'beginner';
  return 'intermediate';
}

function mapStumbleContextToLearningGoal(value: string): string {
  if (value.includes('deep_reading')) return 'academic';
  if (value.includes('browsing_watching')) return 'slang';
  if (value.includes('on_the_go')) return 'everyday';
  return 'casual';
}

function getQuestionForStep(step: OnboardingStep): string {
  if (step === 1) {
    return 'What languages do you want to learn?';
  }
  if (step === 2) {
    return 'What do you do when you see a word you don\'t know?';
  }
  if (step === 3) {
    return 'Where do you see these words?';
  }
  return 'How thorough do you want us to be?';
}

function getAnswerKeyForStep(step: OnboardingStep): keyof OnboardingAnswers {
  if (step === 1) return 'learningLanguages';
  if (step === 2) return 'captureHabit';
  if (step === 3) return 'stumbleContext';
  return 'breakdownDepth';
}

function LanguageWordSticker({
  option,
  isSelected,
  onPress,
}: {
  option: (typeof LEARNING_LANGUAGE_OPTIONS)[number];
  isSelected: boolean;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const selectedScale = useSharedValue(isSelected ? 1.06 : 1);
  const pressScale = useSharedValue(1);

  React.useEffect(() => {
    selectedScale.value = withSpring(isSelected ? 1.06 : 1, { damping: 13, stiffness: 190, mass: 0.85 });
  }, [isSelected, selectedScale]);

  const stickerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: selectedScale.value * pressScale.value }],
  }));

  const handlePressIn = React.useCallback(() => {
    pressScale.value = withSpring(0.96, { damping: 18, stiffness: 360, mass: 0.75 });
  }, [pressScale]);

  const handlePressOut = React.useCallback(() => {
    pressScale.value = withSpring(1, { damping: 16, stiffness: 420, mass: 0.75 });
  }, [pressScale]);

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.languageStickerPressable}>
      <Animated.View
        style={[
          styles.languageStickerGroup,
          {
            opacity: isSelected ? 1 : 0.82,
            shadowColor: isSelected ? MODAL_CTA_COLOR : '#000000',
            shadowOpacity: isSelected ? 0.34 : 0.12,
            shadowRadius: isSelected ? 20 : 10,
          },
          stickerStyle,
        ]}
      >
        <Svg width={116} height={74} viewBox="0 0 116 74" style={styles.languageStickerSvg}>
          <SvgText
            x="58"
            y="48"
            textAnchor="middle"
            fontSize="33"
            fontWeight="900"
            stroke={palette.screenBg}
            strokeWidth={8}
            strokeLinejoin="round"
            fill={isSelected ? MODAL_CTA_COLOR : palette.textOnBg}
          >
            {option.stickerText}
          </SvgText>
          <SvgText
            x="58"
            y="48"
            textAnchor="middle"
            fontSize="33"
            fontWeight="900"
            fill={isSelected ? MODAL_CTA_COLOR : palette.textOnBg}
          >
            {option.stickerText}
          </SvgText>
        </Svg>
        <Text style={[styles.languageStickerLabel, { color: isSelected ? MODAL_CTA_COLOR : palette.secondaryText }]}>
          {option.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function LearningLanguageStickerLayout({
  active,
  selectedValues,
  onToggle,
}: {
  active: boolean;
  selectedValues: string[];
  onToggle: (value: string) => void;
}) {
  const visibleProgress = useSharedValue(active ? 1 : 0);

  React.useEffect(() => {
    visibleProgress.value = withTiming(active ? 1 : 0, {
      duration: active ? QUESTION_TRANSITION_IN_MS : QUESTION_TRANSITION_OUT_MS,
    });
  }, [active, visibleProgress]);

  const layoutStyle = useAnimatedStyle(() => ({
    opacity: visibleProgress.value,
    transform: [{ translateX: (1 - visibleProgress.value) * 24 }],
  }));

  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      style={[
        styles.languageStickerLayout,
        active ? styles.stickerLayoutActive : styles.stickerLayoutHidden,
        layoutStyle,
      ]}
    >
      {LEARNING_LANGUAGE_OPTIONS.map((option) => (
        <LanguageWordSticker
          key={option.value}
          option={option}
          isSelected={selectedValues.includes(option.value)}
          onPress={() => onToggle(option.value)}
        />
      ))}
    </Animated.View>
  );
}

function SelectableSticker({
  imageSource,
  label,
  isSelected,
  onPress,
}: {
  imageSource: ImageSourcePropType;
  label: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const selectedScale = useSharedValue(isSelected ? 1.05 : 1);
  const pressScale = useSharedValue(1);

  React.useEffect(() => {
    selectedScale.value = withSpring(isSelected ? 1.05 : 1, { damping: 13, stiffness: 190, mass: 0.85 });
  }, [isSelected, selectedScale]);

  const stickerGroupStyle = useAnimatedStyle(() => ({
    transform: [{ scale: selectedScale.value * pressScale.value }],
  }));

  const handlePressIn = React.useCallback(() => {
    pressScale.value = withSpring(0.96, { damping: 18, stiffness: 360, mass: 0.75 });
  }, [pressScale]);

  const handlePressOut = React.useCallback(() => {
    pressScale.value = withSpring(1, { damping: 16, stiffness: 420, mass: 0.75 });
  }, [pressScale]);

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.stickerPressable}>
      <Animated.View style={[styles.stickerGroup, stickerGroupStyle]}>
        <View
          style={[
            styles.stickerShell,
            {
              opacity: isSelected ? 1 : 0.82,
              shadowColor: isSelected ? '#00E5FF' : '#000000',
              shadowOpacity: isSelected ? 0.3 : 0.1,
              shadowRadius: isSelected ? 18 : 10,
            },
          ]}
        >
          <Image source={imageSource} resizeMode="contain" style={styles.stickerImage} />
        </View>
        <Text style={[styles.stickerLabel, { color: isSelected ? MODAL_CTA_COLOR : palette.secondaryText }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}


function StickerOptionLayout({
  active,
  options,
  selectedValues,
  onToggle,
}: {
  active: boolean;
  options: StickerOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
}) {
  const visibleProgress = useSharedValue(active ? 1 : 0);

  React.useEffect(() => {
    visibleProgress.value = withTiming(active ? 1 : 0, {
      duration: active ? QUESTION_TRANSITION_IN_MS : QUESTION_TRANSITION_OUT_MS,
    });
  }, [active, visibleProgress]);

  const layoutStyle = useAnimatedStyle(() => ({
    opacity: visibleProgress.value,
    transform: [{ translateX: (1 - visibleProgress.value) * 24 }],
  }));

  const [topOption, leftOption, rightOption] = options;

  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.stickerLayout, active ? styles.stickerLayoutActive : styles.stickerLayoutHidden, layoutStyle]}
    >
      <View style={styles.topStickerRow}>
        <SelectableSticker
          imageSource={topOption.imageSource}
          label={topOption.label}
          isSelected={selectedValues.includes(topOption.value)}
          onPress={() => onToggle(topOption.value)}
        />
      </View>
      <View style={styles.bottomStickerRow}>
        <SelectableSticker
          imageSource={leftOption.imageSource}
          label={leftOption.label}
          isSelected={selectedValues.includes(leftOption.value)}
          onPress={() => onToggle(leftOption.value)}
        />
        <SelectableSticker
          imageSource={rightOption.imageSource}
          label={rightOption.label}
          isSelected={selectedValues.includes(rightOption.value)}
          onPress={() => onToggle(rightOption.value)}
        />
      </View>
    </Animated.View>
  );
}

export default function OnboardingFlow({ userId, onComplete }: Props) {
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const appTour = useAppTour();
  const [step, setStep] = React.useState<OnboardingStep>(1);
  const [answers, setAnswers] = React.useState<OnboardingAnswers>({
    learningLanguages: [],
    captureHabit: '',
    stumbleContext: '',
    breakdownDepth: '',
  });
  const [selectedStickerIds, setSelectedStickerIds] = React.useState<Record<OnboardingStep, string[]>>(EMPTY_SELECTED_BY_STEP);
  const [saving, setSaving] = React.useState(false);
  const [showCompletionSplash, setShowCompletionSplash] = React.useState(false);
  const shouldStartTourAfterSplashRef = React.useRef(false);

  const selectedValues = selectedStickerIds[step];
  const canContinue = selectedValues.length > 0 && !saving;

  React.useEffect(() => {
    ALL_STICKER_OPTIONS.forEach((option) => {
      const resolved = Image.resolveAssetSource(option.imageSource);
      if (resolved?.uri) {
        void Image.prefetch(resolved.uri);
      }
    });
  }, []);

  const saveOnboardingData = React.useCallback(async (answersToSave: OnboardingAnswers = answers) => {
    const { data: userData } = await supabase.auth.getUser();
    const userEmail = userData.user?.email?.trim() || `${userId}@nuances.local`;
    const aiBreakdownMode = normalizeAIBreakdownMode(answersToSave.breakdownDepth);
    const learningLanguages = normalizeLearningLanguages(answersToSave.learningLanguages);
    const primaryLearningAIReplyLanguage = getPrimaryAIReplyLanguageForLearningLanguages(learningLanguages);
    const learningTTSVoice = getDefaultTTSVoiceForLearningLanguages(learningLanguages);
    const currentSettings = await loadUserSettings();
    await saveUserSettings({
      ...currentSettings,
      learningLanguages,
      ttsVoice: learningTTSVoice,
      ttsVoiceByLanguage: {
        ...currentSettings.ttsVoiceByLanguage,
        [primaryLearningAIReplyLanguage]: learningTTSVoice,
      },
      personalization: {
        ...currentSettings.personalization,
        aiBreakdownMode,
      },
    });
    void prepareOCRLanguagesForLearningLanguages(learningLanguages);
    const { error } = await supabase.from('profiles').upsert(
      {
        id: userId,
        email: userEmail,
        target_language: learningLanguages.join(','),
        native_language: 'en',
        english_level: mapBreakdownDepthToEnglishLevel(answersToSave.breakdownDepth),
        learning_goal: mapStumbleContextToLearningGoal(answersToSave.stumbleContext),
        ai_breakdown_mode: aiBreakdownMode,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) throw error;
  }, [answers, userId]);

  const shouldStartTour = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('has_seen_tour')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data?.has_seen_tour !== true;
  }, [userId]);

  const completeOnboarding = React.useCallback(async (answersToSave: OnboardingAnswers = answers) => {
    await saveOnboardingData(answersToSave);
    shouldStartTourAfterSplashRef.current = await shouldStartTour();
    setShowCompletionSplash(true);
  }, [answers, saveOnboardingData, shouldStartTour]);

  const handleCompletionSplashFinished = React.useCallback(() => {
    if (shouldStartTourAfterSplashRef.current) {
      appTour.startTour();
    }
    onComplete();
  }, [appTour, onComplete]);

  const toggleSticker = React.useCallback((value: string) => {
    const answerKey = getAnswerKeyForStep(step);
    triggerOnboardingQuestionHaptic();
    setSelectedStickerIds((prev) => {
      const currentValues = prev[step];
      const nextValues = step === 4
        ? [value]
        : currentValues.includes(value)
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value];
      setAnswers((currentAnswers) => ({
        ...currentAnswers,
        [answerKey]: answerKey === 'learningLanguages' ? normalizeLearningLanguages(nextValues) : nextValues.join(','),
      }));
      return { ...prev, [step]: nextValues };
    });
  }, [step]);

  const advanceStep = React.useCallback(() => {
    if (!canContinue) return;
    triggerOnboardingQuestionHaptic();
    if (step === 1) {
      void prepareOCRLanguagesForLearningLanguages(normalizeLearningLanguages(selectedValues));
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    if (step === 3) {
      setStep(4);
      return;
    }
    setSaving(true);
    void completeOnboarding(answers).catch((error) => {
      const message = getOnboardingErrorMessage(error);
      console.error('[Onboarding] completion failed:', error);
      Alert.alert('Onboarding failed', message);
      setSaving(false);
    });
  }, [answers, canContinue, completeOnboarding, selectedValues, step]);

  if (showCompletionSplash) {
    return (
      <View style={[styles.root, { backgroundColor: palette.screenBg }]}>
        <AnimatedSplashV2 ready={true} onAnimationComplete={handleCompletionSplashFinished} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.screenBg }]}>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(78,175,244,0.18)', 'rgba(78,175,244,0.04)', 'transparent']}
        style={styles.topGlow}
      />
      <View style={styles.header}>
        <Text style={[styles.progressText, { color: palette.secondaryText }]}>{getProgressLabel(step)}</Text>
      </View>

      <View style={styles.headerSection}>
        <Animated.View
          key={`question-${step}`}
          entering={FadeInRight.duration(QUESTION_TRANSITION_IN_MS)}
          exiting={FadeOutLeft.duration(QUESTION_TRANSITION_OUT_MS)}
        >
          <Text style={[styles.title, { color: palette.textOnBg }]}>{getQuestionForStep(step)}</Text>
          <Text style={[styles.subtitle, { color: palette.secondaryText }]}>Pick anything that fits.</Text>
        </Animated.View>
      </View>

      <View style={styles.stickerStage}>
        <LearningLanguageStickerLayout
          active={step === 1}
          selectedValues={selectedStickerIds[1]}
          onToggle={toggleSticker}
        />
        <StickerOptionLayout
          active={step === 2}
          options={CAPTURE_HABIT_OPTIONS}
          selectedValues={selectedStickerIds[2]}
          onToggle={toggleSticker}
        />
        <StickerOptionLayout
          active={step === 3}
          options={STUMBLE_CONTEXT_OPTIONS}
          selectedValues={selectedStickerIds[3]}
          onToggle={toggleSticker}
        />
        <StickerOptionLayout
          active={step === 4}
          options={BREAKDOWN_DEPTH_OPTIONS}
          selectedValues={selectedStickerIds[4]}
          onToggle={toggleSticker}
        />
      </View>

      <View style={styles.actionSection}>
        <Pressable
          disabled={!canContinue}
          onPress={advanceStep}
          style={({ pressed }) => [
            styles.continueButton,
            {
              backgroundColor: canContinue ? MODAL_CTA_COLOR : palette.modalOptionBg,
              borderColor: canContinue ? MODAL_CTA_COLOR_BORDER : palette.modalOptionBorder,
              opacity: canContinue ? 1 : 0.58,
              shadowOpacity: canContinue ? 0.28 : 0,
            },
            pressed && canContinue ? styles.continueButtonPressed : null,
          ]}
        >
          <Text style={[styles.continueText, { color: canContinue ? TEXT_ON_CTA : palette.secondaryText }]}>
            {step === 4 ? (saving ? 'Saving...' : 'Start Nuances') : 'Continue'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48%',
  },
  header: {
    minHeight: 46,
    paddingHorizontal: 20,
    paddingTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  headerSection: {
    paddingHorizontal: 20,
    minHeight: 98,
    justifyContent: 'center',
  },
  title: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  stickerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 4,
    width: '100%',
  },
  languageStickerLayout: {
    position: 'absolute',
    width: '100%',
    maxWidth: 360,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 18,
    rowGap: 16,
  },
  languageStickerPressable: {
    width: 112,
    alignItems: 'center',
  },
  languageStickerGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  languageStickerSvg: {
    overflow: 'visible',
  },
  languageStickerLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  stickerLayout: {
    position: 'absolute',
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  stickerLayoutActive: {
    zIndex: 2,
  },
  stickerLayoutHidden: {
    zIndex: 1,
  },
  topStickerRow: {
    width: '100%',
    alignItems: 'center',
  },
  bottomStickerRow: {
    width: '100%',
    maxWidth: 330,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  stickerPressable: {
    width: 138,
    alignItems: 'center',
  },
  stickerGroup: {
    alignItems: 'center',
  },
  stickerShell: {
    width: 126,
    height: 126,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  stickerImage: {
    width: '112%',
    height: '112%',
  },
  stickerLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  actionSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
  },
  continueButton: {
    height: BUTTON_TOKENS.height.prominent,
    borderRadius: BUTTON_TOKENS.radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00E5FF',
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  continueButtonPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  continueText: {
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
    letterSpacing: 0.2,
  },
});
