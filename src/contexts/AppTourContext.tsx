import React from 'react';

export type AppTourStep = 'IDLE' | 'STEP_1_IMPORT' | 'STEP_2_COACH' | 'STEP_3_QUIZ' | 'COMPLETED';

type AppTourContextValue = {
  step: AppTourStep;
  isActive: boolean;
  startTour: () => void;
  nextStep: () => void;
  skipTour: () => void;
  resetTourState: () => void;
};

const AppTourContext = React.createContext<AppTourContextValue | null>(null);

function getNextStep(step: AppTourStep): AppTourStep {
  switch (step) {
    case 'STEP_1_IMPORT':
      return 'STEP_2_COACH';
    case 'STEP_2_COACH':
      return 'STEP_3_QUIZ';
    case 'STEP_3_QUIZ':
      return 'COMPLETED';
    default:
      return step;
  }
}

export function AppTourProvider({ children }: { children: React.ReactNode }) {
  const [step, setStep] = React.useState<AppTourStep>('IDLE');

  const startTour = React.useCallback(() => {
    setStep((current) => (current === 'IDLE' || current === 'COMPLETED' ? 'STEP_1_IMPORT' : current));
  }, []);

  const nextStep = React.useCallback(() => {
    setStep((current) => getNextStep(current));
  }, []);

  const skipTour = React.useCallback(() => {
    setStep('COMPLETED');
  }, []);

  const resetTourState = React.useCallback(() => {
    setStep('IDLE');
  }, []);

  const value = React.useMemo<AppTourContextValue>(
    () => ({
      step,
      isActive: step !== 'IDLE' && step !== 'COMPLETED',
      startTour,
      nextStep,
      skipTour,
      resetTourState,
    }),
    [nextStep, resetTourState, skipTour, startTour, step]
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
