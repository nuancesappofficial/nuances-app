export interface CacheTransitionState {
  visibleCardIds: string[];
  enteringCardIds: string[];
  lastSeenCardIds: string[];
  pendingBatchEnterIds: string[];
  hasSeenCacheOnce: boolean;
  animationSeed: number;
  restoreSeed: number;
}

export interface ResolveCacheCardTransitionInput {
  currentIds: string[];
  state: CacheTransitionState;
  isCacheFocused: boolean;
  showAddModal: boolean;
}

export interface CacheTransitionResult {
  nextVisibleCardIds: string[];
  nextEnteringCardIds: string[];
  nextLastSeenCardIds: string[];
  nextPendingBatchEnterIds: string[];
  nextHasSeenCacheOnce: boolean;
  nextAnimationSeed: number;
  nextRestoreSeed: number;
  transitionType: 'noop' | 'batch_ready' | 'initial_load' | 'new_cards_enter' | 'restore';
}

export function areIdListsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function makeNoopResult(
  state: CacheTransitionState,
  overrideLastSeen?: string[]
): CacheTransitionResult {
  return {
    nextVisibleCardIds: state.visibleCardIds,
    nextEnteringCardIds: state.enteringCardIds,
    nextLastSeenCardIds: overrideLastSeen ?? state.lastSeenCardIds,
    nextPendingBatchEnterIds: state.pendingBatchEnterIds,
    nextHasSeenCacheOnce: state.hasSeenCacheOnce,
    nextAnimationSeed: state.animationSeed,
    nextRestoreSeed: state.restoreSeed,
    transitionType: 'noop',
  };
}

/**
 * Resolved transition logic:
 * Ensures all new cards arriving (whether singly or in multi-card share sheet batches,
 * or even while a previous entrance is still active) are preserved in enteringCardIds
 * and given full entrance animation without being swallowed or prematurely popped into the stack.
 */
export function resolveCacheCardTransition(
  input: ResolveCacheCardTransitionInput
): CacheTransitionResult {
  const { currentIds, state, isCacheFocused, showAddModal } = input;
  const {
    visibleCardIds,
    enteringCardIds,
    lastSeenCardIds,
    pendingBatchEnterIds,
    hasSeenCacheOnce,
    animationSeed,
    restoreSeed,
  } = state;

  if (!isCacheFocused) {
    return makeNoopResult(state);
  }

  // If cards are currently in batch quick-add flow:
  if (pendingBatchEnterIds.length > 0) {
    if (showAddModal) {
      return makeNoopResult(state);
    }

    const readyIds = pendingBatchEnterIds.filter((id) => currentIds.includes(id));
    if (readyIds.length !== pendingBatchEnterIds.length) {
      return makeNoopResult(state);
    }

    return {
      nextVisibleCardIds: currentIds,
      nextEnteringCardIds: readyIds,
      nextLastSeenCardIds: currentIds,
      nextPendingBatchEnterIds: [],
      nextHasSeenCacheOnce: true,
      nextAnimationSeed: animationSeed + 1,
      nextRestoreSeed: restoreSeed,
      transitionType: 'batch_ready',
    };
  }

  // Initial load when cache screen is opened:
  if (!hasSeenCacheOnce) {
    if (currentIds.length > 0) {
      return {
        nextVisibleCardIds: currentIds,
        nextEnteringCardIds: currentIds,
        nextLastSeenCardIds: currentIds,
        nextPendingBatchEnterIds: pendingBatchEnterIds,
        nextHasSeenCacheOnce: true,
        nextAnimationSeed: animationSeed + 1,
        nextRestoreSeed: restoreSeed,
        transitionType: 'initial_load',
      };
    }
    return {
      nextVisibleCardIds: [],
      nextEnteringCardIds: [],
      nextLastSeenCardIds: currentIds,
      nextPendingBatchEnterIds: pendingBatchEnterIds,
      nextHasSeenCacheOnce: true,
      nextAnimationSeed: animationSeed,
      nextRestoreSeed: restoreSeed,
      transitionType: 'initial_load',
    };
  }

  const seenSet = new Set(lastSeenCardIds);
  const newlyAdded = currentIds.filter((id) => !seenSet.has(id));

  // If there are new cards:
  if (newlyAdded.length > 0) {
    if (showAddModal) {
      return makeNoopResult(state);
    }

    // Merge any currently entering cards with the newly arrived cards:
    const combinedEnteringIds = Array.from(new Set([...enteringCardIds, ...newlyAdded]));

    return {
      nextVisibleCardIds: currentIds,
      nextEnteringCardIds: combinedEnteringIds,
      nextLastSeenCardIds: currentIds,
      nextPendingBatchEnterIds: pendingBatchEnterIds,
      nextHasSeenCacheOnce: true,
      nextAnimationSeed: animationSeed + 1,
      nextRestoreSeed: restoreSeed,
      transitionType: 'new_cards_enter',
    };
  }

  // If an entrance animation is still actively in flight and no new cards were added
  // (e.g. background OCR text update triggered re-render):
  // DO NOT trigger restore or mutate enteringCardIds!
  if (enteringCardIds.length > 0) {
    return makeNoopResult(state, currentIds);
  }

  // Steady-state: stack cards and visible cards are already identical to current cards.
  // Must return noop to prevent infinite setState re-render loops.
  const isCurrentEqualLastSeen = areIdListsEqual(currentIds, lastSeenCardIds);
  const isVisibleEqualCurrent = areIdListsEqual(visibleCardIds, currentIds);

  if (isCurrentEqualLastSeen && isVisibleEqualCurrent) {
    return makeNoopResult(state);
  }

  // Card swipe restore: triggered only when cards were removed or stack order changed:
  return {
    nextVisibleCardIds: currentIds,
    nextEnteringCardIds: enteringCardIds,
    nextLastSeenCardIds: currentIds,
    nextPendingBatchEnterIds: pendingBatchEnterIds,
    nextHasSeenCacheOnce: hasSeenCacheOnce,
    nextAnimationSeed: animationSeed,
    nextRestoreSeed: restoreSeed + 1,
    transitionType: 'restore',
  };
}
