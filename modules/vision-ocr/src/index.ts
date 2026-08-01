import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export interface VisionOCRFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisionOCRBlock {
  text: string;
  confidence: number;
  frame: VisionOCRFrame;
  candidates?: Array<{
    text: string;
    confidence: number;
  }>;
}

export interface VisionOCRResult {
  fullText: string;
  blocks: VisionOCRBlock[];
  imageWidth: number;
  imageHeight: number;
}

export interface VisionOCROptions {
  languages?: string[];
  usesLanguageCorrection?: boolean;
  automaticallyDetectsLanguage?: boolean;
}

type NativeVisionOCRModule = {
  recognizeText: (
    imageUri: string,
    options?: VisionOCROptions
  ) => Promise<VisionOCRResult>;
};

const nativeModule =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeVisionOCRModule>('VisionOCR')
    : null;

export function isVisionOCRAvailable(): boolean {
  return typeof nativeModule?.recognizeText === 'function';
}

export async function recognizeTextWithVision(
  imageUri: string,
  options: VisionOCROptions = {}
): Promise<VisionOCRResult> {
  if (!nativeModule) {
    throw new Error(
      '本機 OCR 原生模組尚未載入。請重新建立並安裝 app；只重啟 Metro 無法加入新的原生模組。'
    );
  }

  return nativeModule.recognizeText(imageUri, options);
}
