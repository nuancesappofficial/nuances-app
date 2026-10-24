/**
 * Generates staggered Date objects for batch creation in WatermelonDB.
 * Ensures the first selected item (index 0) receives the latest/greatest createdAt
 * timestamp, so that under `sortBy('created_at', 'desc')` and subsequent reverse
 * in the cache stack, item 0 is guaranteed to be at the visual top (`cards[cards.length - 1]`).
 */
export function buildStaggeredCreationDates(
  count: number,
  baseTime: number = Date.now(),
  stepMs: number = 10
): Date[] {
  if (count <= 0) return [];
  return Array.from(
    { length: count },
    (_, index) => new Date(baseTime + (count - index) * stepMs)
  );
}
