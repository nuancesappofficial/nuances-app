const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
  'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you',
  'he', 'she', 'it', 'we', 'they',
]);

const MULTI_SELECTION_FUNCTION_WORDS = new Set([
  ...STOP_WORDS,
  'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their', 'its',
  'mine', 'yours', 'hers', 'ours', 'theirs', 'myself', 'yourself', 'himself',
  'herself', 'itself', 'ourselves', 'yourselves', 'themselves',
  'into', 'onto', 'up', 'down', 'out', 'off', 'over', 'under', 'through',
  'about', 'around', 'before', 'after', 'above', 'below', 'between', 'among',
  'within', 'without', 'than', 'then', 'so', 'not', 'no', 'nor', 'yet',
]);

type SourceSelectableTokenRange = {
  start: number;
  end: number;
  text: string;
  tokenizer: 'segmenter' | 'regex';
};

type WordSegment = {
  segment: string;
  index: number;
  isWordLike?: boolean;
};

type WordSegmenter = {
  segment(input: string): Iterable<WordSegment>;
};

type WordSegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity?: 'word' }
) => WordSegmenter;

function getWordSegmenterConstructor(): WordSegmenterConstructor | null {
  const maybeIntl = Intl as typeof Intl & {
    Segmenter?: WordSegmenterConstructor;
  };
  return typeof maybeIntl.Segmenter === 'function' ? maybeIntl.Segmenter : null;
}

function containsCJKOrHangul(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}

function resolveSegmenterLocale(text: string): 'zh' | 'ja' | 'ko' {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja';
  if (/\p{Script=Hangul}/u.test(text)) return 'ko';
  return 'zh';
}

function isSingleCJKOrHangulToken(token: string): boolean {
  return /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u.test(token);
}

export function extractWords(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-z'-]+\b/g) || [];
  return Array.from(new Set(words)).filter((word) => !STOP_WORDS.has(word) && word.length > 2);
}

export function normalizeWord(raw: string): string {
  const normalized = (raw || '')
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .trim();
  if (!normalized) return '';
  const pieces = normalized.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) || [];
  return pieces.join('');
}

export function normalizeSelectableTerm(raw: string): string {
  const normalized = (raw || '')
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .trim();
  if (!normalized) return '';
  const pieces = normalized.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) || [];
  return pieces.join(' ');
}

function isMeaningfulMultiSelectionToken(token: string): boolean {
  const normalized = normalizeSelectableTerm(token);
  if (!normalized) return false;
  if (/^\d+$/u.test(normalized)) return false;
  return !MULTI_SELECTION_FUNCTION_WORDS.has(normalized);
}

export function normalizeDisplayWord(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function tokenizeSourceTextWithRanges(text: string): SourceSelectableTokenRange[] {
  const normalized = (text || '').normalize('NFKC');
  if (!normalized.trim()) return [];

  const Segmenter = getWordSegmenterConstructor();
  if (Segmenter && containsCJKOrHangul(normalized)) {
    const segmenter = new Segmenter(resolveSegmenterLocale(normalized), {
      granularity: 'word',
    });
    const segmented = Array.from(segmenter.segment(normalized))
      .map((segment) => {
        const text = segment.segment.trim();
        if (!text || !normalizeSelectableTerm(text)) return null;
        if (segment.isWordLike === false && !containsCJKOrHangul(text)) return null;
        return {
          start: segment.index,
          end: segment.index + segment.segment.length,
          text,
          tokenizer: 'segmenter',
        };
      })
      .filter((token): token is SourceSelectableTokenRange => Boolean(token));
    if (segmented.length > 0) return segmented;
  }

  const matcher =
    /[\p{Script=Han}]|[\p{Script=Hiragana}]|[\p{Script=Katakana}]|[\p{Script=Hangul}]|[A-Za-z][A-Za-z'’-]*|[0-9]+/gu;
  const ranges: SourceSelectableTokenRange[] = [];
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(normalized)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      tokenizer: 'regex',
    });
  }
  return ranges;
}

export function tokenizeSourceText(text: string): string[] {
  return tokenizeSourceTextWithRanges(text).map((token) => token.text);
}

export type SelectedSourceTarget = {
  id: string;
  text: string;
  startIndex: number;
  endIndex: number;
  targetOccurrence: number;
};

