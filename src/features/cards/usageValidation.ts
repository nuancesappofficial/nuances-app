const PLACEHOLDER_TOKENS = new Set([
  'one',
  "one's",
  'oneself',
  'somebody',
  "somebody's",
  'someone',
  "someone's",
  'something',
  "something's",
]);

const IRREGULAR_FORMS: Record<string, string[]> = {
  be: ['am', 'are', 'been', 'is', 'was', 'were'],
  bring: ['brought'],
  buy: ['bought'],
  come: ['came'],
  do: ['did', 'done'],
  drink: ['drank', 'drunk'],
  eat: ['ate', 'eaten'],
  feel: ['felt'],
  find: ['found'],
  get: ['got', 'gotten'],
  give: ['gave', 'given'],
  go: ['gone', 'went'],
  have: ['had'],
  hear: ['heard'],
  hold: ['held'],
  keep: ['kept'],
  know: ['knew', 'known'],
  lay: ['laid'],
  lead: ['led'],
  leave: ['left'],
  lose: ['lost'],
  make: ['made'],
  mean: ['meant'],
  meet: ['met'],
  pay: ['paid'],
  put: ['put'],
  read: ['read'],
  rise: ['rose', 'risen'],
  run: ['ran'],
  say: ['said'],
  see: ['saw', 'seen'],
  set: ['set'],
  sit: ['sat'],
  sell: ['sold'],
  send: ['sent'],
  stand: ['stood'],
  stick: ['stuck'],
  strike: ['struck'],
  speak: ['spoke', 'spoken'],
  take: ['taken', 'took'],
  teach: ['taught'],
  tell: ['told'],
  think: ['thought'],
  understand: ['understood'],
  win: ['won'],
  write: ['written', 'wrote'],
};

function normalizeLexicalSequence(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}'-]+/gu)
    ?.join(' ')
    .trim() || '';
}

function tokenMatchesAnchor(token: string, anchor: string): boolean {
  if (token === anchor) return true;
  if (IRREGULAR_FORMS[anchor]?.includes(token)) return true;
  if (!/[a-z]/i.test(anchor)) return token.includes(anchor);

  const forms = new Set([
    `${anchor}s`,
    `${anchor}es`,
    `${anchor}ed`,
    `${anchor}ing`,
  ]);
  if (anchor.endsWith('e')) {
    forms.add(`${anchor}d`);
    forms.add(`${anchor.slice(0, -1)}ing`);
  }
  if (anchor.endsWith('ie')) {
    forms.add(`${anchor.slice(0, -2)}ying`);
  }
  if (anchor.endsWith('c')) {
    forms.add(`${anchor}ked`);
    forms.add(`${anchor}king`);
  }
  if (/[^aeiou]y$/i.test(anchor)) {
    forms.add(`${anchor.slice(0, -1)}ies`);
    forms.add(`${anchor.slice(0, -1)}ied`);
  }
  if (/[aeiou][^aeiouwxy]$/i.test(anchor)) {
    const last = anchor.slice(-1);
    forms.add(`${anchor}${last}ed`);
    forms.add(`${anchor}${last}ing`);
  }
  return forms.has(token);
}

function lexicalAnchors(value: string): string[] {
  return normalizeLexicalSequence(value)
    .split(/\s+/)
    .filter((token) => token && !PLACEHOLDER_TOKENS.has(token));
}

function containsLexicalAnchors(text: string, pattern: string): boolean {
  const textKey = normalizeLexicalSequence(text);
  const patternKey = normalizeLexicalSequence(pattern);
  if (!textKey || !patternKey) return false;
  if ((` ${textKey} `).includes(` ${patternKey} `)) return true;

  const textTokens = textKey.split(/\s+/).filter(Boolean);
  const anchors = lexicalAnchors(pattern);
  return anchors.length > 0 && anchors.every((anchor) =>
    textTokens.some((token) => tokenMatchesAnchor(token, anchor))
  );
}

export function sourceTextFromUsageLine(value: string): string {
  return value.split(/\s+[—–-]\s+/)[0]?.trim() || '';
}

export function isValidCollocationForSubject(phrase: string, subject: string): boolean {
  const phraseKey = normalizeLexicalSequence(phrase);
  const subjectKey = normalizeLexicalSequence(subject);
  if (!phraseKey || !subjectKey) return false;
  return containsLexicalAnchors(phrase, subject);
}

export function isCompleteExampleSentence(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (!trimmed) return false;

  const containsCJKOrHangul = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(trimmed);
  if (containsCJKOrHangul) {
    const compactLength = trimmed.replace(/\s+/g, '').length;
    return compactLength >= 8;
  }

  const tokens = normalizeLexicalSequence(trimmed).split(/\s+/).filter(Boolean);
  if (tokens.length >= 6) return true;
  return tokens.length >= 4 && /[.!?]\s*$/.test(trimmed);
}

export function exampleRealizesCollocation(sentence: string, collocation: string): boolean {
  return containsLexicalAnchors(sentence, collocation);
}

export function filterUsageTextPairs(
  collocationText: string,
  exampleText: string,
  subject: string
): { collocations: string; examples: string } {
  const collocations = collocationText
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const examples = exampleText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const validPairs = collocations
    .map((line, index) => ({
      collocation: line,
      example: examples[index] || '',
      phrase: sourceTextFromUsageLine(line),
      sentence: sourceTextFromUsageLine(examples[index] || ''),
    }))
    .filter(({ phrase }) => isValidCollocationForSubject(phrase, subject))
    .filter(({ example, phrase, sentence }) =>
      Boolean(example && exampleRealizesCollocation(sentence, phrase))
    );

  return {
    collocations: validPairs.map(({ collocation }) => collocation).join('\n'),
    examples: validPairs.map(({ example }) => example).filter(Boolean).join('\n'),
  };
}

