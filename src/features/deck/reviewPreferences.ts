import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';

export type AlbumReviewPreferences = {
  questionCount: number;
  pinnedCardIds: string[];
  skippedPronunciationCardIds: string[];
  todayNewWordsOnly?: boolean;
  selectedQuestionTypes: ReviewQuestionType[];
  selectedSourceAlbumIds: string[];
};

export type ReviewQuestionType =
  | 'fill_blank'
  | 'spelling'
  | 'translation_to_word'
  | 'word_to_translation'
  | 'sentence_to_translation'
  | 'part_of_speech'
  | 'pronunciation';

export const REVIEW_QUESTION_TYPE_OPTIONS: Array<{
  key: ReviewQuestionType;
  label: string;
  shortLabel: string;
}> = [
  { key: 'fill_blank', label: 'Cloze: choose the missing word', shortLabel: '克漏字' },
  { key: 'spelling', label: 'Spelling: type the missing word', shortLabel: '拼字' },
  { key: 'word_to_translation', label: 'Translation: choose the correct meaning', shortLabel: '翻譯' },
  { key: 'part_of_speech', label: 'Part of speech: choose the grammar type', shortLabel: '詞性判斷' },
  { key: 'pronunciation', label: 'Pronunciation: say the word with 60%+ accuracy', shortLabel: '發音挑戰' },
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
  const skippedPronunciationCardIds = Array.isArray(raw?.skippedPronunciationCardIds)
    ? raw!.skippedPronunciationCardIds.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      )
    : [];
  const selectedQuestionTypes = Array.isArray(raw?.selectedQuestionTypes)
    ? raw!.selectedQuestionTypes
        .map((value): ReviewQuestionType =>
          value === 'translation_to_word' || value === 'sentence_to_translation'
            ? 'word_to_translation'
            : value
        )
        .filter(
          (value): value is ReviewQuestionType =>
            typeof value === 'string' &&
            DEFAULT_REVIEW_QUESTION_TYPES.includes(value as ReviewQuestionType)
        )
    : [];
  const selectedSourceAlbumIds = Array.isArray(raw?.selectedSourceAlbumIds)
    ? raw.selectedSourceAlbumIds.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      )
    : [];

  return {
    questionCount,
    pinnedCardIds: Array.from(new Set(pinnedCardIds)),
    skippedPronunciationCardIds: Array.from(new Set(skippedPronunciationCardIds)),
    todayNewWordsOnly: raw?.todayNewWordsOnly !== false,
    selectedQuestionTypes:
      selectedQuestionTypes.length > 0
        ? Array.from(new Set(selectedQuestionTypes))
        : DEFAULT_REVIEW_QUESTION_TYPES,
    selectedSourceAlbumIds:
      selectedSourceAlbumIds.length > 0
        ? Array.from(new Set(selectedSourceAlbumIds))
        : ['all'],
  };
}

async function loadAllPreferences(): Promise<Record<string, AlbumReviewPreferences>> {
  try {
    const userId = await getCurrentSessionUserId();
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
  const userId = await getCurrentSessionUserId();
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
