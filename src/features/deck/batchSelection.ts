export const ALBUM_TAG_PREFIX = 'album:';

export function toggleCardSelection(
  selectedIds: Set<string>,
  cardId: string
): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(cardId)) {
    next.delete(cardId);
  } else {
    next.add(cardId);
  }
  return next;
}

export function selectAllCards(cardIds: string[]): Set<string> {
  return new Set(cardIds);
}

export function deselectAllCards(): Set<string> {
  return new Set<string>();
}

export function isAllSelected(
  selectedIds: Set<string>,
  allCardIds: string[]
): boolean {
  if (!allCardIds.length) return false;
  return allCardIds.every((id) => selectedIds.has(id));
}

export function filterCardsAfterBatchDelete<T extends { id: string }>(
  cards: T[],
  deletedIds: Set<string>
): T[] {
  return cards.filter((card) => !deletedIds.has(card.id));
}

export function calculateAlbumTagsForBatchMove(
  currentTags: string[] | undefined | null,
  targetAlbumId: string,
  removeSourceAlbumId?: string
): string[] {
  const targetTag = `${ALBUM_TAG_PREFIX}${targetAlbumId}`;
  const removeTag = removeSourceAlbumId
    ? `${ALBUM_TAG_PREFIX}${removeSourceAlbumId}`
    : null;

  const safeTags = Array.isArray(currentTags) ? currentTags : [];
  const preserved = safeTags.filter((tag) => {
    if (removeTag && tag === removeTag) return false;
    return true;
  });

  if (!preserved.includes(targetTag)) {
    preserved.push(targetTag);
  }

  return Array.from(new Set(preserved));
}
