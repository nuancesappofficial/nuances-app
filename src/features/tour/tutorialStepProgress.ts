import type { AppTourStep } from '../../contexts/AppTourContext';

export const TOTAL_TOUR_STEPS = 7;

export const TOUR_STEP_MAP: Record<string, number> = {
  STEP_5_PROCESS_CACHE_CARD: 1,
  STEP_5_CROP_IMAGE: 2,
  STEP_5_SELECT_TARGET: 3,
  STEP_6_GENERATE_SAMPLE: 4,
  STEP_7_SAVE_SAMPLE: 5,
  STEP_10_QUIZ_SAMPLE: 6,
  STEP_10_QUIZ_FINISH: 7,
};

export function getTourStepProgress(step: AppTourStep | string | undefined): {
  current: number;
  total: number;
} {
  if (!step || step === 'IDLE' || step === 'COMPLETED') {
    return { current: 0, total: TOTAL_TOUR_STEPS };
  }
  const current = TOUR_STEP_MAP[step] ?? 0;
  return { current, total: TOTAL_TOUR_STEPS };
}
