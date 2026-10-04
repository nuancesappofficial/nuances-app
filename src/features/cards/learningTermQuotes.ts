const CJK_SCRIPT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u;

export function getLearningTermQuotePair(term: string): readonly [string, string] {
  return CJK_SCRIPT_PATTERN.test(term) ? ['「', '」'] : ['“', '”'];
}

export function formatQuotedLearningTerm(term: string): string {
  const trimmed = (term || '').trim();
  if (!trimmed) return '';
  const [openQuote, closeQuote] = getLearningTermQuotePair(trimmed);
  return `${openQuote}${trimmed}${closeQuote}`;
}

export function quoteLearningTermInText(text: string, term: string): string {
  const trimmedText = (text || '').trim();
  const trimmedTerm = (term || '').trim();
  if (!trimmedText || !trimmedTerm) return trimmedText;

  const [openQuote, closeQuote] = getLearningTermQuotePair(trimmedTerm);
  const escapedTerm = trimmedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alreadyQuoted = new RegExp(
    `[「『“"'‘]\\s*(${escapedTerm})\\s*[」』”"'’]`,
    'i'
  );
  if (alreadyQuoted.test(trimmedText)) {
    return trimmedText.replace(
      alreadyQuoted,
      (_match, matchedTerm: string) => `${openQuote}${matchedTerm}${closeQuote}`
    );
  }

  const matcher = new RegExp(escapedTerm, 'i');
  return matcher.test(trimmedText)
    ? trimmedText.replace(matcher, (match) => `${openQuote}${match}${closeQuote}`)
    : trimmedText;
}

export function unquoteLearningTermInText(text: string, term: string): string {
  const trimmedText = (text || '').trim();
  const trimmedTerm = (term || '').trim();
  if (!trimmedText || !trimmedTerm) return trimmedText;

  const escapedTerm = trimmedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isCjk = CJK_SCRIPT_PATTERN.test(trimmedTerm);
  const pattern = isCjk
    ? `[「『“"'‘]\\s*(${escapedTerm})\\s*[」』”"'’]`
    : `[「『“"'‘]\\s*(${escapedTerm}(?:[a-zA-Z]{1,4})?)\\s*[」』”"'’]`;
  const alreadyQuoted = new RegExp(pattern, 'i');
  return trimmedText.replace(alreadyQuoted, '$1');
}

export type SentenceSegment = {
  text: string;
  isBold: boolean;
};

export function segmentSentenceWithTargetWord(
  text: string,
  term: string
): SentenceSegment[] {
  const cleanSentence = unquoteLearningTermInText(text, term);
  const trimmedTerm = (term || '').trim();
  if (!cleanSentence) return [];
  if (!trimmedTerm) return [{ text: cleanSentence, isBold: false }];

  const escapedTerm = trimmedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isCjk = CJK_SCRIPT_PATTERN.test(trimmedTerm);
  const pattern = isCjk
    ? `(${escapedTerm})`
    : `\\b(${escapedTerm}(?:[a-zA-Z]{1,4})?)\\b`;
  const matcher = new RegExp(pattern, 'i');
  const parts = cleanSentence.split(matcher);

  if (parts.length <= 1) {
    const fallbackMatcher = new RegExp(`(${escapedTerm})`, 'i');
    const fallbackParts = cleanSentence.split(fallbackMatcher);
    if (fallbackParts.length <= 1) {
      return [{ text: cleanSentence, isBold: false }];
    }
    return fallbackParts
      .filter(Boolean)
      .map((part) => ({
        text: part,
        isBold: part.toLowerCase() === trimmedTerm.toLowerCase(),
      }));
  }

  const segments: SentenceSegment[] = [];
  const termLower = trimmedTerm.toLowerCase();

  for (const part of parts) {
    if (!part) continue;
    const isTargetMatch =
      part.toLowerCase() === termLower ||
      (!isCjk && part.toLowerCase().startsWith(termLower));
    segments.push({ text: part, isBold: isTargetMatch });
  }

  return segments;
}

export function sliceSegmentsByCharacterCount(
  segments: readonly SentenceSegment[],
  visibleCount: number
): SentenceSegment[] {
  if (visibleCount <= 0 || segments.length === 0) {
    return [];
  }

  let remaining = visibleCount;
  const result: SentenceSegment[] = [];

  for (const seg of segments) {
    if (remaining <= 0) break;
    const segUnits = Array.from(seg.text);
    if (segUnits.length === 0) continue;

    const take = Math.min(remaining, segUnits.length);
    const slicedText = segUnits.slice(0, take).join('');
    result.push({
      text: slicedText,
      isBold: seg.isBold,
    });
    remaining -= take;
  }

  return result;
}

export function buildProgressiveSentenceSegments(
  text: string,
  highlightTerm?: string
): {
  segments: SentenceSegment[];
  cleanText: string;
} {
  const trimmedTerm = (highlightTerm || '').trim();
  if (!text) {
    return { segments: [], cleanText: '' };
  }

  if (!trimmedTerm) {
    return {
      segments: [{ text, isBold: false }],
      cleanText: text,
    };
  }

  const rawSegments = segmentSentenceWithTargetWord(text, trimmedTerm);
  if (rawSegments.length === 0) {
    return {
      segments: [{ text, isBold: false }],
      cleanText: text,
    };
  }

  const cleanText = rawSegments.map((s) => s.text).join('');
  return {
    segments: rawSegments,
    cleanText,
  };
}


