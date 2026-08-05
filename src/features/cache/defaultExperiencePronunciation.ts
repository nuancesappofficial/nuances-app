export const DEFAULT_EXPERIENCE_CARD_SOURCE = 'Nuances';
export const DEFAULT_EXPERIENCE_CARD_SENTENCE =
  'The smallest nuances can make the biggest differences.';
export const DEFAULT_EXPERIENCE_TARGET_WORD = 'nuances';
export const DEFAULT_EXPERIENCE_PHONETIC_TRANSCRIPTION = '/ˈnuː.ɑːn.sɪz/';

type DefaultExperiencePronunciationCandidate = {
  sourceApp?: string | null;
  targetWord?: string | null;
  originalSentence?: string | null;
  questionId?: string | null;
  sourceCard?: {
    sourceApp?: string | null;
    targetWord?: string | null;
    originalSentence?: string | null;
  } | null;
};

export type PronunciationAudioSource =
  | 'bundled-default-experience'
  | 'standard-natural-tts';

const DEFAULT_EXPERIENCE_QUESTION_PREFIX = 'default-experience-demo:';

function normalize(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function shouldUseDefaultExperiencePronunciation(
  candidate: DefaultExperiencePronunciationCandidate
): boolean {
  const hasDefaultQuestionId = (candidate.questionId || '').startsWith(
    DEFAULT_EXPERIENCE_QUESTION_PREFIX
  );
  const isDefaultCard =
    normalize(candidate.sourceApp) ===
      normalize(DEFAULT_EXPERIENCE_CARD_SOURCE) &&
    normalize(candidate.originalSentence) ===
      normalize(DEFAULT_EXPERIENCE_CARD_SENTENCE);

  return (
    normalize(candidate.targetWord) ===
      normalize(DEFAULT_EXPERIENCE_TARGET_WORD) &&
    (hasDefaultQuestionId || isDefaultCard)
  );
}

export function resolvePronunciationAudioSource(
  candidate: DefaultExperiencePronunciationCandidate
): PronunciationAudioSource {
  const sourceCard = candidate.sourceCard;
  const usesBundledAudio =
    shouldUseDefaultExperiencePronunciation(candidate) ||
    (sourceCard
      ? shouldUseDefaultExperiencePronunciation({
          sourceApp: sourceCard.sourceApp,
          targetWord: sourceCard.targetWord || candidate.targetWord,
          originalSentence: sourceCard.originalSentence,
        })
      : false);

  return usesBundledAudio
    ? 'bundled-default-experience'
    : 'standard-natural-tts';
}
