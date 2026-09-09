export type FirstRunStage = 'onboarding' | 'video-tour' | 'tutorial' | 'app';

export type FirstRunJourney = Readonly<{
  stage: FirstRunStage;
}>;

export type FirstRunJourneyEvent =
  | 'onboarding-completed'
  | 'video-tour-completed'
  | 'tutorial-completed';

export function createFirstRunJourney(): FirstRunJourney {
  return { stage: 'onboarding' };
}

export function advanceFirstRunJourney(
  journey: FirstRunJourney,
  event: FirstRunJourneyEvent
): FirstRunJourney {
  if (journey.stage === 'onboarding' && event === 'onboarding-completed') {
    // Video tour is bypassed: skip directly to interactive tutorial.
    // return { stage: 'video-tour' };
    return { stage: 'tutorial' };
  }
  if (journey.stage === 'video-tour' && event === 'video-tour-completed') {
    return { stage: 'tutorial' };
  }
  if (journey.stage === 'tutorial' && event === 'tutorial-completed') {
    return { stage: 'app' };
  }
  return journey;
}

export function getFirstRunTutorialStartTab(
  journey: FirstRunJourney
): 'cache' | null {
  return journey.stage === 'tutorial' ? 'cache' : null;
}

export function shouldOpenStarterPaywall(params: {
  isTutorial: boolean;
  tourStep: string;
}): boolean {
  return !params.isTutorial && params.tourStep !== 'STEP_6_GENERATE_SAMPLE';
}

export function shouldOpenReviewCompletionPaywall(params: {
  isTutorial: boolean;
  isScreenshotDemo: boolean;
}): boolean {
  return params.isScreenshotDemo && !params.isTutorial;
}
