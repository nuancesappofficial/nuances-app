const MAIN_SCREEN_EMPTY_ALBUM_SLOT_PREFIX = '__nuances_empty_album_slot__:';

function isMainScreenEmptyAlbumSlot(slotId: string): boolean {
  return typeof slotId === 'string' && slotId.startsWith(MAIN_SCREEN_EMPTY_ALBUM_SLOT_PREFIX);
}

/**
 * Places a newly created album in the main screen album order.
 * - Places it into the first empty slot immediately following the last existing album.
 * - If no trailing empty slot exists on the page, fills any available empty slot.
 * - If no empty slot exists, appends to the end.
 */
export function placeNewAlbumInSlotOrder(
  currentOrder: string[],
  newAlbumId: string
): string[] {
  if (!currentOrder || currentOrder.length === 0) {
    return [newAlbumId];
  }

  // Find index of the last non-empty album
  let lastAlbumIndex = -1;
  for (let i = currentOrder.length - 1; i >= 0; i--) {
    if (!isMainScreenEmptyAlbumSlot(currentOrder[i])) {
      lastAlbumIndex = i;
      break;
    }
  }

  const nextOrder = [...currentOrder];

  // 1. Look for the first empty slot AFTER the last non-empty album
  for (let i = lastAlbumIndex + 1; i < nextOrder.length; i++) {
    if (isMainScreenEmptyAlbumSlot(nextOrder[i])) {
      nextOrder[i] = newAlbumId;
      return nextOrder;
    }
  }

  // 2. If none after the last album, fill any empty slot in the layout
  const firstEmptyIndex = nextOrder.findIndex((slot) =>
    isMainScreenEmptyAlbumSlot(slot)
  );
  if (firstEmptyIndex >= 0) {
    nextOrder[firstEmptyIndex] = newAlbumId;
    return nextOrder;
  }

  // 3. If no empty slots at all, append to the end
  nextOrder.push(newAlbumId);
  return nextOrder;
}
