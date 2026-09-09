import React from 'react';
import { DeviceEventEmitter, Linking } from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@services/supabase/client';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import { markTourSeenLocally } from '../features/tour/tourSeen';
import {
  clearDefaultExperienceCardSeen,
  completeDefaultExperienceQuizHint,
  ensureDefaultExperienceCard,
  markDefaultExperienceCardHandled,
  removeUnusedDefaultExperienceCard,
} from '../features/cache/defaultExperienceCard';

export const TOUR_COMPLETION_GREETING_EVENT = 'nuances:tour-completion-greeting';

export type AppTourStep =
  | 'IDLE'
  | 'STEP_5_PROCESS_CACHE_CARD'
  | 'STEP_5_CROP_IMAGE'
  | 'STEP_5_SELECT_TARGET'
  | 'STEP_6_GENERATE_SAMPLE'
  | 'STEP_7_SAVE_SAMPLE'
  | 'STEP_8_FLICK_CARD'
  | 'STEP_9_COACH_SAMPLE'
  | 'STEP_10_QUIZ_SAMPLE'
  | 'STEP_10_QUIZ_FINISH'
  | 'STEP_11_CREATE_ALBUM'
  | 'STEP_12_CONFIRM_ALBUM'
  | 'STEP_13_LONG_PRESS_ALBUM'
  | 'STEP_14_ALBUM_SETTINGS_COVER'
  | 'STEP_14_ALBUM_SETTINGS'
  | 'COMPLETED';

export type AppTourLaunchSource = 'first_run' | 'replay';

