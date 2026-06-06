import React from 'react';
import * as Haptics from 'expo-haptics';
import { supabase } from '@services/supabase/client';

export type AppTourStep =
  | 'IDLE'
  | 'STEP_1_SAMPLE'
  | 'STEP_2_UPLOAD_SAMPLE'
  | 'STEP_3_PASTE_SAMPLE_TEXT'
  | 'STEP_4_ADD_SAMPLE_TEXT'
  | 'STEP_5_PROCESS_CACHE_CARD'
  | 'STEP_5_SELECT_TARGET'
  | 'STEP_6_GENERATE_SAMPLE'
  | 'STEP_7_SAVE_SAMPLE'
  | 'STEP_8_ALBUM_SAMPLE'
  | 'STEP_9_COACH_SAMPLE'
  | 'STEP_10_QUIZ_SAMPLE'
  | 'COMPLETED';

type AppTourContextValue = {
  step: AppTourStep;
  isActive: boolean;
  startTour: () => void;
  goToStep: (step: AppTourStep) => void;
  nextStep: () => void;
  completeTour: () => void;
  skipTour: () => void;
  resetTourState: () => void;
};

const AppTourContext = React.createContext<AppTourContextValue | null>(null);
const TOUR_STEP_GAP_MS = 420;

function getNextStep(step: AppTourStep): AppTourStep {
  switch (step) {
    case 'STEP_1_SAMPLE':
      return 'STEP_8_ALBUM_SAMPLE';
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
      return 'STEP_1_SAMPLE';
    case 'STEP_8_ALBUM_SAMPLE':
      return 'STEP_9_COACH_SAMPLE';
    case 'STEP_9_COACH_SAMPLE':
      return 'STEP_10_QUIZ_SAMPLE';
    case 'STEP_10_QUIZ_SAMPLE':
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
  const pendingStepTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMarkTourSeenRef = React.useRef(false);

  const clearPendingStepTimer = React.useCallback(() => {
    if (pendingStepTimerRef.current) {
      clearTimeout(pendingStepTimerRef.current);
      pendingStepTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => clearPendingStepTimer, [clearPendingStepTimer]);

  const startTour = React.useCallback(() => {
    clearPendingStepTimer();
    setStep((current) => (current === 'IDLE' || current === 'COMPLETED' ? 'STEP_2_UPLOAD_SAMPLE' : current));
  }, [clearPendingStepTimer]);

  const nextStep = React.useCallback(() => {
    triggerTourAdvanceHaptic();
    clearPendingStepTimer();
    setStep((current) => {
      const next = getNextStep(current);
      if (next === current) return current;
      pendingStepTimerRef.current = setTimeout(() => {
        setStep(next);
        pendingStepTimerRef.current = null;
      }, TOUR_STEP_GAP_MS);
      return 'IDLE';
    });
  }, [clearPendingStepTimer]);

  const goToStep = React.useCallback((nextStepValue: AppTourStep) => {
    clearPendingStepTimer();
    setStep(nextStepValue);
  }, [clearPendingStepTimer]);

  const markTourSeen = React.useCallback(async () => {
    if (didMarkTourSeenRef.current) return;
    didMarkTourSeenRef.current = true;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;
      const { error } = await supabase
        .from('profiles')
        .update({ has_seen_tour: true, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
    } catch (error) {
      didMarkTourSeenRef.current = false;
      console.warn('[AppTour] mark tour seen failed:', error);
    }
  }, []);

  const completeTour = React.useCallback(() => {
    triggerTourCompleteHaptic();
    clearPendingStepTimer();
    setStep('COMPLETED');
    void markTourSeen();
  }, [clearPendingStepTimer, markTourSeen]);

  const skipTour = React.useCallback(() => {
    void Haptics.selectionAsync();
    clearPendingStepTimer();
    setStep('COMPLETED');
    void markTourSeen();
  }, [clearPendingStepTimer, markTourSeen]);

  const resetTourState = React.useCallback(() => {
    clearPendingStepTimer();
    setStep('IDLE');
  }, [clearPendingStepTimer]);

  const value = React.useMemo<AppTourContextValue>(
    () => ({
      step,
      isActive: step !== 'IDLE' && step !== 'COMPLETED',
      startTour,
      goToStep,
      nextStep,
      completeTour,
      skipTour,
      resetTourState,
    }),
    [completeTour, goToStep, nextStep, resetTourState, skipTour, startTour, step]
  );

  return <AppTourContext.Provider value={value}>{children}</AppTourContext.Provider>;
}

export function useAppTour() {
  const context = React.useContext(AppTourContext);
  if (!context) {
    throw new Error('useAppTour must be used within AppTourProvider');
  }
  return context;
}
