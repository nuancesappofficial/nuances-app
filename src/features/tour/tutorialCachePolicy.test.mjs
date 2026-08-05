import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampTutorialCacheDragX,
  shouldBlockTutorialCacheDeletion,
} from './tutorialCachePolicy.ts';

test('a locked tutorial card only moves slightly left before rebounding', () => {
  assert.equal(clampTutorialCacheDragX(-300, true), -36);
  assert.equal(clampTutorialCacheDragX(180, true), 180);
  assert.equal(clampTutorialCacheDragX(-300, false), -300);
});

test('the tutorial demo card cannot be deleted by swiping left', () => {
  assert.equal(
    shouldBlockTutorialCacheDeletion({
      tourStep: 'STEP_5_PROCESS_CACHE_CARD',
      isDefaultExperienceCard: true,
      direction: 'left',
    }),
    true,
  );
});

test('no cache card can be deleted while the tutorial is on the cache processing step', () => {
  assert.equal(
    shouldBlockTutorialCacheDeletion({
      tourStep: 'STEP_5_PROCESS_CACHE_CARD',
      isDefaultExperienceCard: false,
      direction: 'left',
    }),
    true,
  );
});

test('cache deletion stays locked while the tutorial transitions into the cache step', () => {
  assert.equal(
    shouldBlockTutorialCacheDeletion({
      isTutorialActive: true,
      tourStep: 'STEP_5_PROCESS_CACHE_CARD',
      isDefaultExperienceCard: true,
      direction: 'left',
    }),
    true,
  );
});

test('cache deletion stays locked even when the tutorial temporarily has an IDLE presentation step', () => {
  assert.equal(
    shouldBlockTutorialCacheDeletion({
      isTutorialActive: true,
      tourStep: 'IDLE',
      isDefaultExperienceCard: true,
      direction: 'left',
    }),
    true,
  );
});

test('the tutorial demo card can still be swiped right to create a card', () => {
  assert.equal(
    shouldBlockTutorialCacheDeletion({
      tourStep: 'STEP_5_PROCESS_CACHE_CARD',
      isDefaultExperienceCard: true,
      direction: 'right',
    }),
    false,
  );
});

test('normal cache cards retain the delete gesture', () => {
  assert.equal(
    shouldBlockTutorialCacheDeletion({
      tourStep: 'IDLE',
      isDefaultExperienceCard: false,
      direction: 'left',
    }),
    false,
  );
});
