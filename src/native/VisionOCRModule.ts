import { NativeModules, Platform } from 'react-native';

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
}

export interface VisionOCRResult {
  fullText: string;
  blocks: VisionOCRBlock[];
  imageWidth: number;
  imageHeight: number;
}

type VisionOCRModuleType = {
  recognizeText: (
    imageUri: string,
    options?: {
      languages?: string[];
      usesLanguageCorrection?: boolean;
    }
  ) => Promise<VisionOCRResult>;
};

function getNativeModule(): VisionOCRModuleType | null {
  return (NativeModules.VisionOCRModule || null) as VisionOCRModuleType | null;
}

export function isVisionOCRAvailable(): boolean {
  const nativeModule = getNativeModule();
  return Platform.OS === 'ios' && !!nativeModule?.recognizeText;
}

export async function recognizeTextWithVision(
  imageUri: string,
  options?: {
    languages?: string[];
    usesLanguageCorrection?: boolean;
  }
): Promise<VisionOCRResult> {
  const nativeModule = getNativeModule();
  if (!isVisionOCRAvailable() || !nativeModule) {
    const availableModules = Object.keys(NativeModules || {}).slice(0, 60).join(', ');
    throw new Error(
      `Apple Vision OCR is not available on this device (VisionOCRModule missing). NativeModules=${availableModules}`
    );
  }

  return nativeModule.recognizeText(imageUri, options ?? {});
}
