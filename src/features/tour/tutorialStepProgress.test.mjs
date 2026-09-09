import assert from 'node:assert/strict';
import test from 'node:test';
import { getTourStepProgress } from './tutorialStepProgress.ts';

test('maps all 12 tutorial steps correctly to numbers 1 through 12', () => {
  assert.deepEqual(getTourStepProgress('STEP_5_PROCESS_CACHE_CARD'), { current: 1, total: 12 });
  assert.deepEqual(getTourStepProgress('STEP_5_CROP_IMAGE'), { current: 2, total: 12 });
  assert.deepEqual(getTourStepProgress('STEP_5_SELECT_TARGET'), { current: 3, total: 12 });
  assert.deepEqual(getTourStepProgress('STEP_6_GENERATE_SAMPLE'), { current: 4, total: 12 });
  assert.deepEqual(getTourStepProgress('STEP_7_SAVE_SAMPLE'), { current: 5, total: 12 });
  assert.deepEqual(getTourStepProgress('STEP_10_QUIZ_SAMPLE'), { current: 6, total: 12 });
  assert.deepEqual(getTourStepProgress('STEP_10_QUIZ_FINISH'), { current: 7, total: 12 });
  assert.deepEqual(getTourStepProgress('STEP_11_CREATE_ALBUM'), { current: 8, total: 12 });
  assert.deepEqual(getTourStepProgress('STEP_12_CONFIRM_ALBUM'), { current: 9, total: 12 });
  assert.deepEqual(getTourStepProgress('STEP_13_LONG_PRESS_ALBUM'), { current: 10, total: 12 });
  assert.deepEqual(getTourStepProgress('STEP_14_ALBUM_SETTINGS_COVER'), { current: 11, total: 12 });
  assert.deepEqual(getTourStepProgress('STEP_14_ALBUM_SETTINGS'), { current: 12, total: 12 });
});

test('returns current 0 when IDLE or COMPLETED', () => {
  assert.deepEqual(getTourStepProgress('IDLE'), { current: 0, total: 12 });
  assert.deepEqual(getTourStepProgress('COMPLETED'), { current: 0, total: 12 });
});
