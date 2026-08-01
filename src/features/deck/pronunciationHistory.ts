import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CloudPhonemeFeedback } from '@services/pronunciation/cloudCoach';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';

export type StoredPronunciationResult = {
  score: number | null;
  feedbackLines: string[];
  phonemeFeedback: CloudPhonemeFeedback[];
  showFeedback: boolean;
  updatedAt: string;
};

const PRONUNCIATION_HISTORY_KEY = 'card_pronunciation_history_v1';

async function getPronunciationHistoryKey(): Promise<string> {
  const userId = await getCurrentSessionUserId();
  return `${PRONUNCIATION_HISTORY_KEY}:${userId ?? 'guest'}`;
}

function sanitizeResult(input: unknown): StoredPronunciationResult | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Partial<StoredPronunciationResult>;
  const score = typeof raw.score === 'number' && Number.isFinite(raw.score) ? raw.score : null;
  const feedbackLines = Array.isArray(raw.feedbackLines)
    ? raw.feedbackLines.filter((item): item is string => typeof item === 'string')
    : [];
  const phonemeFeedback = Array.isArray(raw.phonemeFeedback)
    ? raw.phonemeFeedback.filter((item): item is CloudPhonemeFeedback => {
        return Boolean(item && typeof item === 'object' && typeof item.phoneme === 'string');
      })
    : [];
  return {
    score,
    feedbackLines,
    phonemeFeedback,
    showFeedback: Boolean(raw.showFeedback ?? (score !== null || phonemeFeedback.length > 0)),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

export async function loadPronunciationHistory(): Promise<Record<string, StoredPronunciationResult>> {
  try {
    const raw = await AsyncStorage.getItem(await getPronunciationHistoryKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed).flatMap(([cardId, value]) => {
      const result = sanitizeResult(value);
      return result ? ([[cardId, result]] as const) : [];
    });
    return Object.fromEntries(entries);
  } catch (error) {
    console.warn('[PronunciationHistory] load failed:', error);
    return {};
  }
}

export async function upsertPronunciationResult(
  cardId: string,
  result: Omit<StoredPronunciationResult, 'updatedAt'>
): Promise<Record<string, StoredPronunciationResult>> {
  const current = await loadPronunciationHistory();
  const next = {
    ...current,
    [cardId]: {
      ...result,
      updatedAt: new Date().toISOString(),
    },
  };
  await AsyncStorage.setItem(await getPronunciationHistoryKey(), JSON.stringify(next));
  return next;
}
