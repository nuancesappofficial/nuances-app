import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_STICKER_FONT_KEY, type StickerFontKey } from '../../theme/stickerFonts';

export type ClipboardMode = 'active' | 'passive';
export type EntitlementMode = 'premium' | 'guest';
export type AIReplyLanguage = 'zh-TW' | 'zh-CN' | 'en' | 'ja' | 'ko';
export type TTSVoice =
  | 'en-US-JennyNeural'
  | 'en-US-GuyNeural'
  | 'en-GB-SoniaNeural'
  | 'ja-JP-NanamiNeural'
  | 'ko-KR-SunHiNeural'
  | 'zh-TW-HsiaoChenNeural'
  | 'zh-CN-XiaoxiaoNeural';
export type WordPopSlideMs = 1800 | 2600 | 3400 | 4200 | 5200;
export type LearningGoalPreset = 'ielts' | 'casual' | 'professional' | 'custom';
export type ProficiencyStandardPreset =
  | 'cefr'
  | 'ielts'
  | 'toefl'
  | 'toeic'
  | 'gept'
  | 'custom';
export type DomainPreset = 'medical' | 'technology' | 'business' | 'custom';
export type TonePreset = 'brief' | 'detailed' | 'custom';

export type UserPersonalizationSettings = {
  learningGoalPreset: LearningGoalPreset;
  learningGoalCustom: string;
  proficiencyStandardPreset: ProficiencyStandardPreset;
  proficiencyStandardCustom: string;
  proficiencyLevelPreset: string;
  proficiencyLevelCustom: string;
  domainPreset: DomainPreset;
  domainCustom: string;
  tonePreset: TonePreset;
  toneCustom: string;
};

export type UserAppSettings = {
  clipboardMode: ClipboardMode;
  entitlementMode: EntitlementMode;
  aiReplyLanguage: AIReplyLanguage;
  ttsVoice: TTSVoice;
  wordPopSlideMs: WordPopSlideMs;
  stickerFontKey: StickerFontKey;
  personalization: UserPersonalizationSettings;
};

export type EffectiveAIPersonalization = {
  learningGoal: 'ielts' | 'casual' | 'professional';
  proficiencyStandard?: string;
  proficiencyLevel?: string;
  domain?: string;
  tone?: string;
};

const SETTINGS_STORAGE_KEY = 'user_app_settings_v1';

export const DEFAULT_USER_SETTINGS: UserAppSettings = {
  clipboardMode: 'passive',
  entitlementMode: 'guest',
  aiReplyLanguage: 'zh-TW',
  ttsVoice: 'en-US-JennyNeural',
  wordPopSlideMs: 2600,
  stickerFontKey: DEFAULT_STICKER_FONT_KEY,
  personalization: {
    learningGoalPreset: 'ielts',
    learningGoalCustom: '',
    proficiencyStandardPreset: 'cefr',
    proficiencyStandardCustom: '',
    proficiencyLevelPreset: 'B2',
    proficiencyLevelCustom: '',
    domainPreset: 'business',
    domainCustom: '',
    tonePreset: 'brief',
    toneCustom: '',
  },
};

const DEFAULT_TTS_VOICE_BY_LANGUAGE: Record<AIReplyLanguage, TTSVoice> = {
  'zh-TW': 'zh-TW-HsiaoChenNeural',
  'zh-CN': 'zh-CN-XiaoxiaoNeural',
  en: 'en-US-JennyNeural',
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural',
};

export function isTTSVoiceCompatibleWithAIReplyLanguage(
  voice: TTSVoice,
  language: AIReplyLanguage
): boolean {
  if (language === 'en') return voice.startsWith('en-');
  if (language === 'ja') return voice.startsWith('ja-');
  if (language === 'ko') return voice.startsWith('ko-');
  return voice.startsWith(`${language}-`);
}

export function getDefaultTTSVoiceForAIReplyLanguage(language: AIReplyLanguage): TTSVoice {
  return DEFAULT_TTS_VOICE_BY_LANGUAGE[language];
}

function mergeSettings(partial?: Partial<UserAppSettings> | null): UserAppSettings {
  return {
    ...DEFAULT_USER_SETTINGS,
    ...partial,
    personalization: {
      ...DEFAULT_USER_SETTINGS.personalization,
      ...(partial?.personalization ?? {}),
    },
  };
}

export async function loadUserSettings(): Promise<UserAppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UserAppSettings>;
    return mergeSettings(parsed);
  } catch (error) {
    console.error('[Settings] Failed to load user settings:', error);
    return DEFAULT_USER_SETTINGS;
  }
}

export async function saveUserSettings(next: UserAppSettings): Promise<void> {
  const merged = mergeSettings(next);
  await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
}

export function getEffectiveLearningGoal(
  settings: UserAppSettings
): 'ielts' | 'casual' | 'professional' {
  const preset = settings.personalization.learningGoalPreset;
  if (preset === 'ielts' || preset === 'casual' || preset === 'professional') {
    return preset;
  }
  return 'ielts';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function resolvePresetValue<T extends string>(
  preset: T | 'custom',
  customValue: string
): string | undefined {
  if (preset === 'custom') {
    return trimOrUndefined(customValue);
  }
  return preset;
}

export function getEffectiveAIPersonalization(
  settings: UserAppSettings
): EffectiveAIPersonalization {
  const standard = resolvePresetValue(
    settings.personalization.proficiencyStandardPreset,
    settings.personalization.proficiencyStandardCustom
  );
  const levelPreset = settings.personalization.proficiencyLevelPreset.trim();
  const levelCustom = settings.personalization.proficiencyLevelCustom.trim();
  const level =
    levelPreset.toLowerCase() === 'custom'
      ? trimOrUndefined(levelCustom)
      : trimOrUndefined(levelPreset);

  return {
    learningGoal: getEffectiveLearningGoal(settings),
    proficiencyStandard: standard ? standard.toUpperCase() : undefined,
    proficiencyLevel: level ? level.toUpperCase() : undefined,
    domain: resolvePresetValue(
      settings.personalization.domainPreset,
      settings.personalization.domainCustom
    ),
    tone: resolvePresetValue(
      settings.personalization.tonePreset,
      settings.personalization.toneCustom
    ),
  };
}
