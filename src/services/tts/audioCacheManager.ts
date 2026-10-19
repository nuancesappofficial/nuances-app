import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import {
  type AudioCacheEntry,
  DEFAULT_MAX_CACHE_BYTES,
  DEFAULT_MAX_CACHE_ENTRIES,
  pruneAudioCacheEntries,
} from './audioCachePruning';

export { AudioCacheEntry } from './audioCachePruning';

export const AUDIO_CACHE_STORAGE_KEY = 'nuances_audio_cache_index_v1';

class AudioCacheManagerService {
  private cacheIndex: Map<string, AudioCacheEntry> = new Map();
  private isLoaded = false;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  async loadIndex(): Promise<void> {
    if (this.isLoaded) return;
    try {
      const raw = await AsyncStorage.getItem(AUDIO_CACHE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AudioCacheEntry[];
        if (Array.isArray(parsed)) {
          this.cacheIndex.clear();
          for (const entry of parsed) {
            if (entry && entry.key && entry.filename) {
              this.cacheIndex.set(entry.key, entry);
            }
          }
        }
      }
    } catch (error) {
      console.warn('[AudioCacheManager] failed to load cache index', error);
    } finally {
      this.isLoaded = true;
    }
  }

  private scheduleSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      void this.persistIndex();
    }, 1000);
  }

  private async persistIndex(): Promise<void> {
    try {
      const entries = Array.from(this.cacheIndex.values());
      await AsyncStorage.setItem(AUDIO_CACHE_STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.warn('[AudioCacheManager] failed to save cache index', error);
    }
  }

  hasEntry(key: string): boolean {
    return this.cacheIndex.has(key);
  }

  getEntry(key: string): AudioCacheEntry | undefined {
    return this.cacheIndex.get(key);
  }

  async recordAccess(key: string, filename: string, byteSize = 25000): Promise<void> {
    await this.loadIndex();
    const existing = this.cacheIndex.get(key);
    if (existing) {
      existing.playCount += 1;
      existing.lastAccessedAt = Date.now();
      if (byteSize > 0) existing.byteSize = byteSize;
    } else {
      this.cacheIndex.set(key, {
        key,
        filename,
        byteSize,
        playCount: 1,
        lastAccessedAt: Date.now(),
      });
    }
    this.scheduleSave();
    void this.pruneIfNecessary();
  }

  async recordPrefetch(key: string, filename: string, byteSize = 25000): Promise<void> {
    await this.loadIndex();
    if (!this.cacheIndex.has(key)) {
      this.cacheIndex.set(key, {
        key,
        filename,
        byteSize,
        playCount: 0, // 0 until user plays it
        lastAccessedAt: Date.now(),
      });
      this.scheduleSave();
      void this.pruneIfNecessary();
    }
  }

  async pruneIfNecessary(options?: { maxEntries?: number; maxBytes?: number }): Promise<void> {
    await this.loadIndex();
    const entries = Array.from(this.cacheIndex.values());
    const { retained, evicted } = pruneAudioCacheEntries(entries, options);

    if (evicted.length === 0) return;

    // Remove from index
    for (const victim of evicted) {
      this.cacheIndex.delete(victim.key);
      // Delete file from disk
      try {
        const cacheRoot = FileSystem.Paths.cache || FileSystem.Paths.document;
        if (cacheRoot) {
          const file = new FileSystem.File(cacheRoot, victim.filename);
          if (file.exists) {
            file.delete();
          }
        }
      } catch (err) {
        console.warn('[AudioCacheManager] file delete error for pruned item', victim.filename, err);
      }
    }

    await this.persistIndex();
    console.log('[AudioCacheManager] pruned evicted audio entries', {
      evictedCount: evicted.length,
      retainedCount: retained.length,
    });
  }

  getStats(): { count: number; totalBytes: number } {
    const entries = Array.from(this.cacheIndex.values());
    return {
      count: entries.length,
      totalBytes: entries.reduce((sum, e) => sum + e.byteSize, 0),
    };
  }
}

export const AudioCacheManager = new AudioCacheManagerService();
