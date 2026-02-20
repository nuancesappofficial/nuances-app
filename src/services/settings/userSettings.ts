import AsyncStorage from '@react-native-async-storage/async-storage';

export type ClipboardMode = 'active' | 'passive';
export type LearningGoalPreset = 'ielts' | 'casual' | 'professional' | 'custom';
export type CefrPreset = 'a2' | 'b1' | 'b2' | 'c1' | 'custom';
export type DomainPreset = 'medical' | 'technology' | 'business' | 'custom';
export type TonePreset = 'brief' | 'detailed' | 'custom';

export type UserPersonalizationSettings = {
  learningGoalPreset: LearningGoalPreset;
  learningGoalCustom: string;
  cefrPreset: CefrPreset;
  cefrCustom: string;
  domainPreset: DomainPreset;
  domainCustom: string;
  tonePreset: TonePreset;
  toneCustom: string;
};

export type UserAppSettings = {
  clipboardMode: ClipboardMode;
  personalization: UserPersonalizationSettings;
};

const SETTINGS_STORAGE_KEY = 'user_app_settings_v1';

export const DEFAULT_USER_SETTINGS: UserAppSettings = {
  clipboardMode: 'passive',
  personalization: {
    learningGoalPreset: 'ielts',
    learningGoalCustom: '',
    cefrPreset: 'b2',
    cefrCustom: '',
    domainPreset: 'business',
    domainCustom: '',
    tonePreset: 'brief',
    toneCustom: '',
  },
};

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