export function groupSelectedSourceTokens(
  tokens: string[],
  selectedIndices: number[],
  sourceText?: string
): SelectedSourceTarget[] {
  const validIndices = Array.from(
    new Set(
      selectedIndices.filter(
        (index) => Number.isInteger(index) && index >= 0 && index < tokens.length
      )
    )
  ).sort((a, b) => a - b);
  if (!validIndices.length) return [];

  const sourceTokenRanges = (() => {
    if (!sourceText?.trim()) return null;
    const normalizedSource = sourceText.normalize('NFKC');
    const ranges = tokenizeSourceTextWithRanges(normalizedSource);
    const alignsWithTokens =
      ranges.length === tokens.length &&
      ranges.every(
        (range, index) =>
          normalizeSelectableTerm(range.text) ===
          normalizeSelectableTerm(tokens[index] || '')
      );
    return alignsWithTokens ? { normalizedSource, ranges } : null;
  })();
  const canMergeAcross = (leftIndex: number, rightIndex: number) => {
    if (!sourceTokenRanges) return true;
    const left = sourceTokenRanges.ranges[leftIndex];
    const right = sourceTokenRanges.ranges[rightIndex];
    if (!left || !right) return false;
    const separator = sourceTokenRanges.normalizedSource.slice(left.end, right.start);
    return !/[.!?。！？,，;；:\n]/.test(separator);
  };

  const spans: Array<{ startIndex: number; endIndex: number }> = [];
  for (const index of validIndices) {
    const current = spans[spans.length - 1];
    if (
      current &&
      index === current.endIndex + 1 &&
      canMergeAcross(current.endIndex, index)
    ) {
      current.endIndex = index;
    } else {
      spans.push({ startIndex: index, endIndex: index });
    }
  }

  const buildTarget = (startIndex: number, endIndex: number): SelectedSourceTarget | null => {
    const selectedTokens = tokens.slice(startIndex, endIndex + 1);
    const normalizedTokens = selectedTokens.map(normalizeSelectableTerm).filter(Boolean);
    const text = normalizedTokens.join(' ').trim();
    if (!text) return null;

    let targetOccurrence = 0;
    const spanLength = endIndex - startIndex + 1;
    for (let index = 0; index < startIndex; index += 1) {
      const candidate = tokens
        .slice(index, index + spanLength)
        .map(normalizeSelectableTerm)
        .filter(Boolean)
        .join(' ');
      if (candidate === text) targetOccurrence += 1;
    }

    return {
      id: `${startIndex}:${endIndex}`,
      text,
      startIndex,
      endIndex,
      targetOccurrence,
    };
  };

  return spans
    .flatMap(({ startIndex, endIndex }) => {
      if (startIndex === endIndex) return [buildTarget(startIndex, endIndex)];

      const tokenIndices = tokens
        .slice(startIndex, endIndex + 1)
        .map((token, offset) => ({ token, index: startIndex + offset }));
      const isCharacterFallbackCJKSpan =
        tokenIndices.every(({ token }) => isSingleCJKOrHangulToken(token)) &&
        (!sourceTokenRanges ||
          tokenIndices.every(
            ({ index }) => sourceTokenRanges.ranges[index]?.tokenizer === 'regex'
          ));
      if (isCharacterFallbackCJKSpan) return [buildTarget(startIndex, endIndex)];

      const meaningfulTokenIndices = tokenIndices
        .filter(({ token }) => isMeaningfulMultiSelectionToken(token))
        .map(({ index }) => index);
      const splitIndices =
        meaningfulTokenIndices.length > 0
          ? meaningfulTokenIndices
          : tokenIndices
              .filter(({ token }) => normalizeSelectableTerm(token))
              .map(({ index }) => index);

      return splitIndices.map((index) => buildTarget(index, index));
    })
    .filter((target): target is SelectedSourceTarget => Boolean(target));
}

type SourceToken = {
  start: number;
  end: number;
  normalized: string;
};

type SentenceSpan = {
  start: number;
  end: number;
};

export type SourceSentenceOptions = {
  /**
   * Character position of the selected token in `text`. OCR uses this to
   * disambiguate repeated words without relying on a fuzzy text match.
   */
  targetOffset?: number;
  /** Zero-based occurrence when the same selectable term appears repeatedly. */
  targetOccurrence?: number;
};

const SENTENCE_CLOSERS = new Set(['"', "'", '”', '’', ')', ']', '}', '」', '』']);
const NON_TERMINAL_ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc',
  'e.g', 'i.e', 'a.m', 'p.m', 'u.s', 'u.k',
]);
const MAX_SOURCE_WORDS = 45;
const MAX_SOURCE_CHARS = 320;
const MIN_CONTEXT_WORDS = 12;

