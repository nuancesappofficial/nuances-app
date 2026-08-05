import assert from 'node:assert/strict';
import test from 'node:test';

import { canAttemptPronunciationAssessment } from './pronunciationAccess.ts';

test('freemium learners can reach the server-managed shared pronunciation quota', () => {
  assert.equal(canAttemptPronunciationAssessment('free'), true);
});

test('trial and premium learners can reach pronunciation assessment', () => {
  assert.equal(canAttemptPronunciationAssessment('trial'), true);
  assert.equal(canAttemptPronunciationAssessment('premium'), true);
});
