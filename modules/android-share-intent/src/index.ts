import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type AndroidSharedPayload = {
  id: string;
  ownerUserId: string | null;
  receivedAt: number;
  type: 'text' | 'image';
  text?: string;
  imageUris?: string[];
};

type NativeModule = {
  getPendingSharedPayloads(): Promise<AndroidSharedPayload[]>;
  acknowledgeSharedPayloads(ids: string[]): Promise<boolean>;
  rejectSharedPayloads(ids: string[]): Promise<boolean>;
  setActiveUserId(userId: string | null): Promise<void>;
  addListener(eventName: 'onSharedPayload', listener: (event: { id: string }) => void): { remove(): void };
};

const nativeModule = Platform.OS === 'android'
  ? requireOptionalNativeModule<NativeModule>('AndroidShareIntent')
  : null;

export const AndroidShareIntent = {
  available: Boolean(nativeModule),
  getPendingSharedPayloads: () => nativeModule?.getPendingSharedPayloads() ?? Promise.resolve([]),
  acknowledgeSharedPayloads: (ids: string[]) => nativeModule?.acknowledgeSharedPayloads(ids) ?? Promise.resolve(false),
  rejectSharedPayloads: (ids: string[]) => nativeModule?.rejectSharedPayloads(ids) ?? Promise.resolve(false),
  setActiveUserId: (userId: string | null) => nativeModule?.setActiveUserId(userId) ?? Promise.resolve(),
  addListener: (listener: () => void) => nativeModule
    ? nativeModule.addListener('onSharedPayload', listener)
    : { remove() {} },
};
