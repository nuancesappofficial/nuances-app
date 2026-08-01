import * as Haptics from 'expo-haptics';
import { parseCardContextSections } from '../cards/cardContextSections';
import { getPreviewTypingDuration } from '../../components/UI/CacheScreenUI/CreateCardGhostPreviewSceneUI';
import type { CompletedCard, PreviewRevealState } from '../../screens/flow/CacheScreenFlow/types';

export const EMPTY_PREVIEW_REVEAL: PreviewRevealState = {
  showFrontWord: false,
  showFrontDefinition: false,
  showFrontSentence: false,
  showFrontTranslation: false,
  showBackCollocation: false,
  showBackSemanticRelations: false,
  showBackExample: false,
  showBackCultural: false,
  showBackNote: false,
};

export const COMPLETE_PREVIEW_REVEAL: PreviewRevealState = {
  showFrontWord: true,
  showFrontDefinition: true,
  showFrontSentence: true,
  showFrontTranslation: true,
  showBackCollocation: true,
  showBackSemanticRelations: true,
  showBackExample: true,
  showBackCultural: true,
  showBackNote: true,
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collocationsFromText(raw: string): Array<{ phrase: string; example: string }> {
  if (!raw.trim()) return [];
  const phrases = raw
    .split(/[\n,;]+/)
    .map((item) => item.split(/\s+[—–-]\s+/)[0]?.trim() || item.trim())
    .filter(Boolean)
    .slice(0, 4);
  return phrases.map((phrase) => ({ phrase, example: `Example: ${phrase}` }));
}

function buildSentenceTranslationText(card: CompletedCard): string {
  return parseCardContextSections({
    raw: card.cultural,
    displayWord: card.displayWord,
    definition: card.definition || 'Generating meaning...',
    sourceSentence: card.sourceSentence,
    manualMode: card.manualMode,
  }).sentenceTranslation;
}

function buildCulturalBackgroundText(card: CompletedCard): string {
  return (
    parseCardContextSections({
      raw: card.cultural,
      displayWord: card.displayWord,
      definition: card.definition,
      sourceSentence: card.sourceSentence,
      manualMode: card.manualMode,
    }).culturalBackground || 'No context generated.'
  );
}

function buildExampleSentenceText(card: CompletedCard): string {
  const structuredExample = parseCardContextSections({
    raw: card.cultural,
    displayWord: card.displayWord,
    definition: card.definition,
    sourceSentence: card.sourceSentence,
    manualMode: card.manualMode,
  }).exampleSentence;
  if (structuredExample) return structuredExample;

  const firstCollocation = collocationsFromText(card.collocationsText)[0]?.phrase || card.displayWord;
  const baseSentence = (card.sourceSentence || '').trim();
  if (!baseSentence) return `Try using "${firstCollocation}" in a sentence today.`;
  return `A natural example using "${firstCollocation}" is: "${baseSentence}"`;
}

type Params = {
  card: CompletedCard;
  runId: number;
  isCurrentRun: (runId: number) => boolean;
  setActivePreviewCard: (card: CompletedCard) => void;
  setPreviewPhase: (phase: 'frontReveal' | 'backReveal' | 'complete') => void;
  setPreviewRevealState: (updater: PreviewRevealState | ((prev: PreviewRevealState) => PreviewRevealState)) => void;
};

export async function runCardRevealSequence(params: Params): Promise<void> {
  const {
    card,
    runId,
    isCurrentRun,
    setActivePreviewCard,
    setPreviewPhase,
    setPreviewRevealState,
  } = params;

  setActivePreviewCard(card);
  setPreviewPhase('frontReveal');
  setPreviewRevealState(EMPTY_PREVIEW_REVEAL);
  await wait(160);
  if (!isCurrentRun(runId)) return;

  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  setPreviewRevealState((prev) => ({ ...prev, showFrontWord: true }));
  await wait(getPreviewTypingDuration(`${card.displayWord}${card.partOfSpeech}`));
  if (!isCurrentRun(runId)) return;

  setPreviewRevealState((prev) => ({ ...prev, showFrontDefinition: true }));
  await wait(getPreviewTypingDuration(card.definition));
  if (!isCurrentRun(runId)) return;

  setPreviewRevealState((prev) => ({ ...prev, showFrontSentence: true }));
  await wait(getPreviewTypingDuration(card.sourceSentence));
  if (!isCurrentRun(runId)) return;

  setPreviewRevealState((prev) => ({ ...prev, showFrontTranslation: true }));
  await wait(getPreviewTypingDuration(buildSentenceTranslationText(card)));
  if (!isCurrentRun(runId)) return;

  setPreviewRevealState((prev) => ({ ...prev, showBackCultural: true }));
  await wait(getPreviewTypingDuration(buildCulturalBackgroundText(card)));
  if (!isCurrentRun(runId)) return;

  setPreviewPhase('backReveal');
  await wait(260);
  if (!isCurrentRun(runId)) return;

  void Haptics.selectionAsync();
  setPreviewRevealState((prev) => ({ ...prev, showBackCollocation: true }));
  await wait(getPreviewTypingDuration(`• ${collocationsFromText(card.collocationsText)[0]?.phrase || card.displayWord}`));
  if (!isCurrentRun(runId)) return;

  setPreviewRevealState((prev) => ({ ...prev, showBackSemanticRelations: true }));
  await wait(getPreviewTypingDuration(card.semanticRelationsText));
  if (!isCurrentRun(runId)) return;

  setPreviewRevealState((prev) => ({ ...prev, showBackExample: true }));
  await wait(getPreviewTypingDuration(buildExampleSentenceText(card)));
  if (!isCurrentRun(runId)) return;

  setPreviewRevealState((prev) => ({ ...prev, showBackNote: true }));
  await wait(getPreviewTypingDuration(card.note?.trim() || 'No personal note yet.'));
  if (!isCurrentRun(runId)) return;

  setPreviewPhase('complete');
}
