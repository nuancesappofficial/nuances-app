export type OptimisticCardIdentitySource = {
  displayWord: string;
  sourceSentence: string;
};

export function getOptimisticCardIdentity(
  card: OptimisticCardIdentitySource
): string {
  return JSON.stringify([card.displayWord.trim(), card.sourceSentence.trim()]);
}

export function claimUnsavedCards<T extends OptimisticCardIdentitySource>(
  cards: readonly T[],
  claimedIdentities: Set<string>
): T[] {
  const claimedCards: T[] = [];
  for (const card of cards) {
    const identity = getOptimisticCardIdentity(card);
    if (claimedIdentities.has(identity)) continue;
    claimedIdentities.add(identity);
    claimedCards.push(card);
  }
  return claimedCards;
}
