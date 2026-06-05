import type { CompletedCard } from '../../screens/flow/CacheScreenFlow/types';
import { normalizeDisplayWord } from './textTransforms';

export const TOUR_TARGET_WORD = 'wing';

export function buildManualCardDraft(word: string, phoneticTranscription?: string | null): CompletedCard {
  return {
    word,
    displayWord: normalizeDisplayWord(word) || word,
    targetPhrase: undefined,
    partOfSpeech: '',
    definition: '',
    cultural: '',
    collocationsText: '',
    note: '',
    phoneticTranscription: phoneticTranscription || null,
    sourceSentence: word,
    manualMode: true,
    addedToDeck: true,
    selectedAlbumIds: [],
  };
}

export function buildTourSampleCard(sourceSentence: string): CompletedCard {
  const sentence = sourceSentence.trim() || 'I had to wing it during the presentation.';
  return {
    word: TOUR_TARGET_WORD,
    displayWord: 'wing it',
    targetPhrase: 'wing it',
    partOfSpeech: 'phrase',
    definition: '即興應付；臨場發揮',
    cultural:
      'Sentence translation:\n“I had to 「wing it」 during the presentation.”\n我在簡報時只好「臨場發揮」。\n\nContext:\nIt fits because the speaker had to handle the presentation without full preparation.',
    collocationsText: 'wing it during a presentation, wing it in a meeting',
    note: '',
    phoneticTranscription: '/wɪŋ ɪt/',
    sourceSentence: sentence,
    manualMode: false,
    addedToDeck: true,
    selectedAlbumIds: [],
  };
}
