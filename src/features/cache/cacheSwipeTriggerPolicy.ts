export interface SwipeTrigger {
  seq: number;
  itemId: string;
  direction: 'left' | 'right';
}

export interface ShouldTriggerCardSwipeParams {
  isTopCard: boolean;
  cardItemId: string;
  swipeTrigger: SwipeTrigger | null;
  lastSwipeTriggerSeq: number | null;
}

/**
 * Evaluates whether a programmatic swipe trigger should fire on a cache card.
 * Prevents phantom repeat swipes on remounted or restored cards by ensuring
 * that any trigger matching the last processed sequence is strictly rejected.
 */
export function shouldTriggerCardSwipe(params: ShouldTriggerCardSwipeParams): boolean {
  const { isTopCard, cardItemId, swipeTrigger, lastSwipeTriggerSeq } = params;
  if (!isTopCard || !swipeTrigger) return false;
  if (swipeTrigger.itemId !== cardItemId) return false;
  if (lastSwipeTriggerSeq !== null && lastSwipeTriggerSeq === swipeTrigger.seq) return false;
  return true;
}
