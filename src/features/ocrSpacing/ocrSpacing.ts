/**
 * Restores spaces that OCR dropped between English words
 * ("I thought you were anatural." → "I thought you were a natural.").
 *
 * Rule: a token is only split when it is NOT a known word AND every piece is a
 * known word. Real words ("notable", "therapist") and coinages that do not
 * break into real words ("rizz", "delulu") are left untouched; the AI still
 * decides what a word means from its sentence.
 *
 * Pure and dependency-free so the exact same file runs in the app and in the
 * ai-proxy Edge Function:
 *   - src/features/ocrSpacing/ocrSpacing.ts                      (canonical)
 *   - supabase/functions/ai-proxy/_shared/ocrSpacing/ocrSpacing.ts (copy)
 * Edit the canonical file, then copy it (and englishWords.generated.ts) over;
 * ocrSpacing.test.mjs fails if the copies drift apart.
 */

export type EnglishLexicon = {
  /** Every recognised word: dictionary words, proper nouns, EXTRA_KNOWN_WORDS. */
  known: ReadonlySet<string>;
  /** Ordinary lowercase dictionary words a run-together token may split into. */
  pieces: ReadonlySet<string>;
};

/**
 * Real words the dictionary list misses (brands, internet vocabulary).
 * Treated as known so they are never split ("youtube" must not become
 * "you tube"). Lowercase only.
 */
export const EXTRA_KNOWN_WORDS: readonly string[] = [
  'airbnb', 'airpods', 'alexa', 'anime', 'apps', 'bestie', 'bitcoin', 'blockchain',
  'chatbot', 'chatgpt', 'clickbait', 'cringe', 'crypto', 'delulu', 'deepfake',
  'doomscroll', 'doomscrolling', 'dropbox', 'emojis', 'facebook', 'facetime',
  'fanbase', 'fandom', 'gaslight', 'gaslighting', 'gameplay', 'github',
  'gmail', 'hashtags', 'influencer', 'influencers', 'instagram', 'iphone',
  'iphones', 'ipad', 'ipads', 'linkedin', 'livestream', 'livestreams',
  'livestreaming', 'lockdown', 'lockdowns', 'lowkey', 'highkey', 'mansplain', 'mansplaining', 'memes',
  'microsoft', 'netflix', 'nintendo', 'onboarding', 'offboarding', 'paywall', 'photobomb', 'playlist',
  'playlists', 'podcasts', 'reddit', 'retweet', 'rizz', 'screenshot',
  'screenshots', 'selfies', 'situationship', 'skibidi', 'smartwatch',
  'snapchat', 'spotify', 'startup', 'startups', 'streamer', 'streamers',
  'subreddit', 'textbook', 'tiktok', 'tiktoks', 'touchscreen', 'tweet',
  'tweets', 'unfollow', 'unfollowed', 'upskill', 'upskilling', 'upvote', 'upvoted', 'vlog', 'vlogs',
  'vlogger', 'vloggers', 'vlogging', 'wannabe', 'webinar', 'whatsapp',
  'wifi', 'wikipedia', 'yeet', 'youtube', 'youtuber', 'youtubers', 'zoomer',
];

/**
 * One- and two-letter pieces allowed in a split. The dictionary also contains
 * letters and abbreviations ("b", "et", "ye") that would cause junk splits.
 */
const SHORT_PIECES = new Set([
  'a', 'i', 'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'hi', 'if',
  'in', 'is', 'it', 'me', 'my', 'no', 'of', 'oh', 'ok', 'on', 'or', 'so',
  'to', 'up', 'us', 'we',
]);

/** Pieces that are never the word a learner is studying. */
const FUNCTION_WORDS = new Set([
  ...SHORT_PIECES,
  'and', 'are', 'but', 'can', 'for', 'from', 'had', 'has', 'have', 'her',
  'his', 'its', 'not', 'our', 'she', 'that', 'the', 'their', 'them', 'they',
  'this', 'was', 'were', 'will', 'with', 'you', 'your',
]);

const MIN_TOKEN_LENGTH = 5;
const MAX_TOKEN_LENGTH = 24;
const MAX_PIECES = 3;

/** Decodes one front-coded list into `into`, pausing every `entriesPerStep`. */
function* decodeFrontCodedSteps(
  frontCoded: string,
  into: Set<string>,
  entriesPerStep: number
): Generator<void, void, void> {
  let previous = '';
  let entryStart = -1;
  let sharedLength = 0;
  let entriesThisStep = 0;
  for (let index = 0; index <= frontCoded.length; index += 1) {
    const code = index < frontCoded.length ? frontCoded.charCodeAt(index) : 0;
    if (code >= 97 && code <= 122) continue; // a-z: still inside this entry
    if (entryStart >= 0) {
      const word = previous.slice(0, sharedLength) + frontCoded.slice(entryStart, index);
      into.add(word);
      previous = word;
      entriesThisStep += 1;
      if (entriesThisStep >= entriesPerStep) {
        entriesThisStep = 0;
        yield;
      }
    }
    sharedLength = code - 48;
    entryStart = index + 1;
  }
}

