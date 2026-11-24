// Dependency-free so it can be unit-tested in plain Node.

const STEP_MS = 10;

export type SharedBatchEntry = { kind: 'text' | 'image'; value: string };
export type PlannedSharedItem = SharedBatchEntry & { createdAt: Date };

/**
 * Plans the cache rows for one share-sheet batch, in the order the user shared
 * them (text and images interleaved). The 1st entry gets the newest created_at
 * so it sits on top of the cache stack; entries that already exist are dropped
 * before timestamps are assigned, so the rest keep a gapless order.
 */
export function planSharedBatchCreation(
  entries: readonly SharedBatchEntry[],
  options: {
    existingTexts: ReadonlySet<string>;
    existingImageUris: ReadonlySet<string>;
    baseTime?: number;
  }
): PlannedSharedItem[] {
  const fresh = entries.filter((entry) =>
    entry.kind === 'text'
      ? !options.existingTexts.has(entry.value)
      : !options.existingImageUris.has(entry.value)
  );
  const base = options.baseTime ?? Date.now();
  // Same rule as buildStaggeredCreationDates: index 0 is the newest.
  return fresh.map((entry, index) => ({
    ...entry,
    createdAt: new Date(base + (fresh.length - index) * STEP_MS),
  }));
}
