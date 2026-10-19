import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pruneAudioCacheEntries,
  sortEntriesByLfuLru,
} from './audioCachePruning.ts';

test('sortEntriesByLfuLru sorts entries by playCount asc (LFU), then lastAccessedAt asc (LRU)', () => {
  const entries = [
    { key: 'word3', filename: 'w3.mp3', byteSize: 20000, playCount: 5, lastAccessedAt: 1000 },
    { key: 'word1', filename: 'w1.mp3', byteSize: 20000, playCount: 1, lastAccessedAt: 3000 },
    { key: 'word2', filename: 'w2.mp3', byteSize: 20000, playCount: 1, lastAccessedAt: 1000 }, // older access, same plays
    { key: 'word4', filename: 'w4.mp3', byteSize: 20000, playCount: 10, lastAccessedAt: 5000 },
  ];

  const sorted = sortEntriesByLfuLru(entries);
  assert.deepEqual(sorted.map(e => e.key), ['word2', 'word1', 'word3', 'word4']);
});

test('pruneAudioCacheEntries evicts least frequent entries when count exceeds maxEntries', () => {
  const entries = [
    { key: 'w1', filename: 'w1.mp3', byteSize: 1000, playCount: 1, lastAccessedAt: 100 },
    { key: 'w2', filename: 'w2.mp3', byteSize: 1000, playCount: 2, lastAccessedAt: 200 },
    { key: 'w3', filename: 'w3.mp3', byteSize: 1000, playCount: 10, lastAccessedAt: 300 },
    { key: 'w4', filename: 'w4.mp3', byteSize: 1000, playCount: 15, lastAccessedAt: 400 },
  ];

  // Limit to 2 entries
  const { retained, evicted } = pruneAudioCacheEntries(entries, { maxEntries: 2, maxBytes: 100000 });
  assert.equal(retained.length, 2);
  assert.equal(evicted.length, 2);
  assert.deepEqual(evicted.map(e => e.key), ['w1', 'w2']);
  assert.deepEqual(retained.map(e => e.key), ['w3', 'w4']);
});

test('pruneAudioCacheEntries evicts entries when total size exceeds maxBytes', () => {
  const entries = [
    { key: 'w1', filename: 'w1.mp3', byteSize: 60000, playCount: 1, lastAccessedAt: 100 },
    { key: 'w2', filename: 'w2.mp3', byteSize: 60000, playCount: 3, lastAccessedAt: 200 },
    { key: 'w3', filename: 'w3.mp3', byteSize: 30000, playCount: 5, lastAccessedAt: 300 },
  ];

  // Limit to 80,000 bytes (w1 + w2 + w3 = 150,000 bytes)
  const { retained, evicted } = pruneAudioCacheEntries(entries, { maxEntries: 1000, maxBytes: 80000 });
  assert.deepEqual(evicted.map(e => e.key), ['w1', 'w2']);
  assert.deepEqual(retained.map(e => e.key), ['w3']);
});

test('pruneAudioCacheEntries retains everything when within limits', () => {
  const entries = [
    { key: 'w1', filename: 'w1.mp3', byteSize: 1000, playCount: 1, lastAccessedAt: 100 },
    { key: 'w2', filename: 'w2.mp3', byteSize: 1000, playCount: 2, lastAccessedAt: 200 },
  ];

  const { retained, evicted } = pruneAudioCacheEntries(entries, { maxEntries: 1000, maxBytes: 1000000 });
  assert.equal(retained.length, 2);
  assert.equal(evicted.length, 0);
});
