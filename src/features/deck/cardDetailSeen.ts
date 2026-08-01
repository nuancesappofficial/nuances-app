import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';

const CARD_DETAIL_SEEN_KEY_PREFIX = 'deck_card_detail_seen_v1';
const QUIZ_REVIEWED_KEY_PREFIX = 'deck_quiz_reviewed_v1';
export const QUIZ_REVIEWED_CARD_EVENT = 'deck_quiz_reviewed_card';
const quizReviewedMutationQueues = new Map<string, Promise<void>>();

function buildStorageKey(userId: string | null): string {
  return `${CARD_DETAIL_SEEN_KEY_PREFIX}:${userId ?? 'guest'}`;
}

export async function loadSeenCardIds(): Promise<Set<string>> {
  try {
    const userId = await getCurrentSessionUserId();
    const raw = await AsyncStorage.getItem(buildStorageKey(userId));
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(
      parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    );
  } catch (error) {
    console.error('[CardDetailSeen] Failed to load seen cards:', error);
    return new Set<string>();
  }
}

export async function markCardAsSeen(cardId: string): Promise<void> {
  const trimmedId = cardId.trim();
  if (!trimmedId) return;

  try {
    const userId = await getCurrentSessionUserId();
    const storageKey = buildStorageKey(userId);
    const existing = await loadSeenCardIds();
    if (existing.has(trimmedId)) return;
    existing.add(trimmedId);
    await AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(existing)));
  } catch (error) {
    console.error('[CardDetailSeen] Failed to mark card as seen:', error);
  }
}

function buildQuizStorageKey(userId: string | null): string {
  return `${QUIZ_REVIEWED_KEY_PREFIX}:${userId ?? 'guest'}`;
}

async function loadQuizReviewedCardIdsForStorageKey(storageKey: string): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return new Set<string>();
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return new Set<string>();
  return new Set(
    parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  );
}

export async function loadQuizReviewedCardIds(): Promise<Set<string>> {
  try {
    const userId = await getCurrentSessionUserId();
    const storageKey = buildQuizStorageKey(userId);
    await quizReviewedMutationQueues.get(storageKey)?.catch(() => undefined);
    return await loadQuizReviewedCardIdsForStorageKey(storageKey);
  } catch (error) {
    console.error('[CardDetailSeen] Failed to load quiz-reviewed cards:', error);
    return new Set<string>();
  }
}

export async function markCardAsQuizReviewed(cardId: string): Promise<void> {
  const trimmedId = cardId.trim();
  if (!trimmedId) return;

  try {
    const userId = await getCurrentSessionUserId();
    const storageKey = buildQuizStorageKey(userId);
    const previousMutation = quizReviewedMutationQueues.get(storageKey) ?? Promise.resolve();
    const nextMutation = previousMutation
      .catch(() => undefined)
      .then(async () => {
        const existing = await loadQuizReviewedCardIdsForStorageKey(storageKey);
        if (!existing.has(trimmedId)) {
          existing.add(trimmedId);
          await AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(existing)));
        }
        DeviceEventEmitter.emit(QUIZ_REVIEWED_CARD_EVENT, trimmedId);
      });

    quizReviewedMutationQueues.set(storageKey, nextMutation);
    try {
      await nextMutation;
    } finally {
      if (quizReviewedMutationQueues.get(storageKey) === nextMutation) {
        quizReviewedMutationQueues.delete(storageKey);
      }
    }
  } catch (error) {
    console.error('[CardDetailSeen] Failed to mark card as quiz-reviewed:', error);
  }
}
