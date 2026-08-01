export type LearningTermResolutionKind = 'unchanged' | 'lemma' | 'phrase';

function normalizedWords(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}'-]+/gu) || [];
}

function normalizedTerm(value: string): string {
  return normalizedWords(value).join(' ');
}

export function chooseLearningTerm(params: {
  originalTarget: string;
  lemma: string;
  lemmaMeaningPreserved: boolean;
  canonicalPhrase: string;
  phraseConfirmed: boolean;
}): {
  learningTerm: string;
  kind: LearningTermResolutionKind;
} {
  const originalTarget = normalizedTerm(params.originalTarget);
  const lemmaWords = normalizedWords(params.lemma);
  const lemma = lemmaWords.length === 1 ? lemmaWords[0] : '';
  const canonicalPhrase = normalizedTerm(params.canonicalPhrase);
  const phraseWords = normalizedWords(canonicalPhrase);

  if (params.lemmaMeaningPreserved && lemma) {
    return {
      learningTerm: lemma,
      kind: lemma === originalTarget ? 'unchanged' : 'lemma',
    };
  }

  if (
    !params.lemmaMeaningPreserved &&
    params.phraseConfirmed &&
    phraseWords.length >= 2
  ) {
    return {
      learningTerm: canonicalPhrase,
      kind: 'phrase',
    };
  }

  const fallback = lemma || originalTarget;
  return {
    learningTerm: fallback,
    kind: fallback === originalTarget ? 'unchanged' : 'lemma',
  };
}
