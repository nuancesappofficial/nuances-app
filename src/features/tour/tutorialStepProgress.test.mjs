import assert from 'node:assert/strict';
import test from 'node:test';
import { getTourStepProgress } from './tutorialStepProgress.ts';

test('maps all 7 tutorial steps correctly to numbers 1 through 7', () => {
  assert.deepEqual(getTourStepProgress('STEP_5_PROCESS_CACHE_CARD'), { current: 1, total: 7 });
  assert.deepEqual(getTourStepProgress('STEP_5_CROP_IMAGE'), { current: 2, total: 7 });
  assert.deepEqual(getTourStepProgress('STEP_5_SELECT_TARGET'), { current: 3, total: 7 });
  assert.deepEqual(getTourStepProgress('STEP_6_GENERATE_SAMPLE'), { current: 4, total: 7 });
  assert.deepEqual(getTourStepProgress('STEP_7_SAVE_SAMPLE'), { current: 5, total: 7 });
  assert.deepEqual(getTourStepProgress('STEP_10_QUIZ_SAMPLE'), { current: 6, total: 7 });
  assert.deepEqual(getTourStepProgress('STEP_10_QUIZ_FINISH'), { current: 7, total: 7 });
});

test('returns current 0 when IDLE or COMPLETED', () => {
  assert.deepEqual(getTourStepProgress('IDLE'), { current: 0, total: 7 });
  assert.deepEqual(getTourStepProgress('COMPLETED'), { current: 0, total: 7 });
});
