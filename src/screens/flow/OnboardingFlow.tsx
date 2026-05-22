import React from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import LightPressable from '../../components/UI/shared/LightPressable';
import { BUTTON_TOKENS } from '../../theme/buttonTokens';
import {
  MODAL_CTA_COLOR,
  MODAL_CTA_COLOR_BORDER,
  TEXT_ON_CTA,
  UPLOAD_CACHE_CTA_COLOR,
  UPLOAD_CACHE_CTA_COLOR_BORDER,
  resolveThemeColors,
} from '../../theme/colors';
import { supabase } from '../../services/supabase/client';
import {
  getDefaultTTSVoiceForAIReplyLanguage,
  loadUserSettings,
  saveUserSettings,
  withUpdatedTTSVoiceForLanguage,
  type AIReplyLanguage,
} from '../../services/settings/userSettings';

const APP_CUTOUT_ICON = require('../../../assets/icon_cutout2.png');

type OnboardingStep = 1 | 2 | 3 | 4;

type OnboardingAnswers = {
  nativeLanguage: string;
  englishLevel: string;
  learningGoal: string;
};

type Option = {
  value: string;
  label: string;
  hint?: string;
};

type Props = {
  userId: string;
  onComplete: () => void;
};

const LANGUAGE_OPTIONS: Option[] = [
  { value: 'es', label: 'Spanish', hint: 'Español' },
  { value: 'zh-TW', label: 'Mandarin', hint: '繁中 / 中文' },
  { value: 'ja', label: 'Japanese', hint: '日本語' },
  { value: 'ko', label: 'Korean', hint: '한국어' },
  { value: 'en', label: 'English', hint: 'English first' },
  { value: 'fr', label: 'French', hint: 'Français' },
];

const LEVEL_OPTIONS: Option[] = [
  { value: 'beginner', label: 'Beginner', hint: 'I need simple, clear cards' },
  { value: 'intermediate', label: 'Intermediate', hint: 'I can learn from context' },
  { value: 'advanced', label: 'Advanced', hint: 'Give me nuance and precision' },
];

const GOAL_OPTIONS: Option[] = [
  { value: 'business', label: 'Business English', hint: 'work, meetings, email' },
  { value: 'everyday', label: 'Everyday Fluency', hint: 'natural daily speech' },
  { value: 'academic', label: 'Academic', hint: 'reading, exams, writing' },
  { value: 'slang', label: 'Slang', hint: 'internet and pop culture' },
];

function getProgressLabel(step: OnboardingStep): string {
  return `${step}/4`;
}

function getPreviousStep(step: OnboardingStep): OnboardingStep {
  if (step === 4) return 3;
  if (step === 3) return 2;
  return 1;
}

