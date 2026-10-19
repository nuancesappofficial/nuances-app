import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { WHATS_NEW_CONFIG } from '../../config/whatsNew';
import {
  resolveWhatsNewToDisplay,
  LAST_SEEN_WHATS_NEW_KEY,
  type StorageAdapter,
  type WhatsNewRelease,
} from './whatsNewCore';

export * from './whatsNewCore';

const defaultStorage: StorageAdapter = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
};

export class WhatsNewService {
  private storage: StorageAdapter;
  private config: Record<string, WhatsNewRelease>;

  constructor(
    storage: StorageAdapter = defaultStorage,
    config: Record<string, WhatsNewRelease> = WHATS_NEW_CONFIG
  ) {
    this.storage = storage;
    this.config = config;
  }

  public getCurrentAppVersion(): string {
    return (
      Constants.expoConfig?.version ||
      (Constants.manifest as Record<string, unknown> | undefined)?.version as string ||
      '1.3.3'
    );
  }

  public async checkShouldShow(): Promise<WhatsNewRelease | null> {
    try {
      const currentVersion = this.getCurrentAppVersion();
      const lastSeen = await this.storage.getItem(LAST_SEEN_WHATS_NEW_KEY);
      return resolveWhatsNewToDisplay(currentVersion, lastSeen, this.config);
    } catch (err) {
      console.warn('[WhatsNewService] failed to check version:', err);
      return null;
    }
  }

  public async markAsSeen(version: string): Promise<void> {
    try {
      await this.storage.setItem(LAST_SEEN_WHATS_NEW_KEY, version);
    } catch (err) {
      console.warn('[WhatsNewService] failed to mark version as seen:', err);
    }
  }
}

export const whatsNewService = new WhatsNewService();
