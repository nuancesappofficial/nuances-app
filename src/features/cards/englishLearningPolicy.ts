const NON_ENGLISH_LEARNING_SCRIPT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u;
const LATIN_LETTER_PATTERN = /[A-Za-zÀ-ÖØ-öø-ÿ]/u;

type LearningCardLike = {
  targetWord?: string | null;
  targetPhrase?: string | null;
  definition?: string | null;
};

export function isLikelyEnglishLearningText(value: string | null | undefined): boolean {
  const text = String(value || '').trim();
  if (!text || text === '-') return false;
  if (NON_ENGLISH_LEARNING_SCRIPT_PATTERN.test(text)) return false;
  return LATIN_LETTER_PATTERN.test(text);
}

export function isEnglishLearningCard(card: LearningCardLike): boolean {
  const learningTerm = (card.targetPhrase || card.targetWord || '').trim();
  return isLikelyEnglishLearningText(learningTerm);
}
