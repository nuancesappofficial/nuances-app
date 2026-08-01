import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_GHOST_PREVIEW_TYPE_INTERVAL_MS,
  DEMO_GHOST_SCROLL_DURATION_MS,
  DEMO_GHOST_TEXT_UPDATE_INTERVAL_MS,
  durationAtDemoGhostSpeed,
} from './ghostAnimationTiming.ts';

test('demo ghost animation runs at 0.75x of the already slowed speed', () => {
  assert.equal(durationAtDemoGhostSpeed(300), 533);
  assert.equal(DEMO_GHOST_TEXT_UPDATE_INTERVAL_MS, 50);
  assert.equal(DEMO_GHOST_PREVIEW_TYPE_INTERVAL_MS, 96);
  assert.equal(DEMO_GHOST_SCROLL_DURATION_MS, 462);
});
