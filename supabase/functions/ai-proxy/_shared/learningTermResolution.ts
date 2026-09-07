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

export function isPhrasePartOfSpeech(partOfSpeech: string | undefined | null): boolean {
  if (!partOfSpeech) return false;
  const normalized = normalizedTerm(partOfSpeech);
  return /(?:phrase|idiom|expression|phrasal|片語|短語|成語|慣用)/i.test(normalized);
}

const COMMON_VERB_PARTICLES = new Set([
  'up', 'down', 'out', 'in', 'off', 'on', 'away', 'back', 'over', 'around',
  'round', 'through', 'by', 'about', 'along', 'apart', 'together', 'with',
  'for', 'at', 'into', 'to', 'from', 'across', 'after', 'against', 'ahead',
  'aside', 'behind',
]);

export function extractPhraseFromContext(params: {
  originalSentence: string;
  targetWord: string;
  lemma?: string;
  candidates?: Array<string | undefined | null>;
}): string {
  const targetTokens = normalizedWords(params.targetWord);
  const lemmaTokens = params.lemma ? normalizedWords(params.lemma) : [];
  if (!targetTokens.length) return '';
  const target = targetTokens.join(' ');
  const lemma = lemmaTokens.join(' ') || target;
  const sentenceWords = normalizedWords(params.originalSentence);
  const sentenceText = ` ${sentenceWords.join(' ')} `;

  // 1. Check provided candidates (e.g. proposedCanonical, detectedPhrase, visibleWord)
  if (params.candidates) {
    for (const rawCandidate of params.candidates) {
      if (!rawCandidate) continue;
      const candidateTokens = normalizedWords(rawCandidate);
      if (candidateTokens.length >= 2 && candidateTokens.length <= 8) {
        const candidate = candidateTokens.join(' ');
        const matchesTargetOrLemma =
          candidate.includes(target) || (lemma && candidate.includes(lemma));
        if (matchesTargetOrLemma) {
          // Candidate appears verbatim in sentence
          if (sentenceText.includes(` ${candidate} `)) {
            return candidate;
          }
          // Candidate particles match sentence even if headword is inflected (e.g. candidate "square up" vs sentence "squared up")
          const nonHeadTokens = candidateTokens.slice(1);
          for (let i = 0; i < sentenceWords.length; i++) {
            const word = sentenceWords[i];
            if (word === targetTokens[0] || (lemmaTokens.length && word === lemmaTokens[0])) {
              let allParticlesMatch = true;
              for (let p = 0; p < nonHeadTokens.length; p++) {
                if (sentenceWords[i + 1 + p] !== nonHeadTokens[p]) {
                  allParticlesMatch = false;
                  break;
                }
              }
              if (allParticlesMatch) {
                return candidate;
              }
            }
          }
        }
      }
    }
  }

  // 2. Scan sentence for phrasal verb pattern around targetWord, returning dictionary base form
  for (let i = 0; i < sentenceWords.length; i++) {
    let matchesTarget = true;
    for (let t = 0; t < targetTokens.length; t++) {
      if (sentenceWords[i + t] !== targetTokens[t]) {
        matchesTarget = false;
        break;
      }
    }
    if (matchesTarget) {
      const afterIndex = i + targetTokens.length;
      if (afterIndex < sentenceWords.length && COMMON_VERB_PARTICLES.has(sentenceWords[afterIndex])) {
        const base = lemma || target;
        return `${base} ${sentenceWords[afterIndex]}`;
      }
    }
  }

  return '';
}

export interface ContextualLearningTermParams {
  originalTarget: string;
  lemma: string;
  partOfSpeech: string;
  originalSentence: string;
  candidates?: Array<string | undefined | null>;
  lemmaMeaningPreserved?: boolean;
  phraseConfirmed?: boolean;
}

export interface ContextualLearningTermResult {
  learningTerm: string;
  kind: LearningTermResolutionKind;
  confirmedPhrase: boolean;
}

export function resolveContextualLearningTerm(
  params: ContextualLearningTermParams
): ContextualLearningTermResult {
  const isPhrase = isPhrasePartOfSpeech(params.partOfSpeech);
  if (isPhrase) {
    const extracted = extractPhraseFromContext({
      originalSentence: params.originalSentence,
      targetWord: params.originalTarget,
      lemma: params.lemma,
      candidates: params.candidates,
    });
    if (extracted) {
      return {
        learningTerm: extracted,
        kind: 'phrase',
        confirmedPhrase: true,
      };
    }
  }

  const canonical =
    params.candidates?.find((candidate): candidate is string => Boolean(candidate)) ?? '';
  const standardDecision = chooseLearningTerm({
    originalTarget: params.originalTarget,
    lemma: params.lemma,
    lemmaMeaningPreserved: params.lemmaMeaningPreserved ?? true,
    canonicalPhrase: canonical,
    phraseConfirmed: params.phraseConfirmed ?? false,
  });

  return {
    learningTerm: standardDecision.learningTerm,
    kind: standardDecision.kind,
    confirmedPhrase: standardDecision.kind === 'phrase',
  };
}

// Backward-compatible alias
export const resolveLearningTermWithRouteA = resolveContextualLearningTerm;


