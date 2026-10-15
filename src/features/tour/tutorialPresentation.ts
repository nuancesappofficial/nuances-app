const TUTORIAL_ARROW_SCALE = 2;

export function getTutorialArrowRenderSize(size: number): number {
  return size * TUTORIAL_ARROW_SCALE;
}

export function getGreetingVideoPlayback(
  visible: boolean,
  _platform: string = 'ios'
) {
  return {
    loop: true,
    muted: true,
    shouldPlay: visible,
  };
}

export function getGreetingVideoHeight(windowHeight: number): number {
  return Math.min(480, Math.max(260, Math.round(windowHeight * 0.52)));
}

export function getGreetingVideoWidth(
  videoHeight: number,
  platform: string = 'ios'
): number {
  if (platform === 'android') {
    return Math.round(videoHeight * (9 / 16));
  }
  return Math.round(videoHeight * 0.48);
}

export function shouldShowGreetingPhoneSpeaker(
  platform: string = 'ios'
): boolean {
  return platform !== 'android';
}

export function getGreetingVideoContentFit(): 'contain' {
  return 'contain';
}

/**
 * Which tour slides must stay mounted. The active slide, any slide currently
 * transitioning away, and the next slide (so its video player initialises and
 * buffers early, hiding the switch lag behind the transition).
 */
export function getVisibleTourSlides(
  totalSteps: number,
  index: number,
  transitioningFromIndex: number | null
): number[] {
  const slides = new Set<number>();
  slides.add(index);
  if (transitioningFromIndex !== null) slides.add(transitioningFromIndex);
  if (index + 1 < totalSteps) slides.add(index + 1);
  return [...slides].sort((a, b) => a - b);
}
