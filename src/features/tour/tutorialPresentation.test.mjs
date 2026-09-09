import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getGreetingVideoContentFit,
  getGreetingVideoHeight,
  getGreetingVideoWidth,
  getGreetingVideoPlayback,
  getTutorialArrowRenderSize,
  getVisibleTourSlides,
} from './tutorialPresentation.ts';

test('tutorial arrows render twice as large and twice as thick', () => {
  assert.equal(getTutorialArrowRenderSize(32), 64);
  assert.equal(getTutorialArrowRenderSize(27), 54);
});

test('the Greeting preserves the complete phone outline', () => {
  assert.equal(getGreetingVideoContentFit(), 'contain');
});

test('the Greeting gives the raw video a larger responsive frame', () => {
  assert.equal(getGreetingVideoHeight(950), 480);
  assert.equal(getGreetingVideoHeight(874), 454);
  assert.equal(getGreetingVideoHeight(667), 347);
  assert.equal(getGreetingVideoHeight(450), 260);
  assert.equal(getGreetingVideoWidth(480), 230);
  assert.equal(getGreetingVideoWidth(347), 167);
});

test('the Greeting loops the Share Sheet demonstration only while visible', () => {
  assert.deepEqual(getGreetingVideoPlayback(true), {
    loop: true,
    muted: true,
    shouldPlay: true,
  });
  assert.deepEqual(getGreetingVideoPlayback(false), {
    loop: true,
    muted: true,
    shouldPlay: false,
  });
});

test('the tour preloads the next slide so its video is ready before the switch', () => {
  assert.deepEqual(getVisibleTourSlides(5, 0, null), [0, 1]);
  assert.deepEqual(getVisibleTourSlides(5, 2, null), [2, 3]);
});

test('the tour does not preload past the last slide', () => {
  assert.deepEqual(getVisibleTourSlides(5, 4, null), [4]);
});

test('the tour keeps the transitioning slide mounted while preloading the next', () => {
  assert.deepEqual(getVisibleTourSlides(5, 1, 0), [0, 1, 2]);
});
