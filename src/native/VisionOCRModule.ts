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

const nativeModule = (NativeModules.VisionOCRModule || null) as VisionOCRModuleType | null;

export function isVisionOCRAvailable(): boolean {
  return Platform.OS === 'ios' && !!nativeModule?.recognizeText;
}

export async function recognizeTextWithVision(
  imageUri: string,
  options?: {
    languages?: string[];
    usesLanguageCorrection?: boolean;
  }
): Promise<VisionOCRResult> {
  if (!isVisionOCRAvailable() || !nativeModule) {
    throw new Error('Apple Vision OCR is not available on this device');
  }

  return nativeModule.recognizeText(imageUri, options ?? {});
}
