const TUTORIAL_LEFT_DRAG_LIMIT = -36;

export function clampTutorialCacheDragX(
  translationX: number,
  deletionLocked: boolean
): number {
  'worklet';
  if (!deletionLocked || translationX >= 0) return translationX;
  return Math.max(translationX, TUTORIAL_LEFT_DRAG_LIMIT);
}

export function shouldBlockTutorialCacheDeletion(params: {
  isTutorialActive?: boolean;
  tourStep?: string;
  isDefaultExperienceCard: boolean;
  direction: 'left' | 'right';
}): boolean {
  if (params.direction !== 'left') {
    return false;
  }
  if (params.isDefaultExperienceCard === true) {
    return true;
  }
  return (
    params.isTutorialActive === true ||
    Boolean(params.tourStep?.startsWith('STEP_'))
  );
}

export function shouldBlockTutorialAlbumDeletion(isTutorialActive?: boolean): boolean {
  return isTutorialActive === true;
}
