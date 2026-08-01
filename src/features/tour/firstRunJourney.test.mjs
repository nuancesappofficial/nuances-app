import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceFirstRunJourney,
  createFirstRunJourney,
  getFirstRunTutorialStartTab,
  shouldOpenReviewCompletionPaywall,
  shouldOpenStarterPaywall,
} from './firstRunJourney.ts';

test('a new user completes onboarding, then video tour, then tutorial', () => {
  let journey = createFirstRunJourney();

  assert.equal(journey.stage, 'onboarding');

  journey = advanceFirstRunJourney(journey, 'onboarding-completed');
  assert.equal(journey.stage, 'video-tour');

  journey = advanceFirstRunJourney(journey, 'video-tour-completed');
  assert.equal(journey.stage, 'tutorial');
  assert.equal(getFirstRunTutorialStartTab(journey), 'cache');

  journey = advanceFirstRunJourney(journey, 'tutorial-completed');
  assert.equal(journey.stage, 'app');
});

test('the tutorial never opens a membership paywall for card generation', () => {
  assert.equal(
    shouldOpenStarterPaywall({
      isTutorial: true,
      tourStep: 'IDLE',
    }),
    false,
  );
});

test('normal card generation opens the paywall when the backend limit is reached', () => {
  assert.equal(
    shouldOpenStarterPaywall({
      isTutorial: false,
      tourStep: 'IDLE',
    }),
    true,
  );
});

test('finishing the tutorial quiz never opens a paywall', () => {
  assert.equal(
    shouldOpenReviewCompletionPaywall({
      isTutorial: true,
      isScreenshotDemo: false,
    }),
    false,
  );
});
