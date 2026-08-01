import { ReduceMotion } from 'react-native-reanimated';

export const TOUR_MOTION = {
  overlayEnterMs: 180,
  overlayExitMs: 160,
  instructionEnterMs: 200,
  instructionExitMs: 120,
  instructionDelayMs: 70,
  targetSpring: {
    damping: 27,
    stiffness: 220,
    mass: 0.86,
    overshootClamping: false,
    reduceMotion: ReduceMotion.System,
  },
  bridgeOpacity: 0.58,
  targetPadding: 7,
  targetRadius: 18,
  targetWaitMs: 900,
} as const;

