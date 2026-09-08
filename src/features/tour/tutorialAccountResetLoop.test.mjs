import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_EXPERIENCE_CARD_VERSION,
  LEGACY_UNSCOPED_STORAGE_KEYS,
  buildDefaultExperienceCardStorageKeys,
  resolveAccountDeletionStorageKeys,
  resolveInitialTourStepOnStart,
} from './tutorialFlowPolicy.ts';

test('buildDefaultExperienceCardStorageKeys includes v3 seen key and quiz hint key', () => {
  const userId = 'user-456';
  const keys = buildDefaultExperienceCardStorageKeys(userId);

  assert.equal(
    keys.includes(`nuances:default_experience_card:v3:${userId}`),
    true,
    'Must include active v3 default experience card key'
  );
  assert.equal(
    keys.includes(`nuances:default_experience_quiz_hint:v3:${userId}`),
    true,
    'Must include active v3 quiz hint key'
  );
  assert.equal(
    keys.includes(`nuances:default_experience_card:v1:${userId}`),
    true,
    'Must include legacy v1 key for backward compatibility'
  );
});

test('resolveInitialTourStepOnStart always forces STEP_5_PROCESS_CACHE_CARD on first_run', () => {
  // Even if the user was previously mid-tour (e.g. STEP_8_FLICK_CARD) before account deletion,
  // first_run must strictly restart at STEP_5_PROCESS_CACHE_CARD.
  assert.equal(
    resolveInitialTourStepOnStart('STEP_8_FLICK_CARD', 'first_run'),
    'STEP_5_PROCESS_CACHE_CARD'
  );
  assert.equal(
    resolveInitialTourStepOnStart('COMPLETED', 'first_run'),
    'STEP_5_PROCESS_CACHE_CARD'
  );
  assert.equal(
    resolveInitialTourStepOnStart('IDLE', 'first_run'),
    'STEP_5_PROCESS_CACHE_CARD'
  );
});

test('resolveAccountDeletionStorageKeys removes all keys matching userId regardless of version', () => {
  const userId = 'target-user-123';
  const otherUserId = 'other-user-456';
  const allKeys = [
    'card_detail_sticky_notes_v1',
    'deck_album_preferences_v1',
    `nuances:default_experience_card:v1:${userId}`,
    `nuances:default_experience_card:v2:${userId}`,
    `nuances:default_experience_card:v3:${userId}`,
    `nuances:default_experience_quiz_hint:v3:${userId}`,
    `nuances:tour_seen:${userId}`,
    `deck_review_prefs_v1:${userId}`,
    `nuances:future_unversioned_key:${userId}`,
    // other user's keys
    `nuances:default_experience_card:v3:${otherUserId}`,
    `nuances:tour_seen:${otherUserId}`,
  ];

  const keysToDelete = resolveAccountDeletionStorageKeys(allKeys, userId);

  // Must include unscoped keys
  assert.equal(keysToDelete.includes('card_detail_sticky_notes_v1'), true);
  assert.equal(keysToDelete.includes('deck_album_preferences_v1'), true);

  // Must include all versions of user's keys
  assert.equal(keysToDelete.includes(`nuances:default_experience_card:v1:${userId}`), true);
  assert.equal(keysToDelete.includes(`nuances:default_experience_card:v2:${userId}`), true);
  assert.equal(keysToDelete.includes(`nuances:default_experience_card:v3:${userId}`), true);
  assert.equal(keysToDelete.includes(`nuances:default_experience_quiz_hint:v3:${userId}`), true);
  assert.equal(keysToDelete.includes(`nuances:tour_seen:${userId}`), true);
  assert.equal(keysToDelete.includes(`deck_review_prefs_v1:${userId}`), true);
  assert.equal(keysToDelete.includes(`nuances:future_unversioned_key:${userId}`), true);

  // Must NOT include other user's keys
  assert.equal(keysToDelete.includes(`nuances:default_experience_card:v3:${otherUserId}`), false);
  assert.equal(keysToDelete.includes(`nuances:tour_seen:${otherUserId}`), false);
});

