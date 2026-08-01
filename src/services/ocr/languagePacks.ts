import AsyncStorage from '@react-native-async-storage/async-storage';
import { isVisionOCRAvailable } from '../../native/VisionOCRModule';
import {
  loadUserSettings,
  type ImageTextLanguageMode,
  type LearningLanguage,
} from '../settings/userSettings';

const OCR_LEARNING_LANGUAGES_KEY = 'nuances_ocr_learning_languages_v1';

export const DEFAULT_VISION_OCR_LANGUAGES = ['en-US'];

export type PreparedOCRVisionLanguageConfig = {
  mode: ImageTextLanguageMode;
  learningLanguages: LearningLanguage[];
  visionLanguages: string[];
  automaticallyDetectsLanguage: boolean;
};

export function resolveVisionLanguagesForLearningLanguages(languages: LearningLanguage[]): string[] {
  void languages;
  return DEFAULT_VISION_OCR_LANGUAGES;
}

function resolveEnglishOnlyOCRConfig(): PreparedOCRVisionLanguageConfig {
  return {
    mode: 'preferred',
    learningLanguages: ['en'],
    visionLanguages: DEFAULT_VISION_OCR_LANGUAGES,
    automaticallyDetectsLanguage: false,
  };
}

export async function prepareOCRLanguagesForLearningLanguages(
  languages: LearningLanguage[],
  mode?: ImageTextLanguageMode
): Promise<void> {
  void languages;
  void mode;
  const resolvedConfig = resolveEnglishOnlyOCRConfig();
  const visionLanguages = resolvedConfig.visionLanguages;
  await AsyncStorage.setItem(OCR_LEARNING_LANGUAGES_KEY, JSON.stringify(visionLanguages));

  // Apple Vision does not expose a JS-level "download this language pack" API.
  // Keeping this as the single preparation hook lets us add native warmup later without touching UI flows.
  if (__DEV__) {
    console.log('[OCR] prepared learning languages for Vision OCR', {
      requested: resolvedConfig.learningLanguages,
      mode: resolvedConfig.mode,
      visionLanguages,
      visionAvailable: isVisionOCRAvailable(),
    });
  }
}

export async function getPreparedOCRVisionLanguageConfig(): Promise<PreparedOCRVisionLanguageConfig> {
  try {
    void (await loadUserSettings());
    const config = resolveEnglishOnlyOCRConfig();
    const visionLanguages = config.visionLanguages;
    await AsyncStorage.setItem(OCR_LEARNING_LANGUAGES_KEY, JSON.stringify(visionLanguages));
    return config;
  } catch (error) {
    console.warn('[OCR] failed to resolve OCR languages from settings, using English default:', error);
    return resolveEnglishOnlyOCRConfig();
  }
}

export async function getPreparedOCRVisionLanguages(): Promise<string[]> {
  const config = await getPreparedOCRVisionLanguageConfig();
  return config.visionLanguages;
}
