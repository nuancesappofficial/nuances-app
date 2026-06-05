const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
  'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you',
  'he', 'she', 'it', 'we', 'they',
]);

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

export function normalizeDisplayWord(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function tokenizeSourceText(text: string): string[] {
  const normalized = (text || '').normalize('NFKC');
  if (!normalized.trim()) return [];
  const tokens =
    normalized.match(
      /[\p{Script=Han}]{1,6}|[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[A-Za-z][A-Za-z'’-]*|[0-9]+/gu
    ) || [];
  return tokens.map((token) => token.trim()).filter(Boolean);
}

export function pickSentenceContainingWord(text: string, word: string): string {
  const source = (text || '').trim();
  const target = normalizeSelectableTerm(word);
  if (!source) return '';
  if (!target) return source;

  const sentences = source
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!sentences.length) return source;

  const hasLatinOrDigit = /[a-z0-9]/i.test(target);
  const matched = hasLatinOrDigit
    ? (() => {
        const pieces = target.split(/\s+/).filter(Boolean);
        const escaped = pieces
          .map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('\\s+');
        const reg = new RegExp(`\\b${escaped}\\b`, 'i');
        return sentences.find((sentence) => reg.test(sentence));
      })()
    : sentences.find((sentence) => sentence.includes(target));
  return matched || sentences[0] || source;
}
