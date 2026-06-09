import AsyncStorage from '@react-native-async-storage/async-storage';
import { isVisionOCRAvailable } from '../../native/VisionOCRModule';
import type { LearningLanguage } from '../settings/userSettings';

const OCR_LEARNING_LANGUAGES_KEY = 'nuances_ocr_learning_languages_v1';

const VISION_LANGUAGE_BY_LEARNING_LANGUAGE: Record<LearningLanguage, string[]> = {
  zh: ['zh-Hant', 'zh-Hans'],
  en: ['en-US'],
  ko: ['ko-KR'],
  ja: ['ja-JP'],
  es: ['es-ES'],
};

export const DEFAULT_VISION_OCR_LANGUAGES = ['zh-Hant', 'zh-Hans', 'ja-JP', 'ko-KR', 'en-US'];

export function resolveVisionLanguagesForLearningLanguages(languages: LearningLanguage[]): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];
  const source: LearningLanguage[] = languages.length > 0 ? languages : ['en'];

  source.forEach((language) => {
    VISION_LANGUAGE_BY_LEARNING_LANGUAGE[language].forEach((visionLanguage) => {
      if (seen.has(visionLanguage)) return;
      seen.add(visionLanguage);
      resolved.push(visionLanguage);
    });
  });

  return resolved.length > 0 ? resolved : DEFAULT_VISION_OCR_LANGUAGES;
}

export async function prepareOCRLanguagesForLearningLanguages(languages: LearningLanguage[]): Promise<void> {
  const visionLanguages = resolveVisionLanguagesForLearningLanguages(languages);
  await AsyncStorage.setItem(OCR_LEARNING_LANGUAGES_KEY, JSON.stringify(visionLanguages));

  // Apple Vision does not expose a JS-level "download this language pack" API.
  // Keeping this as the single preparation hook lets us add native warmup later without touching UI flows.
  console.log('[OCR] prepared learning languages for Vision OCR', {
    requested: languages,
    visionLanguages,
    visionAvailable: isVisionOCRAvailable(),
  });
}

export async function getPreparedOCRVisionLanguages(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(OCR_LEARNING_LANGUAGES_KEY);
    if (!raw) return DEFAULT_VISION_OCR_LANGUAGES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISION_OCR_LANGUAGES;
    const languages = parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    return languages.length > 0 ? languages : DEFAULT_VISION_OCR_LANGUAGES;
  } catch (error) {
    console.warn('[OCR] failed to read prepared OCR languages, using defaults:', error);
    return DEFAULT_VISION_OCR_LANGUAGES;
  }
}
