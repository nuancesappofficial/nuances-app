import type { AIBreakdownMode } from '@services/settings/userSettings';

export type CompletedCard = {
  word: string;
  displayWord: string;
  targetPhrase?: string;
  typoSuggestion?: string;
  typoReason?: string;
  typoDecision?: 'accepted' | 'rejected';
  partOfSpeech: string;
  definition: string;
  cultural: string;
  collocationsText: string;
  semanticRelationsText: string;
  note: string;
  phoneticTranscription?: string | null;
  sourceSentence: string;
  manualMode: boolean;
  addedToDeck: boolean;
  selectedAlbumIds?: string[];
  aiBreakdownMode?: AIBreakdownMode;
  tags?: string[];
};

export type PreviewPhase = 'frontThinking' | 'frontReveal' | 'backReveal' | 'complete';

export type PreviewRevealState = {
  showFrontWord: boolean;
  showFrontDefinition: boolean;
  showFrontSentence: boolean;
  showFrontTranslation: boolean;
  showBackCollocation: boolean;
  showBackSemanticRelations: boolean;
  showBackExample: boolean;
  showBackCultural: boolean;
  showBackNote: boolean;
};
