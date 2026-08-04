const FUSED_CONTRACTION_PREFIXES: Array<[RegExp, string]> = [
  [/\b(you|we|they) re(?=[a-z])/gi, "$1're "],
  [/\b(he|she|it|that|there|what|who|where) s(?=[a-z])/gi, "$1's "],
  [/\b(i|you|we|they) ve(?=[a-z])/gi, "$1've "],
  [/\b(i|you|he|she|we|they) ll(?=[a-z])/gi, "$1'll "],
  [/\b(i) m(?=[a-z])/gi, "$1'm "],
];

const COMPACT_CONTRACTIONS: Array<[RegExp, string]> = [
  [/\b(dont)\b/gi, "don't"],
  [/\b(cant)\b/gi, "can't"],
  [/\b(wont)\b/gi, "won't"],
  [/\b(im)\b/gi, "I'm"],
  [/\b(ive)\b/gi, "I've"],
  [/\b(youre)\b/gi, "you're"],
  [/\b(theyre)\b/gi, "they're"],
  [/\b(we're)\b/gi, "we're"],
];

/** Repairs high-confidence English contractions lost by on-device OCR. */
export function normalizeOCRText(text: string): string {
  let normalized = text.normalize('NFKC');
  for (const [pattern, replacement] of FUSED_CONTRACTION_PREFIXES) {
    normalized = normalized.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of COMPACT_CONTRACTIONS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}
