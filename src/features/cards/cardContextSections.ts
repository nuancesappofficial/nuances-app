import {
  formatQuotedLearningTerm,
  quoteLearningTermInText,
} from './learningTermQuotes';

export type CardContextSections = {
  sentenceTranslation: string;
  sentenceNotes: string;
  culturalBackground: string;
  exampleSentence: string;
  isStructured: boolean;
};

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFlexibleTextPattern(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join('\\s+');
}

type TextScript = 'latin' | 'han' | 'japanese' | 'korean' | 'unknown';

function getCharacterScript(char: string): TextScript {
  if (/[\u3040-\u30ff]/u.test(char)) return 'japanese';
  if (/[\uac00-\ud7af]/u.test(char)) return 'korean';
  if (/[\u3400-\u9fff]/u.test(char)) return 'han';
  if (/[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(char)) return 'latin';
  return 'unknown';
}

function getDominantTextScript(value: string): TextScript {
  const counts: Record<TextScript, number> = {
    latin: 0,
    han: 0,
    japanese: 0,
    korean: 0,
    unknown: 0,
  };
  Array.from(value).forEach((char) => {
    const script = getCharacterScript(char);
    if (script !== 'unknown') counts[script] += 1;
  });

  const ranked = (Object.entries(counts) as Array<[TextScript, number]>)
    .filter(([script]) => script !== 'unknown')
    .sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[1] ? ranked[0][0] : 'unknown';
}

function shouldSplitLanguageBoundary(left: string, right: string): boolean {
  const leftScript = getDominantTextScript(left);
  const rightScript = getDominantTextScript(right);
  return leftScript !== 'unknown' && rightScript !== 'unknown' && leftScript !== rightScript;
}

function findInlineLanguageBoundary(value: string): number {
  const chars = Array.from(value);
  let leftScript: TextScript = 'unknown';
  for (let index = 0; index < chars.length; index += 1) {
    const currentScript = getCharacterScript(chars[index]);
    if (currentScript === 'unknown') continue;
    if (leftScript === 'unknown') {
      leftScript = currentScript;
      continue;
    }
    if (currentScript === leftScript) continue;

    const left = chars.slice(0, index).join('').trim();
    const right = chars.slice(index).join('').trim();
    if (left.length >= 8 && right.length >= 2 && shouldSplitLanguageBoundary(left, right)) {
      return index;
    }
  }
  return -1;
}

function splitInlineSourceAndTranslation(value: string): string | null {
  const singleLine = value.trim();
  if (!singleLine || singleLine.includes('\n')) return null;

  const explicitSeparatorMatch = singleLine.match(
    /^(.{8,}?[.!?。！？]["'”’)\]}」』]?|.{8,}?)(?:\s+[—–-]\s+|\s*[:：]\s+)(.+)$/u
  );
  if (
    explicitSeparatorMatch?.[1] &&
    explicitSeparatorMatch?.[2] &&
    shouldSplitLanguageBoundary(explicitSeparatorMatch[1], explicitSeparatorMatch[2])
  ) {
    return `${explicitSeparatorMatch[1].trim()}\n${explicitSeparatorMatch[2].trim()}`;
  }

  const scriptBoundaryMatch = singleLine.match(
    /^(.{8,}?[.!?。！？]["'”’)\]}」』]?)(?:\s+)?(.+)$/u
  );
  if (
    scriptBoundaryMatch?.[1] &&
    scriptBoundaryMatch?.[2] &&
    shouldSplitLanguageBoundary(scriptBoundaryMatch[1], scriptBoundaryMatch[2])
  ) {
    return `${scriptBoundaryMatch[1].trim()}\n${scriptBoundaryMatch[2].trim()}`;
  }

  const languageBoundaryIndex = findInlineLanguageBoundary(singleLine);
  if (languageBoundaryIndex > 0) {
    const chars = Array.from(singleLine);
    return `${chars.slice(0, languageBoundaryIndex).join('').trim()}\n${chars.slice(languageBoundaryIndex).join('').trim()}`;
  }

  return null;
}

function normalizeSentenceTranslationText(value: unknown, sourceSentence: string): string {
  const raw = cleanText(value).replace(/\r\n?/g, '\n');
  if (!raw) return '';

  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines.join('\n');

  const singleLine = lines[0] || raw.trim();
  const source = cleanText(sourceSentence);
  if (!source || !singleLine || singleLine === source) return singleLine;

  const sourcePattern = buildFlexibleTextPattern(source);
  if (!sourcePattern) return singleLine;

  const sourceThenTranslation = singleLine.match(
    new RegExp(`^${sourcePattern}(?:\\s*[—–-]\\s*|\\s*[:：]\\s*|\\s+)(.+)$`, 'iu')
  );
  const translation = sourceThenTranslation?.[1]?.trim();
  if (translation) return `${source}\n${translation}`;

  return splitInlineSourceAndTranslation(singleLine) || singleLine;
}

export function parseCardContextSections(params: {
  raw: string | undefined | null;
  displayWord: string;
  definition?: string | null;
  sourceSentence?: string | null;
  manualMode?: boolean;
}): CardContextSections {
  const raw = cleanText(params.raw);
  const displayWord = cleanText(params.displayWord);
  const sourceSentence = cleanText(params.sourceSentence);

  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const sentenceTranslation = normalizeSentenceTranslationText(
        parsed.sentenceTranslation || parsed.translation,
        sourceSentence
      );
      const sentenceNotes = cleanText(parsed.sentenceNotes || parsed.contextNote || parsed.usageNote);
      const culturalBackground = cleanText(
        parsed.context ||
          parsed.culturalBackground ||
          parsed.culturalContext ||
          parsed.usageFit ||
          parsed.whyItFits ||
          parsed.origin ||
          parsed.slangOrigin
      );
      const exampleSentence = cleanText(parsed.exampleSentence || parsed.example || parsed.naturalExample);

      if (sentenceTranslation || sentenceNotes || culturalBackground || exampleSentence) {
        return {
          sentenceTranslation: sentenceTranslation || sourceSentence || '-',
          sentenceNotes:
            sentenceNotes ||
            (params.manualMode ? 'Add your own sentence note.' : 'Context note is being prepared.'),
          culturalBackground,
          exampleSentence,
          isStructured: true,
        };
      }
    } catch {
      // Fall back to the legacy newline format below.
    }
  }

  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] || sourceSentence || displayWord || '-';
  const quotedWord = formatQuotedLearningTerm(displayWord);
  const quoteSeparator = /[\u3040-\u30ff\u3400-\u9fff]/u.test(displayWord)
    ? '：'
    : ': ';
  const escapedDisplayWord = displayWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const firstLineContainsWord = Boolean(
    displayWord && new RegExp(escapedDisplayWord, 'i').test(firstLine)
  );
  const legacyTranslation =
    quotedWord && !firstLineContainsWord
      ? `${quotedWord}${quoteSeparator}${firstLine}`
      : quoteLearningTermInText(firstLine, displayWord);

  return {
    sentenceTranslation: legacyTranslation,
    sentenceNotes:
      lines.length > 1
        ? lines.slice(1).join('\n')
        : raw || (params.manualMode ? 'Add your own sentence note.' : 'Context note is being prepared.'),
    culturalBackground: raw,
    exampleSentence: '',
    isStructured: false,
  };
}
