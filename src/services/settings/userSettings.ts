import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { DEFAULT_STICKER_FONT_KEY, type StickerFontKey } from '../../theme/stickerFonts';
import { setAppGroupUILanguage } from '../../native/SharedDefaultsModule';

export type ClipboardMode = 'active' | 'passive';
export type EntitlementMode = 'trial' | 'free' | 'premium' | 'guest';
export type PlanType = 'trial' | 'free' | 'premium';
export type AIReplyLanguage = 'zh-TW' | 'zh-CN' | 'en' | 'ja' | 'ko' | 'es' | 'fr';
export type UILanguage = 'zh-TW' | 'zh-CN' | 'en' | 'ja' | 'ko' | 'es';
export type LearningLanguage = 'zh' | 'en' | 'ko' | 'ja' | 'es';
export type TTSVoice =
  | 'en-US-JennyNeural'
  | 'en-US-GuyNeural'
  | 'en-GB-SoniaNeural'
  | 'ja-JP-NanamiNeural'
  | 'ko-KR-SunHiNeural'
  | 'zh-TW-HsiaoChenNeural'
  | 'zh-CN-XiaoxiaoNeural'
  | 'es-ES-ElviraNeural'
  | 'fr-FR-DeniseNeural';
export type WordPopSlideMs = 1800 | 2600 | 3400 | 4200 | 5200;
export type MainScreenAlbumGridCount = 3 | 4 | 9;
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
export type AIBreakdownMode = 'short_punchy' | 'context' | 'deep_dive';

export const LEARNING_LANGUAGE_OPTIONS: Array<{
  value: LearningLanguage;
  label: 'Chinese' | 'English' | 'Korean' | 'Japanese' | 'Spanish';
  stickerText: string;
}> = [
  { value: 'zh', label: 'Chinese', stickerText: '嗨' },
  { value: 'en', label: 'English', stickerText: 'Hi' },
  { value: 'ko', label: 'Korean', stickerText: '안녕' },
  { value: 'ja', label: 'Japanese', stickerText: 'やあ' },
  { value: 'es', label: 'Spanish', stickerText: 'Hola' },
];

export const AI_BREAKDOWN_MODE_OPTIONS: Array<{
  value: AIBreakdownMode;
  label: 'Clarity' | 'Application' | 'Mastery';
  description: string;
}> = [
  {
    value: 'short_punchy',
    label: 'Clarity',
    description: 'Quick',
  },
  {
    value: 'context',
    label: 'Application',
    description: 'Balanced',
  },
  {
    value: 'deep_dive',
    label: 'Mastery',
    description: 'Detailed',
  },
];

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
  aiBreakdownMode: AIBreakdownMode;
};

export type UserAppSettings = {
  clipboardMode: ClipboardMode;
  entitlementMode: EntitlementMode;
  planType: PlanType;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  subscriptionExpiresAt: string | null;
  lastEntitlementSyncAt: string | null;
  uiLanguage: UILanguage;
  aiReplyLanguage: AIReplyLanguage;
  learningLanguages: LearningLanguage[];
  ttsVoice: TTSVoice;
  ttsVoiceByLanguage: Partial<Record<AIReplyLanguage, TTSVoice>>;
  wordPopSlideMs: WordPopSlideMs;
  mainScreenAlbumGridCount: MainScreenAlbumGridCount;
  mainScreenWordPopEnabled: boolean;
  mainScreenWordPopAlbumId: string | null;
  mainScreenAlbumOrder: string[];
  stickerFontKey: StickerFontKey;
  personalization: UserPersonalizationSettings;
};

export type EffectiveAIPersonalization = {
  learningGoal: 'ielts' | 'casual' | 'professional';
  proficiencyStandard?: string;
  proficiencyLevel?: string;
  domain?: string;
  tone?: string;
  aiBreakdownMode: AIBreakdownMode;
};

