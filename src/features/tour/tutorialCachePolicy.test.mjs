import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampTutorialCacheDragX,
  shouldBlockTutorialAlbumDeletion,
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

test('the tutorial demo card cannot be deleted by swiping left even when tutorial is inactive or idle', () => {
  assert.equal(
    shouldBlockTutorialCacheDeletion({
      isTutorialActive: false,
      tourStep: 'IDLE',
      isDefaultExperienceCard: true,
      direction: 'left',
    }),
    true,
  );
  assert.equal(
    shouldBlockTutorialCacheDeletion({
      isDefaultExperienceCard: true,
      direction: 'left',
    }),
    true,
  );
});

test('non-demo cache cards cannot be deleted by swiping left while the tutorial is active', () => {
  assert.equal(
    shouldBlockTutorialCacheDeletion({
      tourStep: 'STEP_5_PROCESS_CACHE_CARD',
      isDefaultExperienceCard: false,
      direction: 'left',
    }),
    true,
  );
  assert.equal(
    shouldBlockTutorialCacheDeletion({
      isTutorialActive: true,
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

test('album deletion is blocked while tutorial is active', () => {
  assert.equal(shouldBlockTutorialAlbumDeletion(true), true);
});

test('album deletion is permitted when tutorial is not active', () => {
  assert.equal(shouldBlockTutorialAlbumDeletion(false), false);
  assert.equal(shouldBlockTutorialAlbumDeletion(undefined), false);
});
