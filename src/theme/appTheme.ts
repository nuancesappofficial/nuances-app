import type { AppThemeName } from '@services/settings/userSettings';

export type AppThemePalette = {
  key: AppThemeName;
  screenBg: string;
  containerBg: string;
  textOnContainer: string;
  textOnScreen: string;
  mutedText: string;
};

export const APP_THEME_PALETTES: Record<AppThemeName, AppThemePalette> = {
  blue: {
    key: 'blue',
    screenBg: '#02213D',
    containerBg: '#4EAFF4',
    textOnContainer: '#1C3E63',
    textOnScreen: '#EAF3FF',
    mutedText: '#7A8FA6',
  },
  black: {
    key: 'black',
    screenBg: '#050608',
    containerBg: '#171A20',
    textOnContainer: '#F4F7FB',
    textOnScreen: '#F4F7FB',
    mutedText: '#8A93A3',
  },
  white: {
    key: 'white',
    screenBg: '#F3F6FA',
    containerBg: '#FFFFFF',
    textOnContainer: '#0F1724',
    textOnScreen: '#0F1724',
    mutedText: '#6B7280',
  },
};

export function getAppThemePalette(theme: AppThemeName): AppThemePalette {
  return APP_THEME_PALETTES[theme] ?? APP_THEME_PALETTES.blue;
}