type UsagePairLike = {
  phrase?: unknown;
  collocation?: unknown;
  translation?: unknown;
  example?: unknown;
  exampleSentence?: unknown;
  sentence?: unknown;
  exampleTranslation?: unknown;
  translationOfExample?: unknown;
};

type GeneratedUsageInput = {
  usagePairs?: unknown;
  frequentCollocations?: unknown;
  example?: unknown;
};

type NormalizedUsagePair = {
  collocation: { phrase: string; translation: string };
  example: { sentence: string; translation: string };
};

function usageText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pairFromUsageObject(value: unknown): NormalizedUsagePair {
  const pair = value && typeof value === 'object'
    ? value as UsagePairLike
    : {};
  const nestedExample = pair.example && typeof pair.example === 'object'
    ? pair.example as { sentence?: unknown; translation?: unknown }
    : {};

  return {
    collocation: {
      phrase: usageText(pair.phrase || pair.collocation),
      translation: usageText(pair.translation),
    },
    example: {
      sentence: usageText(
        nestedExample.sentence ||
        (typeof pair.example === 'string' ? pair.example : '') ||
        pair.exampleSentence ||
        pair.sentence
      ),
      translation: usageText(
        nestedExample.translation ||
        pair.exampleTranslation ||
        pair.translationOfExample
      ),
    },
  };
}

export function isProperNounPartOfSpeech(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return (
    /\b(?:proper\s*noun|propernoun|proper_noun)\b/i.test(normalized) ||
    /專有名詞|专有名词|固有名詞|고유\s*명사|nombre\s*propio|nom\s*propre/u.test(normalized)
  );
}

export function isProperNounSubject(
  options?:
    | {
        partOfSpeech?: string | null;
        definition?: string | null;
      }
    | string
    | null
): boolean {
  const partOfSpeech = typeof options === 'string' ? options : options?.partOfSpeech;
  if (isProperNounPartOfSpeech(partOfSpeech)) {
    return true;
  }

  const definition = typeof options === 'object' ? options?.definition : undefined;
  if (typeof definition === 'string') {
    const normalizedDef = definition.trim();
    if (
      /專有名詞|專有詞|社群平台|社交網路|社交平台|社群網站|網路服務|軟體平台|品牌名稱|品牌/u.test(
        normalizedDef
      ) ||
      /\b(?:proper\s*noun|social\s*network(?:ing)?|social\s*media|online\s*platform|web\s*platform|defunct\s*(?:social\s*)?(?:network|service|platform)|brand)\b/i.test(
        normalizedDef
      )
    ) {
      return true;
    }
  }

  return false;
}

export function resolveNormalizedPartOfSpeech(
  partOfSpeech?: string | null,
  definition?: string | null
): string {
  if (isProperNounSubject({ partOfSpeech, definition })) {
    return 'proper noun';
  }
  return (partOfSpeech || '').trim();
}

export type NormalizeGeneratedUsageOptions = {
  partOfSpeech?: string | null;
  definition?: string | null;
  allowEmptyCollocations?: boolean;
};

export function normalizeGeneratedUsagePairs(
  input: GeneratedUsageInput,
  subject: string,
  options?: NormalizeGeneratedUsageOptions
): {
  frequentCollocations: NormalizedUsagePair['collocation'][];
  example: NormalizedUsagePair['example'][];
} {
  const usagePairs = Array.isArray(input.usagePairs) ? input.usagePairs : [];
  const legacyCollocations = Array.isArray(input.frequentCollocations)
    ? input.frequentCollocations
    : [];
  const legacyExamples = Array.isArray(input.example) ? input.example : [];
  const candidates = usagePairs.length > 0
    ? usagePairs.map(pairFromUsageObject)
    : legacyCollocations.map((collocation, index) => {
        const collocationObject = collocation && typeof collocation === 'object'
          ? collocation as UsagePairLike
          : { phrase: collocation };
        return pairFromUsageObject({
          ...collocationObject,
          example: legacyExamples[index],
        });
      });

  const validPairs = candidates
    .filter(({ collocation }) =>
      isValidCollocationForSubject(collocation.phrase, subject)
    )
    .filter(({ collocation, example }) =>
      Boolean(
        example.sentence &&
        exampleRealizesCollocation(example.sentence, collocation.phrase)
      )
    );

  // If we have valid pairs (both collocation and example match), use them
  if (validPairs.length > 0) {
    return {
      frequentCollocations: validPairs.map(({ collocation }) => collocation),
      example: validPairs.map(({ example }) => example),
    };
  }

  const isProperNoun = isProperNounSubject(options);
  const allowEmptyCollocations = isProperNoun || Boolean(options?.allowEmptyCollocations);

  if (allowEmptyCollocations) {
    const validExamples = candidates
      .map(({ example }) => example)
      .filter((example) =>
        Boolean(
          example.sentence &&
          containsLexicalAnchors(example.sentence, subject)
        )
      );

    if (validExamples.length === 0) {
      throw new Error(`Card enrichment missing valid example for "${subject}"`);
    }

    return {
      frequentCollocations: [],
      example: validExamples,
    };
  }

  throw new Error(
    `Card enrichment missing valid collocation and example pairs for "${subject}"`
  );
}

