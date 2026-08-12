type KeyboardLiftInput = {
  inputBottom: number;
  keyboardTop: number;
  gap?: number;
};

export function calculateKeyboardLift({
  inputBottom,
  keyboardTop,
  gap = 0,
}: KeyboardLiftInput): number {
  const overlap = inputBottom + Math.max(0, gap) - keyboardTop;

  if (!Number.isFinite(overlap)) return 0;
  return Math.max(0, Math.ceil(overlap));
}
