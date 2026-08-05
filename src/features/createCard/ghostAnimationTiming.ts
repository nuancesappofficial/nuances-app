// The first tuning pass reduced the original animation to 0.75x. This second
// pass reduces that already-slowed result to 0.75x again.
export const DEMO_GHOST_ANIMATION_SPEED = 0.75 * 0.75;

export function durationAtDemoGhostSpeed(baseDurationMs: number): number {
  return Math.round(baseDurationMs / DEMO_GHOST_ANIMATION_SPEED);
}

export const DEMO_GHOST_TEXT_UPDATE_INTERVAL_MS =
  durationAtDemoGhostSpeed(28);
export const DEMO_GHOST_PREVIEW_TYPE_INTERVAL_MS =
  durationAtDemoGhostSpeed(54);
export const DEMO_GHOST_PREVIEW_TYPE_TAIL_MS =
  durationAtDemoGhostSpeed(120);
export const DEMO_GHOST_SCROLL_DURATION_MS =
  durationAtDemoGhostSpeed(260) * 2;
export const DEMO_GHOST_SAVE_ARROW_DELAY_MS = 3_000;

export function scheduleDemoGhostSaveArrow(
  showArrow: () => void,
  delayMs = DEMO_GHOST_SAVE_ARROW_DELAY_MS
): () => void {
  const timeout = setTimeout(showArrow, delayMs);
  return () => clearTimeout(timeout);
}
