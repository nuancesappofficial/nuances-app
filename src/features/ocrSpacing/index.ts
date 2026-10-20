import {
  ENGLISH_PROPER_NOUNS_FRONT_CODED,
  ENGLISH_WORDS_FRONT_CODED,
} from './englishWords.generated';
import {
  decodeEnglishLexicon,
  decodeEnglishLexiconAsync,
  restoreOCRSpacing,
  type EnglishLexicon,
} from './ocrSpacing';

let lexicon: EnglishLexicon | null = null;
let pendingLexicon: Promise<EnglishLexicon> | null = null;

/**
 * Starts decoding the word list in small steps so the JS thread stays free.
 * Call it before awaiting native OCR: the decode then overlaps with OCR.
 */
export function prewarmEnglishLexicon(): Promise<EnglishLexicon> {
  if (lexicon) return Promise.resolve(lexicon);
  if (!pendingLexicon) {
    pendingLexicon = decodeEnglishLexiconAsync(
      ENGLISH_WORDS_FRONT_CODED,
      ENGLISH_PROPER_NOUNS_FRONT_CODED
    )
      .then((decoded) => {
        lexicon = decoded;
        return decoded;
      })
      .catch((error) => {
        pendingLexicon = null;
        throw error;
      });
  }
  return pendingLexicon;
}

function getEnglishLexicon(): EnglishLexicon {
  if (!lexicon) {
    lexicon = decodeEnglishLexicon(
      ENGLISH_WORDS_FRONT_CODED,
      ENGLISH_PROPER_NOUNS_FRONT_CODED
    );
  }
  return lexicon;
}

/**
 * Silently restores spaces OCR dropped between English words
 * ("you were anatural" → "you were a natural"). `candidateTexts` are the
 * alternative OCR readings; a spaced reading there wins over the dictionary.
 */
export function restoreOCRTextSpacing(
  text: string,
  candidateTexts: readonly string[] = []
): string {
  return restoreOCRSpacing(text, getEnglishLexicon(), candidateTexts);
}
