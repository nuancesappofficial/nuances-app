// Pure helper functions for tutorial and account deletion flow policy

export const DEFAULT_EXPERIENCE_CARD_VERSION = 'v3';

export const LEGACY_UNSCOPED_STORAGE_KEYS = [
  'card_detail_sticky_notes_v1',
  'deck_album_preferences_v1',
  'local_card_image_map_v1',
  'card_pronunciation_history_v1',
  'user_app_settings_v1',
  'nuances_user_mistake_log_v1',
  'share_extension_ingest_events',
  'nuances_trial_started_at',
  'nuances_trial_ends_at',
] as const;

/**
 * Filter all AsyncStorage keys belonging to this user or unscoped legacy keys.
 * Dynamically matches any key containing userId, ensuring all versions and future keys are purged.
 */
export function resolveAccountDeletionStorageKeys(
  allKeys: readonly string[],
  userId: string,
  unscopedKeys: readonly string[] = LEGACY_UNSCOPED_STORAGE_KEYS
): string[] {
  const normalizedUserId = userId.trim();
  const keysToRemove = new Set<string>();

  for (const key of unscopedKeys) {
    keysToRemove.add(key);
  }

  if (normalizedUserId) {
    for (const key of allKeys) {
      if (key.includes(normalizedUserId)) {
        keysToRemove.add(key);
      }
    }
  }

  return Array.from(keysToRemove);
}

export function buildDefaultExperienceCardStorageKeys(userId: string): string[] {
  return [
    `nuances:default_experience_card:v1:${userId}`,
    `nuances:default_experience_card:v2:${userId}`,
    `nuances:default_experience_card:v3:${userId}`,
    `nuances:default_experience_quiz_hint:v1:${userId}`,
    `nuances:default_experience_quiz_hint:v2:${userId}`,
    `nuances:default_experience_quiz_hint:v3:${userId}`,
  ];
}

/**
 * Ensures startTour on first_run or replay always resets to STEP_5_PROCESS_CACHE_CARD.
 */
export function resolveInitialTourStepOnStart(currentStep: string, source: string): string {
  if (source === 'first_run' || source === 'replay') {
    return 'STEP_5_PROCESS_CACHE_CARD';
  }
  if (currentStep === 'IDLE' || currentStep === 'COMPLETED') {
    return 'STEP_5_PROCESS_CACHE_CARD';
  }
  return currentStep;
}