const SETTINGS_STORAGE_KEY = 'user_app_settings_v1';
const userSettingsListeners = new Set<(settings: UserAppSettings) => void>();
export const MAIN_SCREEN_EMPTY_ALBUM_SLOT_PREFIX = '__nuances_empty_album_slot__:';
const DEV_BYPASS_ENABLED = String(process.env.EXPO_PUBLIC_SUBSCRIPTION_DEV_BYPASS || '').toLowerCase() === 'true';
const DEV_DEFAULT_PLAN = normalizeEntitlementMode(
  process.env.EXPO_PUBLIC_SUBSCRIPTION_DEV_DEFAULT_PLAN as PlanType | null | undefined
);

export function isMainScreenEmptyAlbumSlot(value: string): boolean {
  return value.startsWith(MAIN_SCREEN_EMPTY_ALBUM_SLOT_PREFIX);
}

export function createMainScreenEmptyAlbumSlot(): string {
  return `${MAIN_SCREEN_EMPTY_ALBUM_SLOT_PREFIX}${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function normalizeEntitlementMode(mode: EntitlementMode | PlanType | null | undefined): PlanType {
  if (mode === 'premium' || mode === 'trial' || mode === 'free') return mode;
  return 'free';
}

export function normalizeAIBreakdownMode(value: unknown): AIBreakdownMode {
  if (value === 'short_punchy' || value === 'context' || value === 'deep_dive') {
    return value;
  }
  return 'context';
}

export function normalizeUILanguage(value: unknown): UILanguage {
  if (value === 'zh-TW' || value === 'zh-CN' || value === 'en' || value === 'ja' || value === 'ko' || value === 'es') {
    return value;
  }
  return 'en';
}

export function normalizeLearningLanguages(value: unknown): LearningLanguage[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const normalized = rawValues
    .map((item) => String(item).trim())
    .filter((item): item is LearningLanguage =>
      item === 'zh' || item === 'en' || item === 'ko' || item === 'ja' || item === 'es'
    );
  const deduped = Array.from(new Set(normalized));
  return deduped.length > 0 ? deduped : ['en'];
}

export function getLearningLanguageSummary(languages: LearningLanguage[]): string {
  const normalized = normalizeLearningLanguages(languages);
  return normalized
    .map((language) => LEARNING_LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ?? language)
    .join(', ');
}

export function getAIBreakdownModeLabel(mode: AIBreakdownMode | string | null | undefined): string {
  const normalized = normalizeAIBreakdownMode(mode);
  return AI_BREAKDOWN_MODE_OPTIONS.find((option) => option.value === normalized)?.label ?? 'Application';
}

function normalizeDeviceLocale(raw: unknown): string {
  return typeof raw === 'string'
    ? raw.trim().replace(/_/g, '-')
    : '';
}

function getDeviceLocaleCandidates(): string[] {
  const candidates: string[] = [];

  try {
    const settings = NativeModules.SettingsManager?.settings;
    candidates.push(
      normalizeDeviceLocale(settings?.AppleLocale),
      normalizeDeviceLocale(settings?.AppleLanguages?.[0])
    );
  } catch {
    // Native locale access can be unavailable in tests or non-iOS runtimes.
  }

  try {
    candidates.push(
      normalizeDeviceLocale(NativeModules.I18nManager?.localeIdentifier),
      normalizeDeviceLocale(NativeModules.I18nManager?.locale)
    );
  } catch {
    // Android/bridgeless runtimes may expose different locale fields.
  }

  try {
    candidates.push(normalizeDeviceLocale(Intl.DateTimeFormat().resolvedOptions().locale));
  } catch {
    // Intl may be unavailable in older JS runtimes.
  }

  if (Platform.OS === 'ios') {
    candidates.push('en');
  }

  return candidates.filter(Boolean);
}

function getDefaultLanguagesFromDevice(): Pick<UserAppSettings, 'uiLanguage' | 'aiReplyLanguage'> {
  const locale = getDeviceLocaleCandidates()[0]?.toLowerCase() ?? 'en';
  const isChinese = locale.startsWith('zh');
  const isSimplifiedChinese =
    locale.includes('hans') ||
    locale.includes('-cn') ||
    locale.includes('-sg') ||
    locale.includes('-my');

  if (isChinese) {
    const chineseLanguage = isSimplifiedChinese ? 'zh-CN' : 'zh-TW';
    return {
      uiLanguage: chineseLanguage,
      aiReplyLanguage: chineseLanguage,
    };
  }

  if (locale.startsWith('ja')) {
    return { uiLanguage: 'en', aiReplyLanguage: 'ja' };
  }

  if (locale.startsWith('ko')) {
    return { uiLanguage: 'en', aiReplyLanguage: 'ko' };
  }

  if (locale.startsWith('es')) {
    return { uiLanguage: 'en', aiReplyLanguage: 'es' };
  }

  return {
    uiLanguage: 'en',
    aiReplyLanguage: 'en',
  };
}

const DEVICE_DEFAULT_LANGUAGES = getDefaultLanguagesFromDevice();
const DEVICE_DEFAULT_TTS_VOICE: TTSVoice =
  DEVICE_DEFAULT_LANGUAGES.aiReplyLanguage === 'zh-TW'
    ? 'zh-TW-HsiaoChenNeural'
    : DEVICE_DEFAULT_LANGUAGES.aiReplyLanguage === 'zh-CN'
      ? 'zh-CN-XiaoxiaoNeural'
      : DEVICE_DEFAULT_LANGUAGES.aiReplyLanguage === 'ja'
        ? 'ja-JP-NanamiNeural'
        : DEVICE_DEFAULT_LANGUAGES.aiReplyLanguage === 'ko'
          ? 'ko-KR-SunHiNeural'
          : DEVICE_DEFAULT_LANGUAGES.aiReplyLanguage === 'es'
            ? 'es-ES-ElviraNeural'
            : 'en-US-JennyNeural';

export const DEFAULT_USER_SETTINGS: UserAppSettings = {
  clipboardMode: 'passive',
  entitlementMode: 'free',
  planType: 'free',
  trialStartedAt: null,
  trialEndsAt: null,
  subscriptionExpiresAt: null,
  lastEntitlementSyncAt: null,
  uiLanguage: DEVICE_DEFAULT_LANGUAGES.uiLanguage,
  aiReplyLanguage: DEVICE_DEFAULT_LANGUAGES.aiReplyLanguage,
  learningLanguages: ['en'],
  ttsVoice: DEVICE_DEFAULT_TTS_VOICE,
  ttsVoiceByLanguage: {
    'zh-TW': 'zh-TW-HsiaoChenNeural',
    'zh-CN': 'zh-CN-XiaoxiaoNeural',
    en: 'en-US-JennyNeural',
    ja: 'ja-JP-NanamiNeural',
    ko: 'ko-KR-SunHiNeural',
    es: 'es-ES-ElviraNeural',
    fr: 'fr-FR-DeniseNeural',
  },
  wordPopSlideMs: 2600,
  mainScreenAlbumGridCount: 4,
  mainScreenWordPopEnabled: true,
  mainScreenWordPopAlbumId: null,
  mainScreenAlbumOrder: [],
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
    aiBreakdownMode: 'context',
  },
};

const DEFAULT_TTS_VOICE_BY_LANGUAGE: Record<AIReplyLanguage, TTSVoice> = {
  'zh-TW': 'zh-TW-HsiaoChenNeural',
  'zh-CN': 'zh-CN-XiaoxiaoNeural',
  en: 'en-US-JennyNeural',
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural',
  es: 'es-ES-ElviraNeural',
  fr: 'fr-FR-DeniseNeural',
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

export function getPrimaryAIReplyLanguageForLearningLanguages(
  languages: LearningLanguage[]
): AIReplyLanguage {
  const primary = normalizeLearningLanguages(languages)[0];
  if (primary === 'zh') return 'zh-TW';
  if (primary === 'ja') return 'ja';
  if (primary === 'ko') return 'ko';
  if (primary === 'es') return 'es';
  return 'en';
}

export function getDefaultTTSVoiceForLearningLanguages(languages: LearningLanguage[]): TTSVoice {
  return getDefaultTTSVoiceForAIReplyLanguage(getPrimaryAIReplyLanguageForLearningLanguages(languages));
}

export function resolveTTSVoiceForLanguage(
  settings: Pick<UserAppSettings, 'ttsVoice' | 'ttsVoiceByLanguage'>,
  language: AIReplyLanguage
): TTSVoice {
  const mappedVoice = settings.ttsVoiceByLanguage?.[language];
  if (mappedVoice && isTTSVoiceCompatibleWithAIReplyLanguage(mappedVoice, language)) {
    return mappedVoice;
  }
  if (isTTSVoiceCompatibleWithAIReplyLanguage(settings.ttsVoice, language)) {
    return settings.ttsVoice;
  }
  return getDefaultTTSVoiceForAIReplyLanguage(language);
}

export function withUpdatedTTSVoiceOnlyForLanguage(
  settings: UserAppSettings,
  language: AIReplyLanguage,
  voice: TTSVoice
): UserAppSettings {
  return {
    ...settings,
    ttsVoice: voice,
    ttsVoiceByLanguage: {
      ...DEFAULT_USER_SETTINGS.ttsVoiceByLanguage,
      ...(settings.ttsVoiceByLanguage || {}),
      [language]: voice,
    },
  };
}

function mergeSettings(partial?: Partial<UserAppSettings> | null): UserAppSettings {
  const shouldUseDevDefaultPlan = DEV_BYPASS_ENABLED && DEV_DEFAULT_PLAN !== 'free';
  const normalizedPlanType = normalizeEntitlementMode(
    shouldUseDevDefaultPlan
      ? DEV_DEFAULT_PLAN
      : partial?.planType ?? partial?.entitlementMode ?? DEFAULT_USER_SETTINGS.planType
  );
  const learningLanguages = normalizeLearningLanguages(partial?.learningLanguages);
  const primaryLearningLanguage = getPrimaryAIReplyLanguageForLearningLanguages(learningLanguages);
  const nextLanguage =
    partial?.aiReplyLanguage && DEFAULT_TTS_VOICE_BY_LANGUAGE[partial.aiReplyLanguage]
      ? partial.aiReplyLanguage
      : DEFAULT_USER_SETTINGS.aiReplyLanguage;
  const uiLanguage =
    partial?.uiLanguage !== undefined
      ? normalizeUILanguage(partial.uiLanguage)
      : DEFAULT_USER_SETTINGS.uiLanguage;
  const mergedVoiceMap: Partial<Record<AIReplyLanguage, TTSVoice>> = {
    ...DEFAULT_USER_SETTINGS.ttsVoiceByLanguage,
    ...(partial?.ttsVoiceByLanguage ?? {}),
  };
  if (partial?.ttsVoice && isTTSVoiceCompatibleWithAIReplyLanguage(partial.ttsVoice, primaryLearningLanguage)) {
    mergedVoiceMap[primaryLearningLanguage] = partial.ttsVoice;
  }
  const resolvedCurrentVoice =
    resolveTTSVoiceForLanguage(
      {
        ttsVoice: partial?.ttsVoice ?? getDefaultTTSVoiceForLearningLanguages(learningLanguages),
        ttsVoiceByLanguage: mergedVoiceMap,
      },
      primaryLearningLanguage
    );
  const rawMainScreenAlbumGridCount = partial?.mainScreenAlbumGridCount;
  const mainScreenAlbumGridCount =
    rawMainScreenAlbumGridCount === 3 ||
    rawMainScreenAlbumGridCount === 4 ||
    rawMainScreenAlbumGridCount === 9
      ? rawMainScreenAlbumGridCount
      : DEFAULT_USER_SETTINGS.mainScreenAlbumGridCount;
  const mainScreenAlbumOrder = Array.isArray(partial?.mainScreenAlbumOrder)
    ? partial.mainScreenAlbumOrder
        .filter((albumId): albumId is string => typeof albumId === 'string')
        .map((albumId) => albumId.trim())
        .filter(Boolean)
    : DEFAULT_USER_SETTINGS.mainScreenAlbumOrder;
  return {
    ...DEFAULT_USER_SETTINGS,
    ...partial,
    entitlementMode: normalizedPlanType,
    planType: normalizedPlanType,
    uiLanguage,
    aiReplyLanguage: nextLanguage,
    learningLanguages,
    ttsVoice: resolvedCurrentVoice,
    ttsVoiceByLanguage: mergedVoiceMap,
    mainScreenAlbumGridCount,
    mainScreenWordPopEnabled:
      typeof partial?.mainScreenWordPopEnabled === 'boolean'
        ? partial.mainScreenWordPopEnabled
        : DEFAULT_USER_SETTINGS.mainScreenWordPopEnabled,
    mainScreenWordPopAlbumId:
      typeof partial?.mainScreenWordPopAlbumId === 'string' && partial.mainScreenWordPopAlbumId.trim()
        ? partial.mainScreenWordPopAlbumId.trim()
        : null,
    mainScreenAlbumOrder,
    trialStartedAt:
      typeof partial?.trialStartedAt === 'string' && partial.trialStartedAt.trim()
        ? partial.trialStartedAt
        : null,
    trialEndsAt:
      typeof partial?.trialEndsAt === 'string' && partial.trialEndsAt.trim()
        ? partial.trialEndsAt
        : null,
    subscriptionExpiresAt:
      typeof partial?.subscriptionExpiresAt === 'string' && partial.subscriptionExpiresAt.trim()
        ? partial.subscriptionExpiresAt
        : null,
    lastEntitlementSyncAt:
      typeof partial?.lastEntitlementSyncAt === 'string' && partial.lastEntitlementSyncAt.trim()
        ? partial.lastEntitlementSyncAt
        : null,
    personalization: {
      ...DEFAULT_USER_SETTINGS.personalization,
      ...(partial?.personalization ?? {}),
      aiBreakdownMode: normalizeAIBreakdownMode(partial?.personalization?.aiBreakdownMode),
    },
  };
}

export async function loadUserSettings(): Promise<UserAppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      const defaults = mergeSettings(null);
      void setAppGroupUILanguage(defaults.uiLanguage);
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<UserAppSettings>;
    const merged = mergeSettings(parsed);
    void setAppGroupUILanguage(merged.uiLanguage);
    return merged;
  } catch (error) {
    console.error('[Settings] Failed to load user settings:', error);
    const defaults = mergeSettings(null);
    void setAppGroupUILanguage(defaults.uiLanguage);
    return defaults;
  }
}

export async function saveUserSettings(next: UserAppSettings): Promise<void> {
  const merged = mergeSettings(next);
  await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
  void setAppGroupUILanguage(merged.uiLanguage);
  userSettingsListeners.forEach((listener) => listener(merged));
}

export async function clearUserSettings(): Promise<void> {
  const defaults = mergeSettings(null);
  await AsyncStorage.removeItem(SETTINGS_STORAGE_KEY);
  void setAppGroupUILanguage(defaults.uiLanguage);
  userSettingsListeners.forEach((listener) => listener(defaults));
}

export function subscribeUserSettings(listener: (settings: UserAppSettings) => void): () => void {
  userSettingsListeners.add(listener);
  return () => {
    userSettingsListeners.delete(listener);
  };
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
    aiBreakdownMode: normalizeAIBreakdownMode(settings.personalization.aiBreakdownMode),
  };
}