function normalizeSourceText(text: string): string {
  const normalized = (text || '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
  // OCR line wrapping is not a semantic sentence boundary. Preserve only
  // blank lines as paragraph boundaries.
  return normalized
    .split('\n\n')
    .map((paragraph) => paragraph.replace(/\n/g, ' '))
    .join('\n\n');
}

function sourceTokens(text: string): SourceToken[] {
  const tokens: SourceToken[] = [];
  const matcher = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text)) !== null) {
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      normalized: normalizeSelectableTerm(match[0]),
    });
  }
  return tokens;
}

function isTerminalPeriod(text: string, index: number): boolean {
  const previous = text[index - 1] || '';
  const next = text[index + 1] || '';
  if (/\d/.test(previous) && /\d/.test(next)) return false;
  if (next && !/\s|["'”’)\]}」』]/.test(next)) return false;

  const prefix = text.slice(0, index);
  const token = prefix.match(/(?:[\p{L}]\.)*[\p{L}]+$/u)?.[0]?.toLowerCase() || '';
  if (NON_TERMINAL_ABBREVIATIONS.has(token)) return false;
  if (/^[a-z]$/i.test(token)) return false;
  return true;
}

function splitSentenceSpans(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const paragraphBreak = char === '\n' && text[index + 1] === '\n';
    const terminal =
      /[!?。！？]/.test(char) ||
      (char === '.' && isTerminalPeriod(text, index));
    if (!paragraphBreak && !terminal) continue;

    let end = paragraphBreak ? index : index + 1;
    if (terminal) {
      while (end < text.length && SENTENCE_CLOSERS.has(text[end])) end += 1;
    }
    if (text.slice(start, end).trim()) spans.push({ start, end });
    start = paragraphBreak ? index + 2 : end;
    if (paragraphBreak) index += 1;
  }
  if (text.slice(start).trim()) spans.push({ start, end: text.length });
  return spans.length ? spans : [{ start: 0, end: text.length }];
}

function locateTargetToken(
  tokens: SourceToken[],
  target: string,
  options: SourceSentenceOptions
): number {
  if (!tokens.length) return -1;
  const { targetOffset, targetOccurrence } = options;
  if (typeof targetOffset === 'number' && Number.isFinite(targetOffset)) {
    const containing = tokens.findIndex(
      (token) => targetOffset >= token.start && targetOffset < token.end
    );
    if (containing >= 0) return containing;
    return tokens.reduce(
      (best, token, index) =>
        Math.abs(token.start - targetOffset) < Math.abs(tokens[best].start - targetOffset)
          ? index
          : best,
      0
    );
  }

  const targetParts = target.split(/\s+/).filter(Boolean);
  if (!targetParts.length) return -1;
  const exactMatches: number[] = [];
  for (let index = 0; index <= tokens.length - targetParts.length; index += 1) {
    if (
      targetParts.every(
        (part, partIndex) => tokens[index + partIndex]?.normalized === part
      )
    ) {
      exactMatches.push(index);
    }
  }
  if (exactMatches.length) {
    const occurrence =
      typeof targetOccurrence === 'number' && Number.isFinite(targetOccurrence)
        ? Math.max(0, Math.floor(targetOccurrence))
        : 0;
    return exactMatches[Math.min(occurrence, exactMatches.length - 1)];
  }

  // A promoted phrase may contain a placeholder such as "someone" that is not
  // present verbatim in the source. Anchor it to the first meaningful piece.
  const meaningfulPart = targetParts.find(
    (part) => !['someone', 'somebody', 'something', 'one'].includes(part)
  );
  return meaningfulPart
    ? tokens.findIndex((token) => token.normalized === meaningfulPart)
    : -1;
}

function tokenCount(text: string): number {
  return sourceTokens(text).length;
}

function clipLongSpan(text: string, span: SentenceSpan, targetPosition: number): string {
  const value = text.slice(span.start, span.end).trim();
  const tokens = sourceTokens(value);
  if (tokens.length <= MAX_SOURCE_WORDS && value.length <= MAX_SOURCE_CHARS) return value;

  const localTarget = Math.max(0, targetPosition - span.start);
  const clauseBoundaries = Array.from(value.matchAll(/[;:,—–]/g))
    .map((match) => match.index)
    .filter((index): index is number => typeof index === 'number');
  const previousBoundaries = clauseBoundaries.filter((index) => index < localTarget);
  const previousBoundary = previousBoundaries[previousBoundaries.length - 1];
  const nextBoundary = clauseBoundaries.find((index) => index > localTarget);
  if (previousBoundary !== undefined || nextBoundary !== undefined) {
    const clauseStart = previousBoundary !== undefined ? previousBoundary + 1 : 0;
    const clauseEnd = nextBoundary !== undefined ? nextBoundary : value.length;
    const clause = value.slice(clauseStart, clauseEnd).trim();
    const clauseWords = tokenCount(clause);
    if (
      clauseWords >= MIN_CONTEXT_WORDS &&
      clauseWords <= MAX_SOURCE_WORDS &&
      clause.length <= MAX_SOURCE_CHARS
    ) {
      return `${clauseStart > 0 ? '…' : ''}${clause}${clauseEnd < value.length ? '…' : ''}`;
    }
  }

  const targetTokenIndex = tokens.findIndex(
    (token) => localTarget >= token.start && localTarget < token.end
  );
  const anchor = targetTokenIndex >= 0
    ? targetTokenIndex
    : tokens.reduce(
        (best, token, index) =>
          Math.abs(token.start - localTarget) < Math.abs(tokens[best].start - localTarget)
            ? index
            : best,
        0
      );
  const halfWindow = Math.floor(MAX_SOURCE_WORDS / 2);
  let first = Math.max(0, anchor - halfWindow);
  const last = Math.min(tokens.length - 1, first + MAX_SOURCE_WORDS - 1);
  first = Math.max(0, last - MAX_SOURCE_WORDS + 1);

  // Prefer nearby clause punctuation over cutting in the middle of a thought.
  const leftSearchStart = first > 0 ? tokens[first - 1].end : 0;
  const leftSearchEnd = tokens[first].start;
  const leftBoundary = value.slice(leftSearchStart, leftSearchEnd).search(/[;:,—–]/);
  if (leftBoundary >= 0) {
    const boundaryPosition = leftSearchStart + leftBoundary + 1;
    while (first < anchor && tokens[first].start < boundaryPosition) first += 1;
  }
  const rightSearchStart = tokens[last].end;
  const rightSearchEnd = last < tokens.length - 1 ? tokens[last + 1].start : value.length;
  const rightBoundary = value.slice(rightSearchStart, rightSearchEnd).search(/[;:,—–]/);
  const clippedEnd =
    rightBoundary >= 0 ? rightSearchStart + rightBoundary + 1 : tokens[last].end;

  const excerpt = value.slice(tokens[first].start, clippedEnd).trim();
  return `${first > 0 ? '…' : ''}${excerpt}${last < tokens.length - 1 ? '…' : ''}`;
}

export function pickSentenceContainingWord(
  text: string,
  word: string,
  options: SourceSentenceOptions = {}
): string {
  const source = normalizeSourceText(text);
  const target = normalizeSelectableTerm(word);
  if (!source) return '';
  if (!target) return source;

  const tokens = sourceTokens(source);
  const targetTokenIndex = locateTargetToken(tokens, target, options);
  let targetPosition =
    targetTokenIndex >= 0 ? tokens[targetTokenIndex].start : -1;
  if (targetPosition < 0) {
    const foldedSource = source.toLocaleLowerCase();
    const foldedTarget = target.toLocaleLowerCase();
    const requestedOccurrence =
      typeof options.targetOccurrence === 'number'
        ? Math.max(0, Math.floor(options.targetOccurrence))
        : 0;
    let searchFrom = 0;
    for (let occurrence = 0; occurrence <= requestedOccurrence; occurrence += 1) {
      targetPosition = foldedSource.indexOf(foldedTarget, searchFrom);
      if (targetPosition < 0) break;
      searchFrom = targetPosition + Math.max(1, foldedTarget.length);
    }
  }
  if (targetPosition < 0) {
    const firstSpan = splitSentenceSpans(source)[0];
    return clipLongSpan(source, firstSpan, firstSpan.start);
  }

  const spans = splitSentenceSpans(source);
  let spanIndex = spans.findIndex(
    (span) => targetPosition >= span.start && targetPosition < span.end
  );
  if (spanIndex < 0) spanIndex = 0;

  const selected = { ...spans[spanIndex] };
  // Very short fragments rarely disambiguate a selected word. Add one nearby
  // complete sentence, while keeping the excerpt bounded.
  while (
    tokenCount(source.slice(selected.start, selected.end)) < MIN_CONTEXT_WORDS &&
    (spanIndex > 0 || spanIndex < spans.length - 1)
  ) {
    const next = spans[spanIndex + 1];
    const previous = spans[spanIndex - 1];
    if (previous) {
      selected.start = previous.start;
      spanIndex -= 1;
    } else if (next) {
      selected.end = next.end;
      spanIndex += 1;
    } else {
      break;
    }
    if (
      tokenCount(source.slice(selected.start, selected.end)) >= MAX_SOURCE_WORDS ||
      selected.end - selected.start >= MAX_SOURCE_CHARS
    ) {
      break;
    }
  }

  return clipLongSpan(source, selected, targetPosition);
}
