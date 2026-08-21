import assert from 'node:assert/strict';
import test from 'node:test';

import { trackFirstRunMilestone } from './firstRunMilestones.ts';

test('captures a first-run tutorial milestone', () => {
  const events = [];

  assert.equal(
    trackFirstRunMilestone(
      'video_tutorial_completed',
      (event) => events.push(event),
      true
    ),
    true
  );
  assert.equal(
    trackFirstRunMilestone(
      'interactive_tutorial_completed',
      (event) => events.push(event),
      true
    ),
    true
  );
  assert.deepEqual(events, [
    'video_tutorial_completed',
    'interactive_tutorial_completed',
  ]);
});

test('does not capture a replay as a first-run milestone', () => {
  const events = [];

  assert.equal(
    trackFirstRunMilestone(
      'video_tutorial_completed',
      (event) => events.push(event),
      false
    ),
    false
  );
  assert.deepEqual(events, []);
});
