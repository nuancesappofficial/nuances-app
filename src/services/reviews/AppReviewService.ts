import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { getCurrentSessionUserId } from '../auth/userIdentity';

const REVIEW_STATE_KEY_PREFIX = 'nuances_app_review_state_v1';
const ELIGIBLE_SESSIONS_BEFORE_REQUEST = 3;
const REVIEW_REQUEST_COOLDOWN_MS = 120 * 24 * 60 * 60 * 1000;

type AppReviewState = {
  eligibleQuizSessions: number;
  lastRequestedAt?: string;
};

let requestInFlight = false;

function storageKey(userId: string): string {
  return `${REVIEW_STATE_KEY_PREFIX}:${userId}`;
}

async function loadState(userId: string): Promise<AppReviewState> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return { eligibleQuizSessions: 0 };
    const parsed = JSON.parse(raw) as Partial<AppReviewState>;
    return {
      eligibleQuizSessions:
        typeof parsed.eligibleQuizSessions === 'number' &&
        Number.isFinite(parsed.eligibleQuizSessions)
          ? Math.max(0, Math.floor(parsed.eligibleQuizSessions))
          : 0,
      lastRequestedAt:
        typeof parsed.lastRequestedAt === 'string'
          ? parsed.lastRequestedAt
          : undefined,
    };
  } catch {
    return { eligibleQuizSessions: 0 };
  }
}

function isCoolingDown(lastRequestedAt?: string): boolean {
  if (!lastRequestedAt) return false;
  const timestamp = new Date(lastRequestedAt).getTime();
  return (
    Number.isFinite(timestamp) &&
    Date.now() - timestamp < REVIEW_REQUEST_COOLDOWN_MS
  );
}

const AppReviewService = {
  async recordCompletedQuiz(answeredQuestionCount: number): Promise<void> {
    if (answeredQuestionCount < 3 || requestInFlight) return;

    const userId = await getCurrentSessionUserId();
    if (!userId) return;

    const state = await loadState(userId);
    const nextState: AppReviewState = {
      ...state,
      eligibleQuizSessions: state.eligibleQuizSessions + 1,
    };
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(nextState));

    if (
      nextState.eligibleQuizSessions < ELIGIBLE_SESSIONS_BEFORE_REQUEST ||
      isCoolingDown(nextState.lastRequestedAt)
    ) {
      return;
    }

    requestInFlight = true;
    try {
      if (!(await StoreReview.isAvailableAsync())) return;
      const requestedState: AppReviewState = {
        ...nextState,
        lastRequestedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(
        storageKey(userId),
        JSON.stringify(requestedState)
      );
      await StoreReview.requestReview();
    } catch (error) {
      console.warn('[AppReview] native review request failed:', error);
    } finally {
      requestInFlight = false;
    }
  },
};

export default AppReviewService;
