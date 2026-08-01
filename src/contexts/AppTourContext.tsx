import React from 'react';
import { Linking } from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@services/supabase/client';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import { markTourSeenLocally } from '../features/tour/tourSeen';

export type AppTourStep =
  | 'IDLE'
  | 'STEP_2_UPLOAD_SAMPLE'
  | 'STEP_3_PASTE_SAMPLE_TEXT'
  | 'STEP_4_ADD_SAMPLE_TEXT'
  | 'STEP_5_PROCESS_CACHE_CARD'
  | 'STEP_5_SELECT_TARGET'
  | 'STEP_6_GENERATE_SAMPLE'
  | 'STEP_7_SAVE_SAMPLE'
  | 'STEP_8_FLICK_CARD'
  | 'STEP_9_COACH_SAMPLE'
  | 'STEP_10_QUIZ_SAMPLE'
  | 'STEP_11_CREATE_ALBUM'
  | 'STEP_12_CONFIRM_ALBUM'
  | 'STEP_13_ALBUM_SETTINGS'
  | 'COMPLETED';

type AppTourContextValue = {
  step: AppTourStep;
  isActive: boolean;
  sampleCardId: string | null;
  startTour: () => void;
  goToStep: (step: AppTourStep) => void;
  nextStep: () => void;
  setSampleCardId: (cardId: string | null) => void;
  completeTour: () => void;
  skipTour: () => void;
  resetTourState: () => void;
};

const AppTourContext = React.createContext<AppTourContextValue | null>(null);
const DEV_SKIP_TOUR_PATH = '://dev/skip-tour';
const DEV_RESET_ONBOARDING_PATH = '://dev/reset-onboarding';
const DEV_REPLAY_TOUR_PATH = '://dev/replay-tour';

function getNextStep(step: AppTourStep): AppTourStep {
  switch (step) {
    case 'STEP_8_FLICK_CARD':
      return 'STEP_9_COACH_SAMPLE';
    case 'STEP_2_UPLOAD_SAMPLE':
      return 'STEP_3_PASTE_SAMPLE_TEXT';
    case 'STEP_3_PASTE_SAMPLE_TEXT':
      return 'STEP_4_ADD_SAMPLE_TEXT';
    case 'STEP_4_ADD_SAMPLE_TEXT':
      return 'STEP_5_PROCESS_CACHE_CARD';
    case 'STEP_5_PROCESS_CACHE_CARD':
      return 'STEP_5_SELECT_TARGET';
    case 'STEP_5_SELECT_TARGET':
      return 'STEP_6_GENERATE_SAMPLE';
    case 'STEP_6_GENERATE_SAMPLE':
      return 'STEP_7_SAVE_SAMPLE';
    case 'STEP_7_SAVE_SAMPLE':
      return 'STEP_8_FLICK_CARD';
    case 'STEP_9_COACH_SAMPLE':
      return 'STEP_10_QUIZ_SAMPLE';
    case 'STEP_10_QUIZ_SAMPLE':
      return 'STEP_11_CREATE_ALBUM';
    case 'STEP_11_CREATE_ALBUM':
      return 'STEP_12_CONFIRM_ALBUM';
    case 'STEP_12_CONFIRM_ALBUM':
      return 'STEP_13_ALBUM_SETTINGS';
    case 'STEP_13_ALBUM_SETTINGS':
      return 'COMPLETED';
    default:
      return step;
  }
}

function triggerTourAdvanceHaptic() {
  void Haptics.selectionAsync();
}

function triggerTourCompleteHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function AppTourProvider({ children }: { children: React.ReactNode }) {
  const [step, setStep] = React.useState<AppTourStep>('IDLE');
  const [isRunning, setIsRunning] = React.useState(false);
  const [sampleCardId, setSampleCardId] = React.useState<string | null>(null);
  const didMarkTourSeenRef = React.useRef(false);

  const nextStep = React.useCallback(() => {
    setStep((current) => {
      const next = getNextStep(current);
      if (next === current) return current;
      triggerTourAdvanceHaptic();
      return next;
    });
  }, []);

  const goToStep = React.useCallback((nextStepValue: AppTourStep) => {
    if (nextStepValue.startsWith('STEP_')) setIsRunning(true);
    setStep(nextStepValue);
  }, []);

  const markTourSeen = React.useCallback(async () => {
    if (didMarkTourSeenRef.current) return;
    didMarkTourSeenRef.current = true;
    try {
      const userId = await getCurrentSessionUserId();
      if (!userId) return;
      await markTourSeenLocally(userId);
      const { error } = await supabase
        .from('profiles')
        .update({ has_seen_tour: true, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;
    } catch (error) {
      didMarkTourSeenRef.current = false;
      console.warn('[AppTour] mark tour seen failed:', error);
    }
  }, []);

  const startTour = React.useCallback(() => {
    didMarkTourSeenRef.current = false;
    setIsRunning(true);
    void markTourSeen();
    setSampleCardId(null);
    setStep((current) => (current === 'IDLE' || current === 'COMPLETED' ? 'STEP_2_UPLOAD_SAMPLE' : current));
  }, [markTourSeen]);

  const completeTour = React.useCallback(() => {
    triggerTourCompleteHaptic();
    setIsRunning(false);
    setStep('COMPLETED');
    void markTourSeen();
  }, [markTourSeen]);

  const skipTour = React.useCallback(() => {
    void Haptics.selectionAsync();
    setIsRunning(false);
    setStep('COMPLETED');
    void markTourSeen();
  }, [markTourSeen]);

  React.useEffect(() => {
    if (!__DEV__) return undefined;

    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.includes(DEV_RESET_ONBOARDING_PATH)) {
        didMarkTourSeenRef.current = false;
        setIsRunning(false);
        setSampleCardId(null);
        setStep('IDLE');
        return;
      }
      if (url.includes(DEV_REPLAY_TOUR_PATH)) {
        didMarkTourSeenRef.current = false;
        setIsRunning(true);
        setSampleCardId(null);
        void markTourSeen();
        setStep('STEP_2_UPLOAD_SAMPLE');
        return;
      }
      if (url.includes(DEV_SKIP_TOUR_PATH)) {
        skipTour();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [markTourSeen, skipTour]);

  const resetTourState = React.useCallback(() => {
    setStep('IDLE');
  }, []);

  const value = React.useMemo<AppTourContextValue>(
    () => ({
      step,
      isActive: isRunning,
      sampleCardId,
      startTour,
      goToStep,
      isRunning,
      nextStep,
      setSampleCardId,
      completeTour,
      skipTour,
      resetTourState,
    }),
    [
      completeTour,
      goToStep,
      nextStep,
      resetTourState,
      sampleCardId,
      skipTour,
      startTour,
      step,
    ]
  );

  return (
    <AppTourContext.Provider value={value}>
      {children}
    </AppTourContext.Provider>
  );
}

export function useAppTour() {
  const context = React.useContext(AppTourContext);
  if (!context) {
    throw new Error('useAppTour must be used within AppTourProvider');
  }
  return context;
}
