// Card Generation Service
// Converts cached items into study cards

import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import type Card from '@database/models/Card';
import { analyzeText } from '../ai/analysis';
import { initializeSRSCard } from '../srs/scheduler';

export type CardGenerationOptions = {
  targetWord: string;
  targetPhrase?: string;
  customDefinition?: string;
};

/**
 * Generate a study card from a cached item
 */
export async function generateCardFromCachedItem(
  cachedItem: CachedItem,
  options: CardGenerationOptions
): Promise<Card> {
  try {
    const collection = database.get<Card>('cards');

    // Get AI analysis if not already done
    let definition = options.customDefinition;
    let contextualExplanation = '';

    if (!definition && cachedItem.contentText) {
      const analysis = await analyzeText(
        cachedItem.contentText,
        cachedItem.userKeywords || undefined
      );
      
      definition = `${options.targetWord}: ${analysis.suggestedContext}`;
      contextualExplanation = analysis.suggestedContext;
    }

    // Initialize SRS values
    const srsData = initializeSRSCard();

    // Create the card
    const card = await database.write(async () => {
      return await collection.create((newCard) => {
        newCard.userId = cachedItem.userId;
        newCard.cachedItemId = cachedItem.id;
        newCard.targetWord = options.targetWord;
        newCard.targetPhrase = options.targetPhrase;
        newCard.originalSentence = cachedItem.contentText || '';
        newCard.definition = definition || `Definition for ${options.targetWord}`;
        newCard.contextualExplanation = contextualExplanation;
        newCard.sourceApp = cachedItem.sourceApp;
        newCard.tags = cachedItem.aiHighlightedTerms || [];
        
        // SRS fields
        newCard.easeFactor = srsData.easeFactor;
        newCard.intervalDays = srsData.intervalDays;
        newCard.repetitions = srsData.repetitions;
        newCard.nextReviewAt = srsData.nextReviewAt;
      });
    });

    // Mark cached item as converted
    await database.write(async () => {
      await cachedItem.update((item) => {
        item.convertedToCard = true;
      });
    });

    return card;
  } catch (error) {
    console.error('Error generating card:', error);
    throw error;
  }
}

/**
 * Generate multiple cards from highlighted terms
 */
export async function generateCardsFromHighlightedTerms(
  cachedItem: CachedItem
): Promise<Card[]> {
  const terms = cachedItem.aiHighlightedTerms || [];
  const cards: Card[] = [];

  for (const term of terms) {
    try {
      const card = await generateCardFromCachedItem(cachedItem, {
        targetWord: term,
        targetPhrase: term,
      });
      cards.push(card);
    } catch (error) {
      console.error(`Failed to create card for term: ${term}`, error);
    }
  }

  return cards;
}
