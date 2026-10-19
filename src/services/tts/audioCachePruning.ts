export type AudioCacheEntry = {
  key: string;
  filename: string;
  byteSize: number;
  playCount: number;
  lastAccessedAt: number;
};

export const DEFAULT_MAX_CACHE_ENTRIES = 1000;
export const DEFAULT_MAX_CACHE_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * Sort entries by LFU (playCount ascending), then LRU (lastAccessedAt ascending).
 * Lowest priority items appear first (candidates for eviction).
 */
export function sortEntriesByLfuLru(entries: readonly AudioCacheEntry[]): AudioCacheEntry[] {
  return [...entries].sort((a, b) => {
    if (a.playCount !== b.playCount) {
      return a.playCount - b.playCount;
    }
    return a.lastAccessedAt - b.lastAccessedAt;
  });
}

/**
 * Pure pruning function that returns retained and evicted entries.
 */
export function pruneAudioCacheEntries(
  entries: readonly AudioCacheEntry[],
  options?: {
    maxEntries?: number;
    maxBytes?: number;
  }
): {
  retained: AudioCacheEntry[];
  evicted: AudioCacheEntry[];
} {
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_CACHE_BYTES;

  const totalBytes = entries.reduce((sum, e) => sum + e.byteSize, 0);
  if (entries.length <= maxEntries && totalBytes <= maxBytes) {
    return { retained: [...entries], evicted: [] };
  }

  // Sort lowest priority first (victims)
  const sorted = sortEntriesByLfuLru(entries);
  const evicted: AudioCacheEntry[] = [];
  const retainedSet = new Set(entries);

  let currentCount = entries.length;
  let currentBytes = totalBytes;

  for (const candidate of sorted) {
    if (currentCount <= maxEntries && currentBytes <= maxBytes) {
      break;
    }
    evicted.push(candidate);
    retainedSet.delete(candidate);
    currentCount -= 1;
    currentBytes -= candidate.byteSize;
  }

  return {
    retained: entries.filter((e) => retainedSet.has(e)),
    evicted,
  };
}
