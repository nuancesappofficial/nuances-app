import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentAuthUserId } from '@services/auth/userIdentity';

export type AlbumReviewPreferences = {
  questionCount: number;
  pinnedCardIds: string[];
  todayNewWordsOnly?: boolean;
  selectedQuestionTypes: ReviewQuestionType[];
};

export type ReviewQuestionType =
  | 'fill_blank'
  | 'translation_to_word'
  | 'word_to_translation'
  | 'sentence_to_translation'
  | 'part_of_speech';

export const REVIEW_QUESTION_TYPE_OPTIONS: Array<{
  key: ReviewQuestionType;
  label: string;
  shortLabel: string;
}> = [
  { key: 'fill_blank', label: 'Fill in the blank', shortLabel: 'Blank' },
  { key: 'translation_to_word', label: 'Translation → word', shortLabel: '翻譯→字' },
  { key: 'word_to_translation', label: 'Word → translation', shortLabel: '字→翻譯' },
  { key: 'sentence_to_translation', label: 'Sentence → translation', shortLabel: '句子→翻譯' },
  { key: 'part_of_speech', label: 'Part of speech', shortLabel: '詞性' },
];

export const DEFAULT_REVIEW_QUESTION_TYPES: ReviewQuestionType[] = REVIEW_QUESTION_TYPE_OPTIONS.map(
  (item) => item.key
);

const REVIEW_PREFS_KEY_PREFIX = 'deck_review_prefs_v1';
const DEFAULT_QUESTION_COUNT = 5;

function buildStorageKey(userId: string | null): string {
  return `${REVIEW_PREFS_KEY_PREFIX}:${userId ?? 'guest'}`;
}

function normalizePreferences(raw?: Partial<AlbumReviewPreferences> | null): AlbumReviewPreferences {
  const questionCount = Math.max(1, Math.min(50, Number(raw?.questionCount || DEFAULT_QUESTION_COUNT)));
  const pinnedCardIds = Array.isArray(raw?.pinnedCardIds)
    ? raw!.pinnedCardIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const selectedQuestionTypes = Array.isArray(raw?.selectedQuestionTypes)
    ? raw!.selectedQuestionTypes.filter(
        (value): value is ReviewQuestionType =>
          typeof value === 'string' &&
          DEFAULT_REVIEW_QUESTION_TYPES.includes(value as ReviewQuestionType)
      )
    : [];

  return {
    questionCount,
    pinnedCardIds: Array.from(new Set(pinnedCardIds)),
    todayNewWordsOnly: raw?.todayNewWordsOnly === true,
    selectedQuestionTypes:
      selectedQuestionTypes.length > 0
        ? Array.from(new Set(selectedQuestionTypes))
        : DEFAULT_REVIEW_QUESTION_TYPES,
  };
}

async function loadAllPreferences(): Promise<Record<string, AlbumReviewPreferences>> {
  try {
    const userId = await getCurrentAuthUserId();
    const raw = await AsyncStorage.getItem(buildStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<AlbumReviewPreferences>>;
    return Object.fromEntries(
      Object.entries(parsed || {}).map(([albumId, prefs]) => [albumId, normalizePreferences(prefs)])
    );
  } catch (error) {
    console.error('[ReviewPreferences] Failed to load preferences:', error);
    return {};
  }
}

async function saveAllPreferences(next: Record<string, AlbumReviewPreferences>): Promise<void> {
  const userId = await getCurrentAuthUserId();
  await AsyncStorage.setItem(buildStorageKey(userId), JSON.stringify(next));
}

export async function loadAlbumReviewPreferences(albumId: string): Promise<AlbumReviewPreferences> {
  const all = await loadAllPreferences();
  return all[albumId] ?? normalizePreferences();
}

export async function saveAlbumReviewPreferences(
  albumId: string,
  next: Partial<AlbumReviewPreferences>
): Promise<AlbumReviewPreferences> {
  const all = await loadAllPreferences();
  const merged = normalizePreferences({
    ...(all[albumId] ?? normalizePreferences()),
    ...next,
  });
  all[albumId] = merged;
  await saveAllPreferences(all);
  return merged;
}

export const DEFAULT_ALBUM_REVIEW_PREFERENCES = normalizePreferences();