function* decodeEnglishLexiconSteps(
  wordsFrontCoded: string,
  properNounsFrontCoded: string,
  extraWords: readonly string[],
  entriesPerStep: number,
  out: { lexicon?: EnglishLexicon }
): Generator<void, void, void> {
  const pieces = new Set<string>();
  yield* decodeFrontCodedSteps(wordsFrontCoded, pieces, entriesPerStep);
  const known = new Set<string>(pieces);
  yield* decodeFrontCodedSteps(properNounsFrontCoded, known, entriesPerStep);
  for (const word of extraWords) known.add(word);
  out.lexicon = { known, pieces };
}

/**
 * Builds the lexicon from the front-coded lists in englishWords.generated.ts.
 * ~128k words, roughly 50-150 ms, so callers cache the result. Prefer
 * decodeEnglishLexiconAsync on the JS thread of the app.
 */
export function decodeEnglishLexicon(
  wordsFrontCoded: string,
  properNounsFrontCoded: string,
  extraWords: readonly string[] = EXTRA_KNOWN_WORDS
): EnglishLexicon {
  const out: { lexicon?: EnglishLexicon } = {};
  const steps = decodeEnglishLexiconSteps(
    wordsFrontCoded,
    properNounsFrontCoded,
    extraWords,
    Number.MAX_SAFE_INTEGER,
    out
  );
  while (!steps.next().done) {
    // run to completion
  }
  return out.lexicon as EnglishLexicon;
}

/**
 * Same as decodeEnglishLexicon, but yields to the event loop every
 * `entriesPerStep` words so the UI never stalls while it decodes.
 */
