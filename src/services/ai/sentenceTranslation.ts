function normalizeLexicalSequence(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}'-]+/gu)
    ?.join(' ')
    .trim() || '';
}

/** Letters and digits only, so "anatural" and "a “natural”" compare equal. */
function compactLexicalSequence(value: string): string {
  return normalizeLexicalSequence(value).replace(/[\s'-]+/g, '');
}

function isMostlyLatinText(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  if (!compact) return false;
  const latinCount = (compact.match(/[A-Za-z]/g) || []).length;
  const cjkKanaHangulCount = (compact.match(/[㐀-鿿぀-ヿ가-힯]/g) || []).length;
  return latinCount > 0 && latinCount >= cjkKanaHangulCount;
}

export function normalizeLatinQuoteMarks(value: string): string {
  if (!isMostlyLatinText(value)) return value;
  return value
    .replace(/「([^」]+)」/g, '“$1”')
    .replace(/『([^』]+)』/g, '“$1”')
    .replace(/（([^）]+)）/g, '($1)');
}

/**
 * Normalizes the AI's "source line\ntranslation" into exactly two lines.
 *
 * When the AI's source line is the stored sentence with spaces restored
 * (the server fixes OCR run-togethers: "you were anatural" → "you were a
 * natural"), the AI's corrected line replaces the stored one instead of
 * being shown as an extra line.
 */
export function normalizeSentenceTranslation(value: unknown, originalSentence: string): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const cleanOriginal = originalSentence.trim();
  const normalizedFirstLine = normalizeLexicalSequence(lines[0] || '');
  const normalizedOriginal = normalizeLexicalSequence(cleanOriginal);
  const firstLineRepeatsSource =
    Boolean(normalizedOriginal) &&
    (normalizedFirstLine === normalizedOriginal ||
      normalizedFirstLine.includes(normalizedOriginal) ||
      normalizedOriginal.includes(normalizedFirstLine));
  const firstLineRespacesSource =
    !firstLineRepeatsSource &&
    Boolean(normalizedOriginal) &&
    lines.length > 1 &&
    compactLexicalSequence(lines[0]) === compactLexicalSequence(cleanOriginal);
  const sourceLine = firstLineRespacesSource
    ? lines[0]
    : cleanOriginal || lines[0] || '';
  const translationLine = (
    firstLineRepeatsSource || firstLineRespacesSource ? lines.slice(1) : lines
  )
    .join(' ')
    .trim();

  const normalizedSource = normalizeLatinQuoteMarks(sourceLine || cleanOriginal);
  const normalizedTranslation = normalizeLatinQuoteMarks(translationLine);
  return [normalizedSource, normalizedTranslation].filter(Boolean).join('\n');
}

/** Indexes (counted over letters/digits only) after which `text` has a gap. */
function letterStreamWithGaps(text: string): { letters: string; gapsAfter: Set<number> } {
  let letters = '';
  const gapsAfter = new Set<number>();
  let pendingGap = false;
  for (const char of text.normalize('NFKC')) {
    if (/[\p{L}\p{N}]/u.test(char)) {
      if (pendingGap && letters.length > 0) gapsAfter.add(letters.length - 1);
      pendingGap = false;
      letters += char.toLowerCase();
    } else if (/\s/.test(char)) {
      pendingGap = true;
    }
  }
  return { letters, gapsAfter };
}

/**
 * Returns `sourceSentence` with the spaces the AI's source line restored
 * ("I thought you were anatural." + "I thought you were a “natural”" →
 * "I thought you were a natural."), keeping the original punctuation. Only
 * inserts spaces between two letters; returns null when the lines are not
 * the same letters or nothing changes.
 */
export function respaceSourceSentence(
  sourceSentence: string,
  aiSourceLine: string
): string | null {
  if (!sourceSentence || !aiSourceLine) return null;
  const original = letterStreamWithGaps(sourceSentence);
  const reference = letterStreamWithGaps(aiSourceLine);
  if (!original.letters || original.letters !== reference.letters) return null;

  let result = '';
  let letterIndex = -1;
  let inserted = false;
  const chars = Array.from(sourceSentence);
  chars.forEach((char, index) => {
    result += char;
    if (!/[\p{L}\p{N}]/u.test(char.normalize('NFKC'))) return;
    letterIndex += 1;
    const next = chars[index + 1];
    if (
      next &&
      /[\p{L}\p{N}]/u.test(next.normalize('NFKC')) &&
      reference.gapsAfter.has(letterIndex) &&
      !original.gapsAfter.has(letterIndex)
    ) {
      result += ' ';
      inserted = true;
    }
  });
  return inserted ? result : null;
}

/**
 * Reads the AI's source line from a card's contextualExplanation JSON and
 * returns the respaced sentence, or null when there is nothing to restore.
 */
export function respaceSourceSentenceFromContext(
  sourceSentence: string,
  contextualExplanation: string | undefined | null
): string | null {
  const raw = (contextualExplanation || '').trim();
  if (!raw.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(raw) as { sentenceTranslation?: unknown };
    const firstLine =
      typeof parsed.sentenceTranslation === 'string'
        ? parsed.sentenceTranslation.split('\n').map((line) => line.trim()).find(Boolean) || ''
        : '';
    return respaceSourceSentence(sourceSentence, firstLine);
  } catch {
    return null;
  }
}
