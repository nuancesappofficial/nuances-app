export type FirstRunMilestone =
  | 'video_tutorial_completed'
  | 'interactive_tutorial_completed';

export function trackFirstRunMilestone(
  milestone: FirstRunMilestone,
  capture: (event: FirstRunMilestone) => void,
  isFirstRun: boolean
): boolean {
  if (!isFirstRun) return false;
  capture(milestone);
  return true;
}
