const ENGLISH_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'them',
  'my', 'your', 'his', 'their', 'our', 'this', 'that', 'these', 'those',
  'and', 'or', 'but', 'if', 'so', 'for', 'to', 'of', 'in', 'on', 'at', 'by',
  'with', 'from', 'as', 'about', 'into', 'over', 'after', 'before', 'up', 'down',
  'can', 'could', 'may', 'might', 'will', 'would', 'should', 'must', 'do', 'does',
  'did', 'done', 'have', 'has', 'had', 'not', 'no', 'yes', 'just', 'very',
  'more', 'most', 'than', 'then', 'also', 'too', 'such', 'only', 'own',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
]);

function tokenizeEnglish(text: string): string[] {
  return text
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/(^[^a-z0-9]+|[^a-z0-9]+$)/gi, '').trim();
}

function scoreToken(token: string): number {
  const normalized = normalizeToken(token);
  if (!normalized) return -999;
  if (ENGLISH_STOPWORDS.has(normalized)) return -999;

  let score = 0;

  // Longer words are usually harder for learners.
  score += Math.min(6, normalized.length) * 1.2;

  // Common advanced-looking suffixes get a small boost.
  if (/(tion|sion|ment|ness|ity|ship|ture|ology|arian|ative|ence|ance|ward)$/.test(normalized)) {
    score += 2.2;
  }
  if (/(ous|ive|able|ible|ical|esque|less|ful)$/.test(normalized)) {
    score += 1.4;
  }

  // Hyphenated forms and contractions can be harder in context.
  if (normalized.includes('-') || normalized.includes("'")) {
    score += 0.8;
  }

  // Very short words are usually not worth recommending.
  if (normalized.length <= 2) {
    score -= 4;
  } else if (normalized.length === 3) {
    score -= 1.5;
  }

  return score;
}

export function recommendHardKeywords(
  text: string,
  options?: {
    count?: number;
  }
): string[] {
  const tokens = tokenizeEnglish(text);
  if (tokens.length === 0) return [];

  const count = Math.max(1, Math.min(options?.count ?? 3, tokens.length));
  const ranked = tokens
    .map((token, index) => {
      const normalized = normalizeToken(token);
      return {
        original: token,
        normalized,
        score: scoreToken(token) - index * 0.01,
      };
    })
    .filter((item) => item.normalized && item.score > -100)
    .sort((a, b) => b.score - a.score);

  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of ranked) {
    if (seen.has(item.normalized)) continue;
    seen.add(item.normalized);
    result.push(item.original);
    if (result.length >= count) break;
  }

  return result;
}
