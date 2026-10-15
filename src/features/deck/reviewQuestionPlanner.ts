import type { ReviewQuestionType } from './reviewPreferences';

export interface QuestionPlanItem {
  cardId: string;
  questionType: ReviewQuestionType;
  questionId: string;
}

export interface ReviewQuestionPlan {
  items: QuestionPlanItem[];
  isClamped: boolean;
  maxAvailable: number;
}

export interface PlanReviewQuestionsOptions<T extends { id: string }> {
  cards: T[];
  questionCount: number;
  selectedQuestionTypes: ReviewQuestionType[];
  pinnedCardIds?: string[];
  skippedPronunciationCardIds?: string[];
  canBuildQuestionType?: (card: T, type: ReviewQuestionType) => boolean;
  randomFn?: () => number;
}

function interleaveCards(items: QuestionPlanItem[]): QuestionPlanItem[] {
  if (items.length <= 2) return items;

  // Group by cardId
  const buckets = new Map<string, QuestionPlanItem[]>();
  for (const item of items) {
    const list = buckets.get(item.cardId) || [];
    list.push(item);
    buckets.set(item.cardId, list);
  }

  // If every card only has 1 question, no risk of consecutive duplicates from multi-round
  const maxBucketSize = Math.max(...Array.from(buckets.values()).map((b) => b.length));
  if (maxBucketSize <= 1) return items;

  // Sort groups by count descending
  const sortedGroups = Array.from(buckets.values()).sort((a, b) => b.length - a.length);

  const result: QuestionPlanItem[] = [];
  const currentPointers = new Array(sortedGroups.length).fill(0);
  let totalAdded = 0;
  let lastCardId: string | null = null;

  while (totalAdded < items.length) {
    // Find next group that has items remaining and whose cardId != lastCardId
    let chosenGroupIndex = -1;
    for (let i = 0; i < sortedGroups.length; i++) {
      if (currentPointers[i] < sortedGroups[i].length) {
        if (sortedGroups[i][0].cardId !== lastCardId) {
          chosenGroupIndex = i;
          break;
        }
      }
    }

    // If all available remaining cards match lastCardId (forced adjacent), pick the one with most items remaining
    if (chosenGroupIndex === -1) {
      for (let i = 0; i < sortedGroups.length; i++) {
        if (currentPointers[i] < sortedGroups[i].length) {
          chosenGroupIndex = i;
          break;
        }
      }
    }

    if (chosenGroupIndex === -1) break;

    const item = sortedGroups[chosenGroupIndex][currentPointers[chosenGroupIndex]];
    result.push(item);
    currentPointers[chosenGroupIndex]++;
    totalAdded++;
    lastCardId = item.cardId;
  }

  return result;
}

export function planReviewQuestions<T extends { id: string }>({
  cards,
  questionCount,
  selectedQuestionTypes,
  pinnedCardIds = [],
  skippedPronunciationCardIds = [],
  canBuildQuestionType = () => true,
  randomFn = Math.random,
}: PlanReviewQuestionsOptions<T>): ReviewQuestionPlan {
  if (!cards || cards.length === 0 || questionCount <= 0 || selectedQuestionTypes.length === 0) {
    return {
      items: [],
      isClamped: false,
      maxAvailable: 0,
    };
  }

  const validTypesByCard = new Map<string, ReviewQuestionType[]>();
  const eligibleCards: T[] = [];

  for (const card of cards) {
    const validTypes = selectedQuestionTypes.filter((type) => canBuildQuestionType(card, type));
    if (validTypes.length > 0) {
      validTypesByCard.set(card.id, validTypes);
      eligibleCards.push(card);
    }
  }

  const maxAvailable = Array.from(validTypesByCard.values()).reduce(
    (sum, types) => sum + types.length,
    0
  );

  if (maxAvailable === 0) {
    return {
      items: [],
      isClamped: false,
      maxAvailable: 0,
    };
  }

  const targetCount = Math.min(questionCount, maxAvailable);
  const isClamped = questionCount > maxAvailable;

  const cardMap = new Map(eligibleCards.map((c) => [c.id, c]));
  const skippedPronunciationSet = new Set(
    skippedPronunciationCardIds.filter((id) => {
      const types = validTypesByCard.get(id);
      return types && types.includes('pronunciation');
    })
  );

  const pinnedSet = new Set(
    pinnedCardIds.filter((id) => cardMap.has(id) && !skippedPronunciationSet.has(id))
  );

  const skippedList = Array.from(skippedPronunciationSet).map((id) => cardMap.get(id)!);
  const pinnedList = Array.from(pinnedSet).map((id) => cardMap.get(id)!);
  const otherList = eligibleCards.filter(
    (c) => !skippedPronunciationSet.has(c.id) && !pinnedSet.has(c.id)
  );

  const cardOrdering = [...skippedList, ...pinnedList, ...otherList];
  const usedTypesByCard = new Map<string, Set<ReviewQuestionType>>();
  eligibleCards.forEach((c) => usedTypesByCard.set(c.id, new Set()));

  const items: QuestionPlanItem[] = [];

  // Round 0: Assign 1 question per card
  for (let i = 0; i < cardOrdering.length; i++) {
    if (items.length >= targetCount) break;
    const card = cardOrdering[i];
    const availableTypes = validTypesByCard.get(card.id) || [];
    const used = usedTypesByCard.get(card.id)!;

    let chosenType: ReviewQuestionType | null = null;
    if (skippedPronunciationSet.has(card.id)) {
      chosenType = 'pronunciation';
    } else {
      // Pick next available type
      const candidates = availableTypes.filter((t) => !used.has(t));
      if (candidates.length > 0) {
        // Distribute types evenly using index
        chosenType = candidates[i % candidates.length];
      }
    }

    if (chosenType) {
      used.add(chosenType);
      items.push({
        cardId: card.id,
        questionType: chosenType,
        questionId: `${card.id}:${chosenType}`,
      });
    }
  }

  // Guarantee pronunciation in Round 0 if pronunciation is selected and no skipped pronunciation card was present
  if (
    selectedQuestionTypes.includes('pronunciation') &&
    skippedPronunciationSet.size === 0 &&
    items.length > 0 &&
    !items.some((item) => item.questionType === 'pronunciation')
  ) {
    // Find a card that supports pronunciation and swap its type if possible
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const validTypes = validTypesByCard.get(item.cardId) || [];
      if (validTypes.includes('pronunciation')) {
        const used = usedTypesByCard.get(item.cardId)!;
        used.delete(item.questionType);
        used.add('pronunciation');
        item.questionType = 'pronunciation';
        item.questionId = `${item.cardId}:pronunciation`;
        break;
      }
    }
  }

  // Subsequent rounds: If targetCount not reached, assign additional distinct question types to cards
  while (items.length < targetCount) {
    let addedInThisRound = 0;
    for (const card of cardOrdering) {
      if (items.length >= targetCount) break;
      const availableTypes = validTypesByCard.get(card.id) || [];
      const used = usedTypesByCard.get(card.id)!;
      const remainingTypes = availableTypes.filter((t) => !used.has(t));

      if (remainingTypes.length > 0) {
        const chosenType = remainingTypes[0];
        used.add(chosenType);
        items.push({
          cardId: card.id,
          questionType: chosenType,
          questionId: `${card.id}:${chosenType}`,
        });
        addedInThisRound++;
      }
    }
    // Safety exit if no more types can be added
    if (addedInThisRound === 0) break;
  }

  // Interleave to avoid consecutive identical cards
  const spacedItems = interleaveCards(items);

  return {
    items: spacedItems,
    isClamped,
    maxAvailable,
  };
}
