import { type ColorSchemeName } from 'react-native';

// Shared CTA tokens are split by usage so Upload Cache can be tuned independently.
export const UPLOAD_CACHE_CTA_COLOR = '#FF6B6B';
export const UPLOAD_CACHE_CTA_COLOR_BORDER = 'rgba(243,118,124,0.84)';

export const MODAL_CTA_COLOR = '#4EAFF4';
export const MODAL_CTA_COLOR_BORDER = 'rgba(78,175,244,0.72)';

export const TEXT_ON_CTA = '#F4EEF3';
// Backward-compatible aliases for existing modal/button imports.
export const CTA_COLOR = MODAL_CTA_COLOR;
export const CTA_COLOR_BORDER = MODAL_CTA_COLOR_BORDER;

const DARK_THEME_COLORS = {
  screenBg: '#02213D',
  containerBg: '#1E293B',
  textOnBg: '#EAF3FF',
  textOnContainer: '#F8FAFC',
  secondaryText: '#94A3B8',
  borderSubtle: '#334155',
  navBg: 'rgba(11,29,50,0.82)',
  navBorder: 'rgba(176,222,255,0.22)',
  navInactive: '#E6EEF7',
  navActive: '#4EAFF4',
  navCapsuleBg: 'rgba(150,210,255,0.23)',
  navCapsuleBorder: 'rgba(194,232,255,0.52)',
};

const LIGHT_THEME_COLORS = {
  screenBg: '#78BBDD',
  containerBg: '#F8FAFC',
  textOnBg: '#0F172A',
  textOnContainer: '#0F172A',
  secondaryText: '#94A3B8',
  borderSubtle: '#CBD5E1',
  navBg: '#FFFFFF',
  navBorder: '#E2E8F0',
  navInactive: '#94A3B8',
  navActive: '#4EAFF4',
  navCapsuleBg: 'rgba(78,175,244,0.14)',
  navCapsuleBorder: 'rgba(78,175,244,0.38)',
};

export function resolveThemeColors(colorScheme?: ColorSchemeName) {
  return colorScheme === 'light' ? LIGHT_THEME_COLORS : DARK_THEME_COLORS;
}

export const CONTAINER_BG = DARK_THEME_COLORS.containerBg;
export const SCREEN_BG = DARK_THEME_COLORS.screenBg;
export const TEXT_ON_BG = DARK_THEME_COLORS.textOnBg;
export const TEXT_ON_CONTAINER = DARK_THEME_COLORS.textOnContainer;
