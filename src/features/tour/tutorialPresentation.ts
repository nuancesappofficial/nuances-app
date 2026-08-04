const TUTORIAL_ARROW_SCALE = 2;

export function getTutorialArrowRenderSize(size: number): number {
  return size * TUTORIAL_ARROW_SCALE;
}

export function getGreetingVideoPlayback(visible: boolean) {
  return {
    loop: true,
    muted: true,
    shouldPlay: visible,
  };
}

export function getGreetingVideoHeight(windowHeight: number): number {
  return Math.min(350, Math.max(240, Math.round(windowHeight * 0.4)));
}

export function getGreetingVideoWidth(videoHeight: number): number {
  return Math.round(videoHeight * 0.48);
}

export function getGreetingVideoContentFit(): 'contain' {
  return 'contain';
}