function isAIReplyLanguage(value: string): value is AIReplyLanguage {
  return (
    value === 'zh-TW' ||
    value === 'zh-CN' ||
    value === 'en' ||
    value === 'ja' ||
    value === 'ko' ||
    value === 'es' ||
    value === 'fr'
  );
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

function OptionCard({ option, selected, onPress }: { option: Option; selected: boolean; onPress: () => void }) {
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const isLight = colorScheme === 'light';

  return (
    <LightPressable pressedScale={0.985} pressedOpacity={0.96} style={styles.optionPressable} onPress={onPress}>
      <View
        style={[
          styles.optionCard,
          {
            backgroundColor: selected ? MODAL_CTA_COLOR : palette.modalOptionBg,
            borderColor: selected ? MODAL_CTA_COLOR_BORDER : palette.modalOptionBorder,
            shadowColor: selected ? '#00E5FF' : isLight ? '#0F172A' : '#000000',
            shadowOpacity: selected ? 0.24 : 0.08,
            shadowRadius: selected ? 16 : 10,
          },
        ]}
      >
        <View style={styles.optionTextBlock}>
          <Text style={[styles.optionLabel, { color: selected ? TEXT_ON_CTA : palette.textOnContainer }]}>
            {option.label}
          </Text>
          {option.hint ? (
            <Text style={[styles.optionHint, { color: selected ? 'rgba(255,255,255,0.82)' : palette.secondaryText }]}>
              {option.hint}
            </Text>
          ) : null}
        </View>
        {selected ? <Ionicons name="checkmark" size={20} color={TEXT_ON_CTA} /> : null}
      </View>
    </LightPressable>
  );
}

export default function OnboardingFlow({ userId, onComplete }: Props) {
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const [step, setStep] = React.useState<OnboardingStep>(1);
  const [answers, setAnswers] = React.useState<OnboardingAnswers>({
    nativeLanguage: '',
    englishLevel: '',
    learningGoal: '',
  });
  const [saving, setSaving] = React.useState(false);
  const advanceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const chooseAnswer = React.useCallback(
    (key: keyof OnboardingAnswers, value: string, nextStep: OnboardingStep) => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      setAnswers((prev) => ({ ...prev, [key]: value }));
      advanceTimerRef.current = setTimeout(() => {
        setStep(nextStep);
        advanceTimerRef.current = null;
      }, 360);
    },
    []
  );

  const handleBack = React.useCallback(() => {
    if (saving || step === 1) return;
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    setStep(getPreviousStep(step));
  }, [saving, step]);

  const saveOnboardingData = React.useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userEmail = userData.user?.email?.trim() || `${userId}@nuances.local`;
    if (isAIReplyLanguage(answers.nativeLanguage)) {
      const settings = await loadUserSettings();
      const defaultVoice = getDefaultTTSVoiceForAIReplyLanguage(answers.nativeLanguage);
      await saveUserSettings(withUpdatedTTSVoiceForLanguage(settings, answers.nativeLanguage, defaultVoice));
    }
    const { error } = await supabase.from('profiles').upsert(
      {
        id: userId,
        email: userEmail,
        native_language: answers.nativeLanguage,
        english_level: answers.englishLevel,
        learning_goal: answers.learningGoal,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) throw error;
  }, [answers.englishLevel, answers.learningGoal, answers.nativeLanguage, userId]);

  const handleEnableMicrophone = React.useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await Audio.requestPermissionsAsync();
      await saveOnboardingData();
      onComplete();
    } catch (error) {
      const message = getOnboardingErrorMessage(error);
      console.error('[Onboarding] completion failed:', error);
      Alert.alert('Onboarding failed', message);
    } finally {
      setSaving(false);
    }
  }, [onComplete, saveOnboardingData, saving]);

  const renderOptions = (items: Option[], keyName: keyof OnboardingAnswers, nextStep: OnboardingStep) => (
    <View style={styles.optionList}>
      {items.map((item) => (
        <OptionCard
          key={item.value}
          option={item}
          selected={answers[keyName] === item.value}
          onPress={() => chooseAnswer(keyName, item.value, nextStep)}
        />
      ))}
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.screenBg }]}>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(78,175,244,0.18)', 'rgba(78,175,244,0.04)', 'transparent']}
        style={styles.topGlow}
      />
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {step > 1 ? (
            <LightPressable
              style={[styles.backButton, { backgroundColor: palette.modalOptionBg, borderColor: palette.modalOptionBorder }]}
              pressedScale={0.96}
              pressedOpacity={0.9}
              disabled={saving}
              onPress={handleBack}
            >
              <Ionicons name="chevron-back" size={22} color={palette.textOnContainer} />
            </LightPressable>
          ) : (
            <Image source={APP_CUTOUT_ICON} style={styles.logo} resizeMode="contain" />
          )}
        </View>
        <Text style={[styles.progressText, { color: palette.secondaryText }]}>{getProgressLabel(step)}</Text>
      </View>

      <Animated.View
        key={step}
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(160)}
        style={styles.stepCard}
      >
        {step === 1 ? (
          <>
            <Text style={[styles.title, { color: palette.textOnBg }]}>What is your native language?</Text>
            <Text style={[styles.subtitle, { color: palette.secondaryText }]}>We use this to tune translations and explanations.</Text>
            {renderOptions(LANGUAGE_OPTIONS, 'nativeLanguage', 2)}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={[styles.title, { color: palette.textOnBg }]}>What is your current English level?</Text>
            <Text style={[styles.subtitle, { color: palette.secondaryText }]}>Nuances will keep cards concise or detailed based on this.</Text>
            {renderOptions(LEVEL_OPTIONS, 'englishLevel', 3)}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={[styles.title, { color: palette.textOnBg }]}>What is your primary goal?</Text>
            <Text style={[styles.subtitle, { color: palette.secondaryText }]}>This shapes examples, context, and review questions.</Text>
            {renderOptions(GOAL_OPTIONS, 'learningGoal', 4)}
          </>
        ) : null}

        {step === 4 ? (
          <View style={styles.permissionBlock}>
            <View style={[styles.micBadge, { backgroundColor: palette.containerBg, borderColor: palette.modalOptionBorder }]}>
              <Ionicons name="mic" size={38} color={MODAL_CTA_COLOR} />
            </View>
            <Text style={[styles.title, styles.permissionTitle, { color: palette.textOnBg }]}>Enable Pronunciation Coach</Text>
            <Text style={[styles.subtitle, styles.permissionText, { color: palette.secondaryText }]}>Nuances uses your microphone only when you practice. The AI Pronunciation Coach analyzes your speech so it can score accuracy and show where to improve.</Text>
            <LightPressable
              style={[styles.primaryButton, saving ? styles.primaryButtonDisabled : null]}
              pressedScale={0.985}
              pressedOpacity={0.96}
              disabled={saving}
              onPress={handleEnableMicrophone}
            >
              <View style={styles.primaryButtonSurface}>
                {saving ? <ActivityIndicator color={TEXT_ON_CTA} /> : null}
                <Text style={styles.primaryButtonText}>{saving ? 'Setting up...' : 'Enable Microphone'}</Text>
              </View>
            </LightPressable>
          </View>
        ) : null}
      </Animated.View>
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
    minHeight: 78,
    paddingHorizontal: 20,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    width: 54,
    height: 54,
  },
  headerSide: {
    width: 58,
    minHeight: 58,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  stepCard: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -1.1,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  optionList: {
    marginTop: 28,
    gap: 12,
  },
  optionPressable: {
    borderRadius: BUTTON_TOKENS.radius.lg,
  },
  optionCard: {
    minHeight: 72,
    borderRadius: BUTTON_TOKENS.radius.lg,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  optionTextBlock: {
    flex: 1,
    paddingRight: 12,
  },
  optionLabel: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  optionHint: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  permissionBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 54,
  },
  micBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  permissionTitle: {
    textAlign: 'center',
  },
  permissionText: {
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  primaryButton: {
    width: '100%',
    marginTop: 32,
    borderRadius: BUTTON_TOKENS.radius.lg,
    backgroundColor: UPLOAD_CACHE_CTA_COLOR,
    borderWidth: 1,
    borderColor: UPLOAD_CACHE_CTA_COLOR_BORDER,
    shadowColor: '#00E5FF',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  primaryButtonDisabled: {
    opacity: 0.62,
  },
  primaryButtonSurface: {
    minHeight: BUTTON_TOKENS.height.prominent,
    borderRadius: BUTTON_TOKENS.radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: TEXT_ON_CTA,
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
});
