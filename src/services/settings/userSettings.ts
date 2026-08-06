import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, NativeModules, Platform } from 'react-native';
import {
  DEFAULT_STICKER_FONT_KEY,
  type StickerFontKey,
} from '../../theme/stickerFonts';
import { setAppGroupUILanguage } from '../../native/SharedDefaultsModule';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';

export type ClipboardMode = 'active' | 'passive';
export type EntitlementMode = 'trial' | 'free' | 'lite' | 'premium' | 'guest';
export type PlanType = 'trial' | 'free' | 'lite' | 'premium';
export type AIReplyLanguage =
  | 'zh-TW'
  | 'zh-CN'
  | 'en'
  | 'ja'
  | 'ko'
  | 'es'
  | 'fr';
export type UILanguage = AIReplyLanguage;
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
export type MainScreenAlbumGridCount = 3 | 6;
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
export type ImageTextLanguageMode = 'auto' | 'preferred';
export type ThemeMode = 'system' | 'light' | 'dark';

export const LEARNING_LANGUAGE_OPTIONS: Array<{
  value: LearningLanguage;
  label: 'Chinese' | 'English' | 'Korean' | 'Japanese' | 'Spanish';
  stickerText: string;
}> = [{ value: 'en', label: 'English', stickerText: 'Hi' }];

