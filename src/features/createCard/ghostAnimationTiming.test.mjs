import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_GHOST_PREVIEW_TYPE_INTERVAL_MS,
  DEMO_GHOST_SAVE_ARROW_DELAY_MS,
  DEMO_GHOST_SCROLL_DURATION_MS,
  DEMO_GHOST_TEXT_UPDATE_INTERVAL_MS,
  durationAtDemoGhostSpeed,
  scheduleDemoGhostSaveArrow,
} from './ghostAnimationTiming.ts';

test('demo ghost card keeps its reveal speed while scrolling at half speed', () => {
  assert.equal(durationAtDemoGhostSpeed(300), 533);
  assert.equal(DEMO_GHOST_TEXT_UPDATE_INTERVAL_MS, 50);
  assert.equal(DEMO_GHOST_PREVIEW_TYPE_INTERVAL_MS, 96);
  assert.equal(DEMO_GHOST_SCROLL_DURATION_MS, 924);
});

test('save arrow waits three seconds after the ghost card finishes', () => {
  assert.equal(DEMO_GHOST_SAVE_ARROW_DELAY_MS, 3_000);
});

test('cancelled save arrow timer never shows the arrow after navigation', async () => {
  let didShowArrow = false;
  const cancel = scheduleDemoGhostSaveArrow(() => {
    didShowArrow = true;
  }, 5);

  cancel();
  await new Promise((resolve) => setTimeout(resolve, 15));

  assert.equal(didShowArrow, false);
});
