type KeyboardLiftInput = {
  groupBottom: number;
  keyboardTop: number;
  gap?: number;
};

type ReviewKeyboardPlatform = 'ios' | 'android';

type ReviewKeyboardEvents = {
  show: 'keyboardWillShow' | 'keyboardDidShow';
  hide: 'keyboardWillHide' | 'keyboardDidHide';
};

export function calculateKeyboardLift({
  groupBottom,
  keyboardTop,
  gap = 0,
}: KeyboardLiftInput): number {
  const overlap = groupBottom + Math.max(0, gap) - keyboardTop;

  if (!Number.isFinite(overlap)) return 0;
  return Math.max(0, Math.ceil(overlap));
}

export function getReviewKeyboardEvents(
  platform: ReviewKeyboardPlatform
): ReviewKeyboardEvents {
  return platform === 'ios'
    ? { show: 'keyboardWillShow', hide: 'keyboardWillHide' }
    : { show: 'keyboardDidShow', hide: 'keyboardDidHide' };
}