export const AI_BREAKDOWN_MODE_OPTIONS: Array<{
  value: AIBreakdownMode;
  label: 'Quick' | 'Detailed' | 'Deep Dive';
  description: string;
}> = [
  {
    value: 'short_punchy',
    label: 'Quick',
    description: 'Fast',
  },
  {
    value: 'context',
    label: 'Detailed',
    description: 'More examples',
  },
  {
    value: 'deep_dive',
    label: 'Deep Dive',
    description: 'Most detail',
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
  imageTextLanguageMode: ImageTextLanguageMode;
  imageTextLanguages: LearningLanguage[];
  ttsVoice: TTSVoice;
  ttsVoiceByLanguage: Partial<Record<AIReplyLanguage, TTSVoice>>;
  wordPopSlideMs: WordPopSlideMs;
  mainScreenAlbumGridCount: MainScreenAlbumGridCount;
  mainScreenWordPopEnabled: boolean;
  mainScreenWordPopAlbumId: string | null;
  mainScreenAlbumOrder: string[];
  reminderNotificationsEnabled: boolean;
  themeMode: ThemeMode;
  stickerFontKey: StickerFontKey;
  stickerFontScalePercent: number;
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
let cachedUserSettings: UserAppSettings | null = null;
export const MAIN_SCREEN_EMPTY_ALBUM_SLOT_PREFIX =
  '__nuances_empty_album_slot__:';

function buildSettingsStorageKey(scopeId: string): string {
  return `${SETTINGS_STORAGE_KEY}:${scopeId}`;
}

async function getSettingsScopeId(): Promise<string> {
  // Settings are device-local and account-scoped. Reading the persisted session
  // is sufficient to select the local namespace; getUser() performs a network
  // validation and can otherwise make every settings control appear frozen.
  return (await getCurrentSessionUserId()) ?? 'guest';
}

async function isCurrentSettingsScope(scopeId: string): Promise<boolean> {
  return (await getSettingsScopeId()) === scopeId;
}

function publishCachedSettings(
  settings: UserAppSettings,
  notifyListeners = false
): void {
  cachedUserSettings = settings;
  Appearance.setColorScheme(
    settings.themeMode === 'system' ? null : settings.themeMode
  );
  // The share extension cannot read React state. Keep its receipt language in
  // sync with the language the user selected for replies and app messaging.
  void setAppGroupUILanguage(settings.aiReplyLanguage);
  if (notifyListeners) {
    userSettingsListeners.forEach((listener) => listener(settings));
  }
}

export function resetUserSettingsMemoryCache(): void {
  cachedUserSettings = null;
}
const DEV_BYPASS_ENABLED =
  String(
    process.env.EXPO_PUBLIC_SUBSCRIPTION_DEV_BYPASS || ''
  ).toLowerCase() === 'true';
const DEV_DEFAULT_PLAN = normalizeEntitlementMode(
  process.env.EXPO_PUBLIC_SUBSCRIPTION_DEV_DEFAULT_PLAN as
    | PlanType
    | null
    | undefined
);

export function isMainScreenEmptyAlbumSlot(value: string): boolean {
  return value.startsWith(MAIN_SCREEN_EMPTY_ALBUM_SLOT_PREFIX);
}

export function createMainScreenEmptyAlbumSlot(): string {
  return `${MAIN_SCREEN_EMPTY_ALBUM_SLOT_PREFIX}${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function normalizeEntitlementMode(
  mode: EntitlementMode | PlanType | null | undefined
): PlanType {
  if (
    mode === 'premium' ||
    mode === 'trial' ||
    mode === 'lite' ||
    mode === 'free'
  )
    return mode;
  return 'free';
}

export function normalizeAIBreakdownMode(value: unknown): AIBreakdownMode {
  if (
    value === 'short_punchy' ||
    value === 'context' ||
    value === 'deep_dive'
  ) {
    return value;
  }
  return 'context';
}

export function normalizeUILanguage(value: unknown): UILanguage {
  if (
    value === 'zh-TW' ||
    value === 'zh-CN' ||
    value === 'en' ||
    value === 'ja' ||
    value === 'ko' ||
    value === 'es' ||
    value === 'fr'
  ) {
    return value;
  }
  return 'en';
}

export function normalizeLearningLanguages(value: unknown): LearningLanguage[] {
  void value;
  return ['en'];
}

export function getLearningLanguageSummary(
  languages: LearningLanguage[]
): string {
  const normalized = normalizeLearningLanguages(languages);
  return normalized
    .map(
      (language) =>
        LEARNING_LANGUAGE_OPTIONS.find((option) => option.value === language)
          ?.label ?? language
    )
    .join(', ');
}

export function getAIBreakdownModeLabel(
  mode: AIBreakdownMode | string | null | undefined
): string {
  const normalized = normalizeAIBreakdownMode(mode);
  return (
    AI_BREAKDOWN_MODE_OPTIONS.find((option) => option.value === normalized)
      ?.label ?? 'Detailed'
  );
}

function normalizeDeviceLocale(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/_/g, '-') : '';
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
    candidates.push(
      normalizeDeviceLocale(Intl.DateTimeFormat().resolvedOptions().locale)
    );
  } catch {
    // Intl may be unavailable in older JS runtimes.
  }

  if (Platform.OS === 'ios') {
    candidates.push('en');
  }

  return candidates.filter(Boolean);
}

function getDefaultLanguagesFromDevice(): Pick<
  UserAppSettings,
  'uiLanguage' | 'aiReplyLanguage'
> {
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
    return { uiLanguage: 'ja', aiReplyLanguage: 'ja' };
  }

  if (locale.startsWith('ko')) {
    return { uiLanguage: 'ko', aiReplyLanguage: 'ko' };
  }

  if (locale.startsWith('es')) {
    return { uiLanguage: 'es', aiReplyLanguage: 'es' };
  }

  if (locale.startsWith('fr')) {
    return { uiLanguage: 'fr', aiReplyLanguage: 'fr' };
  }

  return {
    uiLanguage: 'en',
    aiReplyLanguage: 'en',
  };
}

const DEVICE_DEFAULT_LANGUAGES = getDefaultLanguagesFromDevice();

function resolveStoredUILanguage(
  partial: Partial<UserAppSettings> | null | undefined,
  fallback: UILanguage
): UILanguage {
  // The reply-language selector is now the single language setting. Prefer it
  // when migrating installs that previously stored UI and reply separately.
  if (partial?.aiReplyLanguage !== undefined) {
    return normalizeUILanguage(partial.aiReplyLanguage);
  }
  if (partial?.uiLanguage !== undefined) {
    return normalizeUILanguage(partial.uiLanguage);
  }
  if (
    Array.isArray(partial?.learningLanguages) &&
    partial.learningLanguages.includes('zh')
  ) {
    return fallback.startsWith('zh') ? fallback : 'zh-TW';
  }
  return fallback;
}

export function getNativeUILanguageFromDevice(): UILanguage {
  return DEVICE_DEFAULT_LANGUAGES.uiLanguage;
}

export function getAIReplyLanguageForUILanguage(
  language: UILanguage
): AIReplyLanguage {
  return language;
}

export function normalizeNativeUILanguage(value: unknown): UILanguage {
  return normalizeUILanguage(value);
}

const DEVICE_DEFAULT_TTS_VOICE: TTSVoice = 'en-US-JennyNeural';

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
  imageTextLanguageMode: 'preferred',
  imageTextLanguages: ['en'],
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
  mainScreenAlbumGridCount: 3,
  mainScreenWordPopEnabled: true,
  mainScreenWordPopAlbumId: null,
  mainScreenAlbumOrder: [],
  reminderNotificationsEnabled: true,
  themeMode: 'system',
  stickerFontKey: DEFAULT_STICKER_FONT_KEY,
  stickerFontScalePercent: 100,
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

export function getInitialUserSettings(): UserAppSettings {
  return cachedUserSettings ?? DEFAULT_USER_SETTINGS;
}

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

export function getDefaultTTSVoiceForAIReplyLanguage(
  language: AIReplyLanguage
): TTSVoice {
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

export function getDefaultTTSVoiceForLearningLanguages(
  languages: LearningLanguage[]
): TTSVoice {
  return getDefaultTTSVoiceForAIReplyLanguage(
    getPrimaryAIReplyLanguageForLearningLanguages(languages)
  );
}

export function resolveTTSVoiceForLanguage(
  settings: Pick<UserAppSettings, 'ttsVoice' | 'ttsVoiceByLanguage'>,
  language: AIReplyLanguage
): TTSVoice {
  const mappedVoice = settings.ttsVoiceByLanguage?.[language];
  if (
    mappedVoice &&
    isTTSVoiceCompatibleWithAIReplyLanguage(mappedVoice, language)
  ) {
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

function mergeSettings(
  partial?: Partial<UserAppSettings> | null
): UserAppSettings {
  const shouldUseDevDefaultPlan =
    DEV_BYPASS_ENABLED && DEV_DEFAULT_PLAN !== 'free';
  const normalizedPlanType = normalizeEntitlementMode(
    shouldUseDevDefaultPlan
      ? DEV_DEFAULT_PLAN
      : (partial?.planType ??
          partial?.entitlementMode ??
          DEFAULT_USER_SETTINGS.planType)
  );
  const learningLanguages = normalizeLearningLanguages(
    partial?.learningLanguages
  );
  const imageTextLanguages: LearningLanguage[] = ['en'];
  const imageTextLanguageMode: ImageTextLanguageMode = 'preferred';
  const primaryLearningLanguage =
    getPrimaryAIReplyLanguageForLearningLanguages(learningLanguages);
  const uiLanguage = resolveStoredUILanguage(
    partial,
    DEFAULT_USER_SETTINGS.uiLanguage
  );
  const mergedVoiceMap: Partial<Record<AIReplyLanguage, TTSVoice>> = {
    ...DEFAULT_USER_SETTINGS.ttsVoiceByLanguage,
    ...(partial?.ttsVoiceByLanguage ?? {}),
  };
  if (
    partial?.ttsVoice &&
    isTTSVoiceCompatibleWithAIReplyLanguage(
      partial.ttsVoice,
      primaryLearningLanguage
    )
  ) {
    mergedVoiceMap[primaryLearningLanguage] = partial.ttsVoice;
  }
  const resolvedCurrentVoice = resolveTTSVoiceForLanguage(
    {
      ttsVoice:
        partial?.ttsVoice ??
        getDefaultTTSVoiceForLearningLanguages(learningLanguages),
      ttsVoiceByLanguage: mergedVoiceMap,
    },
    primaryLearningLanguage
  );
  const rawMainScreenAlbumGridCount = partial?.mainScreenAlbumGridCount;
  const mainScreenAlbumGridCount =
    rawMainScreenAlbumGridCount === 3 || rawMainScreenAlbumGridCount === 6
      ? rawMainScreenAlbumGridCount
      : DEFAULT_USER_SETTINGS.mainScreenAlbumGridCount;
  const mainScreenAlbumOrder = Array.isArray(partial?.mainScreenAlbumOrder)
    ? partial.mainScreenAlbumOrder
        .filter((albumId): albumId is string => typeof albumId === 'string')
        .map((albumId) => albumId.trim())
        .filter(Boolean)
    : DEFAULT_USER_SETTINGS.mainScreenAlbumOrder;
  const themeMode: ThemeMode =
    partial?.themeMode === 'light' || partial?.themeMode === 'dark'
      ? partial.themeMode
      : 'system';
  return {
    ...DEFAULT_USER_SETTINGS,
    ...partial,
    entitlementMode: normalizedPlanType,
    planType: normalizedPlanType,
    uiLanguage,
    aiReplyLanguage: uiLanguage,
    learningLanguages,
    imageTextLanguageMode,
    imageTextLanguages,
    ttsVoice: resolvedCurrentVoice,
    ttsVoiceByLanguage: mergedVoiceMap,
    mainScreenAlbumGridCount,
    mainScreenWordPopEnabled:
      typeof partial?.mainScreenWordPopEnabled === 'boolean'
        ? partial.mainScreenWordPopEnabled
        : DEFAULT_USER_SETTINGS.mainScreenWordPopEnabled,
    mainScreenWordPopAlbumId:
      typeof partial?.mainScreenWordPopAlbumId === 'string' &&
      partial.mainScreenWordPopAlbumId.trim()
        ? partial.mainScreenWordPopAlbumId.trim()
        : null,
    mainScreenAlbumOrder,
    reminderNotificationsEnabled:
      typeof partial?.reminderNotificationsEnabled === 'boolean'
        ? partial.reminderNotificationsEnabled
        : DEFAULT_USER_SETTINGS.reminderNotificationsEnabled,
    themeMode,
    stickerFontScalePercent:
      typeof partial?.stickerFontScalePercent === 'number' &&
      Number.isFinite(partial.stickerFontScalePercent)
        ? Math.max(
            75,
            Math.min(125, Math.round(partial.stickerFontScalePercent / 5) * 5)
          )
        : DEFAULT_USER_SETTINGS.stickerFontScalePercent,
    trialStartedAt:
      typeof partial?.trialStartedAt === 'string' &&
      partial.trialStartedAt.trim()
        ? partial.trialStartedAt
        : null,
    trialEndsAt:
      typeof partial?.trialEndsAt === 'string' && partial.trialEndsAt.trim()
        ? partial.trialEndsAt
        : null,
    subscriptionExpiresAt:
      typeof partial?.subscriptionExpiresAt === 'string' &&
      partial.subscriptionExpiresAt.trim()
        ? partial.subscriptionExpiresAt
        : null,
    lastEntitlementSyncAt:
      typeof partial?.lastEntitlementSyncAt === 'string' &&
      partial.lastEntitlementSyncAt.trim()
        ? partial.lastEntitlementSyncAt
        : null,
    personalization: {
      ...DEFAULT_USER_SETTINGS.personalization,
      ...(partial?.personalization ?? {}),
      aiBreakdownMode: normalizeAIBreakdownMode(
        partial?.personalization?.aiBreakdownMode
      ),
    },
  };
}

export async function loadUserSettings(): Promise<UserAppSettings> {
  const scopeId = await getSettingsScopeId();
  try {
    const raw = await AsyncStorage.getItem(buildSettingsStorageKey(scopeId));
    if (!raw) {
      const defaults = mergeSettings(null);
      if (await isCurrentSettingsScope(scopeId)) {
        publishCachedSettings(defaults);
      }
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<UserAppSettings>;
    const merged = mergeSettings(parsed);
    if (await isCurrentSettingsScope(scopeId)) {
      publishCachedSettings(merged);
    }
    return merged;
  } catch (error) {
    console.error('[Settings] Failed to load user settings:', error);
    const defaults = mergeSettings(null);
    if (await isCurrentSettingsScope(scopeId)) {
      publishCachedSettings(defaults);
    }
    return defaults;
  }
}

export async function hasStoredUserSettings(): Promise<boolean> {
  try {
    const scopeId = await getSettingsScopeId();
    return Boolean(
      await AsyncStorage.getItem(buildSettingsStorageKey(scopeId))
    );
  } catch {
    return false;
  }
}

export async function saveUserSettings(next: UserAppSettings): Promise<void> {
  const scopeId = await getSettingsScopeId();
  const merged = mergeSettings(next);
  await AsyncStorage.setItem(
    buildSettingsStorageKey(scopeId),
    JSON.stringify(merged)
  );
  if (await isCurrentSettingsScope(scopeId)) {
    publishCachedSettings(merged, true);
  }
}

export async function clearUserSettings(): Promise<void> {
  const scopeId = await getSettingsScopeId();
  const defaults = mergeSettings(null);
  await AsyncStorage.multiRemove([
    buildSettingsStorageKey(scopeId),
    SETTINGS_STORAGE_KEY,
  ]);
  if (await isCurrentSettingsScope(scopeId)) {
    publishCachedSettings(defaults, true);
  }
}

export function subscribeUserSettings(
  listener: (settings: UserAppSettings) => void
): () => void {
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
    aiBreakdownMode: normalizeAIBreakdownMode(
      settings.personalization.aiBreakdownMode
    ),
  };
}
