import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldShowQuickQuizTutorialArrow,
  shouldPurgeStaleDefaultExperienceQuizHint,
} from './tutorialFlowPolicy.ts';

test('quick quiz tutorial arrow shows when interactive tutorial is actively waiting on STEP_10_QUIZ_SAMPLE', () => {
  const result = shouldShowQuickQuizTutorialArrow({
    tourStep: 'STEP_10_QUIZ_SAMPLE',
    isTourActive: true,
    showDefaultExperienceQuizHint: true,
  });
  assert.equal(result, true);
});

test('quick quiz tutorial arrow NEVER shows when tutorial is inactive, even if a stale hint exists in storage', () => {
  // Symptom described by user: User leaves app during tutorial, reloads with expo run:ios,
  // or updates app: tour is inactive (IDLE, isActive=false), but stale hint in storage turns on arrow.
  const result = shouldShowQuickQuizTutorialArrow({
    tourStep: 'IDLE',
    isTourActive: false,
    showDefaultExperienceQuizHint: true,
  });
  assert.equal(result, false);
});

test('quick quiz tutorial arrow does not show for other tutorial steps', () => {
  const result = shouldShowQuickQuizTutorialArrow({
    tourStep: 'STEP_5_PROCESS_CACHE_CARD',
    isTourActive: true,
    showDefaultExperienceQuizHint: false,
  });
  assert.equal(result, false);
});

test('shouldPurgeStaleDefaultExperienceQuizHint purges when tour is not active', () => {
  // When app boots/reloads and user returns to deck with tour inactive and launchSource null
  const result = shouldPurgeStaleDefaultExperienceQuizHint({
    tourStep: 'IDLE',
    isTourActive: false,
    launchSource: null,
  });
  assert.equal(result, true);
});

test('shouldPurgeStaleDefaultExperienceQuizHint purges when tour step is not STEP_10_QUIZ_SAMPLE', () => {
  const result = shouldPurgeStaleDefaultExperienceQuizHint({
    tourStep: 'STEP_5_PROCESS_CACHE_CARD',
    isTourActive: true,
    launchSource: 'first_run',
  });
  assert.equal(result, true);
});

test('shouldPurgeStaleDefaultExperienceQuizHint retains hint only when actively on STEP_10_QUIZ_SAMPLE', () => {
  const result = shouldPurgeStaleDefaultExperienceQuizHint({
    tourStep: 'STEP_10_QUIZ_SAMPLE',
    isTourActive: true,
    launchSource: 'first_run',
  });
  assert.equal(result, false);
});
