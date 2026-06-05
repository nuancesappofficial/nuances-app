export type CompletedCard = {
  word: string;
  displayWord: string;
  targetPhrase?: string;
  partOfSpeech: string;
  definition: string;
  cultural: string;
  collocationsText: string;
  note: string;
  phoneticTranscription?: string | null;
  sourceSentence: string;
  manualMode: boolean;
  addedToDeck: boolean;
  selectedAlbumIds?: string[];
};

export type PreviewPhase = 'frontThinking' | 'frontReveal' | 'backReveal' | 'complete';

export type PreviewRevealState = {
  showFrontWord: boolean;
  showFrontDefinition: boolean;
  showFrontSentence: boolean;
  showFrontTranslation: boolean;
  showBackCollocation: boolean;
  showBackExample: boolean;
  showBackCultural: boolean;
  showBackNote: boolean;
};