export async function decodeEnglishLexiconAsync(
  wordsFrontCoded: string,
  properNounsFrontCoded: string,
  options: {
    extraWords?: readonly string[];
    entriesPerStep?: number;
    yieldToEventLoop?: () => Promise<void>;
  } = {}
): Promise<EnglishLexicon> {
  const yieldToEventLoop =
    options.yieldToEventLoop || (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const out: { lexicon?: EnglishLexicon } = {};
  const steps = decodeEnglishLexiconSteps(
    wordsFrontCoded,
    properNounsFrontCoded,
    options.extraWords || EXTRA_KNOWN_WORDS,
    options.entriesPerStep || 8000,
    out
  );
  while (!steps.next().done) {
    await yieldToEventLoop();
  }
  return out.lexicon as EnglishLexicon;
}

function isUsablePiece(piece: string, lexicon: EnglishLexicon): boolean {
  if (piece.length <= 2) return SHORT_PIECES.has(piece);
  return lexicon.pieces.has(piece);
}

/** Lowercase, or Capitalized; never ALLCAPS or MixedCase (acronyms, brands). */
function splittableCase(token: string): 'lower' | 'capitalized' | null {
  if (/^[a-z]+$/.test(token)) return 'lower';
  if (/^[A-Z][a-z]+$/.test(token)) return 'capitalized';
  return null;
}

function applyCase(pieces: string[], tokenCase: 'lower' | 'capitalized'): string[] {
  return pieces.map((piece, index) => {
    if (piece === 'i') return 'I';
    if (index === 0 && tokenCase === 'capitalized') {
      return piece.charAt(0).toUpperCase() + piece.slice(1);
    }
    return piece;
  });
}

/**
 * Longer pieces win ("a natural" over "an atural"), and function words get a
 * bonus so "it was" beats "I twas" and "for the" beats "fort he".
 */
function scorePiece(piece: string): number {
  return piece.length * piece.length + (FUNCTION_WORDS.has(piece) ? 10 : 0);
}

/**
 * Returns the pieces when `token` is not a known word but splits into known
 * words, at least one of them a function word ("anatural" → ["a", "natural"]);
 * otherwise null. Lowercase tokens only. Prefers the fewest pieces, then the best scorePiece total.
 */
export function splitRunTogetherWord(
  token: string,
  lexicon: EnglishLexicon
): string[] | null {
  // Capitalized unknown tokens are usually names ("Adidas", "Zendaya"), so
  // only all-lowercase tokens are split from the dictionary alone.
  if (splittableCase(token) !== 'lower') return null;
  const tokenCase = 'lower';
  const lower = token.toLowerCase();
  if (lower.length < MIN_TOKEN_LENGTH || lower.length > MAX_TOKEN_LENGTH) return null;
  if (lexicon.known.has(lower)) return null;

  type Split = { pieces: string[]; score: number };
  const best: Array<Split | null> = new Array(lower.length + 1).fill(null);
  best[0] = { pieces: [], score: 0 };
  for (let end = 1; end <= lower.length; end += 1) {
    for (let start = 0; start < end; start += 1) {
      const head = best[start];
      if (!head || head.pieces.length >= MAX_PIECES) continue;
      const piece = lower.slice(start, end);
      if (!isUsablePiece(piece, lexicon)) continue;
      const candidate: Split = {
        pieces: [...head.pieces, piece],
        score: head.score + scorePiece(piece),
      };
      const current = best[end];
      if (
        !current ||
        candidate.pieces.length < current.pieces.length ||
        (candidate.pieces.length === current.pieces.length && candidate.score > current.score)
      ) {
        best[end] = candidate;
      }
    }
  }
  const result = best[lower.length];
  if (!result || result.pieces.length < 2) return null;
  // OCR mostly drops the narrow space next to a short function word
  // ("anatural", "ofthe"). Without one, an unknown token is far more likely a
  // new word than two glued words ("staycation", "goated"), so leave it.
  const functionPieceCount = result.pieces.filter((piece) => FUNCTION_WORDS.has(piece)).length;
  if (functionPieceCount === 0) return null;
  // Three pieces need two function words ("iwasthere"); otherwise junk splits
  // like "abbe villi an" slip through.
  if (result.pieces.length === 3 && functionPieceCount < 2) return null;
  // Dropped-g slang: "chillin", "bussin" are not "chill in", "buss in".
  if (lower.endsWith('in') && lexicon.known.has(`${lower}g`)) return null;
  return applyCase(result.pieces, tokenCase);
}

/**
 * Spaced readings found in alternative OCR candidates, keyed by the token
 * they would replace: "you were a natural" → { anatural: ["a", "natural"] }.
 */
function collectCandidateSpacings(
  candidateTexts: readonly string[],
  lexicon: EnglishLexicon
): Map<string, string[]> {
  const spacings = new Map<string, string[]>();
  for (const text of candidateTexts) {
    const tokens = (text || '').match(/[A-Za-z]+/g) || [];
    for (let size = 2; size <= MAX_PIECES; size += 1) {
      for (let start = 0; start + size <= tokens.length; start += 1) {
        const pieces = tokens.slice(start, start + size).map((t) => t.toLowerCase());
        const compact = pieces.join('');
        if (compact.length < MIN_TOKEN_LENGTH || spacings.has(compact)) continue;
        if (!pieces.every((piece) => isUsablePiece(piece, lexicon))) continue;
        spacings.set(compact, pieces);
      }
    }
  }
  return spacings;
}

/**
 * A "chunk" is a run that may contain word-internal punctuation, so URLs,
 * emails, handles, hashtags, contractions and hyphenated words are matched
 * whole and skipped. A trailing sentence period is not part of a chunk.
 */
const CHUNK_PATTERN = /[A-Za-z0-9'’@#_/\\-]+(?:\.[A-Za-z0-9]+)*/g;

/**
 * Restores dropped spaces in OCR text. Evidence from alternative OCR
 * candidates wins; otherwise the dictionary split is used. Known words are
 * never touched.
 */
export function restoreOCRSpacing(
  text: string,
  lexicon: EnglishLexicon,
  candidateTexts: readonly string[] = []
): string {
  if (!text) return text;
  const candidateSpacings = collectCandidateSpacings(candidateTexts, lexicon);
  return text.replace(CHUNK_PATTERN, (chunk) => {
    const tokenCase = splittableCase(chunk);
    if (!tokenCase) return chunk;
    const lower = chunk.toLowerCase();
    if (lower.length < MIN_TOKEN_LENGTH || lexicon.known.has(lower)) return chunk;
    const fromCandidates = candidateSpacings.get(lower);
    const pieces = fromCandidates
      ? applyCase(fromCandidates, tokenCase)
      : splitRunTogetherWord(chunk, lexicon);
    return pieces ? pieces.join(' ') : chunk;
  });
}

export type RestoredCardTarget = {
  /** The word to study: the one content word, or the spaced phrase. */
  targetWord: string;
  /** The source sentence with the run-together token spaced out. */
  sentence: string;
};

/**
 * Server-side safety net for an unknown single-token target whose sentence
 * still contains the run-together OCR token (e.g. from older app versions):
 * "anatural" in "you were anatural." → target "natural", sentence
 * "you were a natural.". Returns null when nothing should change.
 */
export function restoreRunTogetherCardTarget(
  targetWord: string,
  sentence: string,
  lexicon: EnglishLexicon
): RestoredCardTarget | null {
  const trimmed = (targetWord || '').trim();
  const pieces = splitRunTogetherWord(trimmed, lexicon);
  if (!pieces) return null;
  const lowerPieces = pieces.map((piece) => piece.toLowerCase());
  const contentPieces = pieces.filter(
    (_piece, index) => !FUNCTION_WORDS.has(lowerPieces[index])
  );
  const nextTarget =
    contentPieces.length === 1 ? contentPieces[0] : lowerPieces.join(' ');
  const lowerTarget = trimmed.toLowerCase();
  const nextSentence = (sentence || '').replace(CHUNK_PATTERN, (chunk) => {
    if (chunk.toLowerCase() !== lowerTarget) return chunk;
    return splitRunTogetherWord(chunk, lexicon)?.join(' ') || chunk;
  });
  return { targetWord: nextTarget, sentence: nextSentence };
}