export type SpotlightRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AppTourContextValue = {
  step: AppTourStep;
  isActive: boolean;
  launchSource: AppTourLaunchSource | null;
  sampleCardId: string | null;
  spotlightRect: SpotlightRect | null;
  setSpotlightRect: (rect: SpotlightRect | null) => void;
  startTour: (source: AppTourLaunchSource) => void;
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
    case 'STEP_5_PROCESS_CACHE_CARD':
      return 'STEP_5_CROP_IMAGE';
    case 'STEP_5_CROP_IMAGE':
      return 'STEP_5_SELECT_TARGET';
    case 'STEP_5_SELECT_TARGET':
      return 'STEP_6_GENERATE_SAMPLE';
    case 'STEP_6_GENERATE_SAMPLE':
      return 'STEP_7_SAVE_SAMPLE';
    case 'STEP_7_SAVE_SAMPLE':
    case 'STEP_8_FLICK_CARD':
    case 'STEP_9_COACH_SAMPLE':
      return 'STEP_10_QUIZ_SAMPLE';
    case 'STEP_10_QUIZ_SAMPLE':
      return 'STEP_10_QUIZ_FINISH';
    case 'STEP_10_QUIZ_FINISH':
      return 'STEP_11_CREATE_ALBUM';
    case 'STEP_11_CREATE_ALBUM':
      return 'STEP_12_CONFIRM_ALBUM';
    case 'STEP_12_CONFIRM_ALBUM':
      return 'STEP_13_LONG_PRESS_ALBUM';
    case 'STEP_13_LONG_PRESS_ALBUM':
      return 'STEP_14_ALBUM_SETTINGS_COVER';
    case 'STEP_14_ALBUM_SETTINGS_COVER':
      return 'STEP_14_ALBUM_SETTINGS';
    case 'STEP_14_ALBUM_SETTINGS':
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
  const [launchSource, setLaunchSource] =
    React.useState<AppTourLaunchSource | null>(null);
  const [sampleCardId, setSampleCardId] = React.useState<string | null>(null);
  const [spotlightRect, setSpotlightRectState] = React.useState<SpotlightRect | null>(null);
  const didMarkTourSeenRef = React.useRef(false);

  const setSpotlightRect = React.useCallback((next: SpotlightRect | null) => {
    setSpotlightRectState((prev) => {
      if (!prev && !next) return prev;
      if (
        prev &&
        next &&
        prev.x === next.x &&
        prev.y === next.y &&
        prev.width === next.width &&
        prev.height === next.height
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const nextStep = React.useCallback(() => {
    setSpotlightRect(null);
    setStep((current) => {
      const next = getNextStep(current);
      if (next === current) return current;
      triggerTourAdvanceHaptic();
      return next;
    });
  }, []);

  const goToStep = React.useCallback((nextStepValue: AppTourStep) => {
    setSpotlightRect(null);
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

  const startTour = React.useCallback(
    (source: AppTourLaunchSource) => {
      didMarkTourSeenRef.current = false;
      setLaunchSource(source);
      setIsRunning(true);
      void markTourSeen();
      setSampleCardId(null);
      setSpotlightRect(null);
      void (async () => {
        try {
          const userId = await getCurrentSessionUserId();
          if (userId) {
            await clearDefaultExperienceCardSeen(userId);
            await ensureDefaultExperienceCard(userId, { force: true });
          }
        } catch (error) {
          console.warn('[AppTour] ensure demo card for startTour failed:', error);
        }
      })();
      setStep((current) =>
        source === 'first_run' ||
        source === 'replay' ||
        current === 'IDLE' ||
        current === 'COMPLETED'
          ? 'STEP_5_PROCESS_CACHE_CARD'
          : current
      );
    },
    [markTourSeen]
  );

  const completeTour = React.useCallback(async () => {
    triggerTourCompleteHaptic();
    setIsRunning(false);
    setSpotlightRect(null);
    setStep('COMPLETED');
    void markTourSeen();
    try {
      const userId = await getCurrentSessionUserId();
      if (userId) {
        await completeDefaultExperienceQuizHint(userId);
        await markDefaultExperienceCardHandled(userId);
        await removeUnusedDefaultExperienceCard(userId);
      }
    } catch (error) {
      console.warn('[AppTour] complete tutorial failed:', error);
    }
    DeviceEventEmitter.emit(TOUR_COMPLETION_GREETING_EVENT);
  }, [markTourSeen]);

  const skipTour = React.useCallback(async () => {
    void Haptics.selectionAsync();
    setIsRunning(false);
    setSpotlightRect(null);
    setStep('COMPLETED');
    void markTourSeen();
    try {
      const userId = await getCurrentSessionUserId();
      if (userId) {
        await completeDefaultExperienceQuizHint(userId);
        await markDefaultExperienceCardHandled(userId);
        await removeUnusedDefaultExperienceCard(userId);
      }
    } catch (error) {
      console.warn('[AppTour] complete tutorial on skip failed:', error);
    }
    DeviceEventEmitter.emit(TOUR_COMPLETION_GREETING_EVENT);
  }, [markTourSeen]);

  React.useEffect(() => {
    if (!__DEV__) return undefined;

    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.includes(DEV_RESET_ONBOARDING_PATH)) {
        didMarkTourSeenRef.current = false;
        setIsRunning(false);
        setSampleCardId(null);
        setSpotlightRect(null);
        setStep('IDLE');
        return;
      }
      if (url.includes(DEV_REPLAY_TOUR_PATH)) {
        didMarkTourSeenRef.current = false;
        setLaunchSource('replay');
        setIsRunning(true);
        setSampleCardId(null);
        setSpotlightRect(null);
        void markTourSeen();
        void (async () => {
          try {
            const userId = await getCurrentSessionUserId();
            if (userId) {
              await clearDefaultExperienceCardSeen(userId);
              await ensureDefaultExperienceCard(userId, { force: true });
            }
          } catch (error) {
            console.warn('[AppTour] ensure demo card for replay failed:', error);
          }
        })();
        setStep('STEP_5_PROCESS_CACHE_CARD');
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
    setSpotlightRect(null);
    setStep('IDLE');
  }, []);

  const value = React.useMemo<AppTourContextValue>(
    () => ({
      step,
      isActive: isRunning,
      launchSource,
      sampleCardId,
      spotlightRect,
      setSpotlightRect,
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
      launchSource,
      goToStep,
      isRunning,
      nextStep,
      resetTourState,
      sampleCardId,
      skipTour,
      spotlightRect,
      startTour,
      step,
    ]
  );

  return (
    <AppTourContext.Provider value={value}>{children}</AppTourContext.Provider>
  );
}

export function useAppTour() {
  const context = React.useContext(AppTourContext);
  if (!context) {
    throw new Error('useAppTour must be used within AppTourProvider');
  }
  return context;
}
