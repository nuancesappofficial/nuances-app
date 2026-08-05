import { type ColorSchemeName } from 'react-native';

// Shared CTA tokens are split by usage so Upload Cache can be tuned independently.
export const UPLOAD_CACHE_CTA_COLOR = '#FF6B6B';
export const UPLOAD_CACHE_CTA_COLOR_BORDER = 'rgba(243,118,124,0.84)';

export const MODAL_CTA_COLOR = '#4EAFF4';
export const MODAL_CTA_COLOR_BORDER = 'rgba(78,175,244,0.72)';

export const TEXT_ON_CTA = '#F4EEF3';
export const CONTAINER_NEON_OUTLINE = 'rgba(78,175,244,0.30)';
export const CONTAINER_NEON_GLOW = 'rgba(78,175,244,0.24)';
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
  modalBg: '#02213D',
  modalOptionBg: 'rgba(255,255,255,0.1)',
  modalOptionBorder: 'rgba(255,255,255,0.14)',
  modalSecondaryButtonBg: '#FFFFFF',
  modalSecondaryButtonText: '#111111',
  mutedSurface: 'rgba(255,255,255,0.08)',
  destructiveBg: '#FF3B30',
  destructiveBorder: '#FF3B30',
  destructiveText: '#FFE8E5',
  albumCoverText: '#F8FAFC',
  albumCoverShadeStart: 'rgba(0,0,0,0)',
  albumCoverShadeMid: 'rgba(0,0,0,0.16)',
  albumCoverShadeEnd: 'rgba(0,0,0,0.36)',
  searchDropdownBg: 'rgba(3,10,20,0.98)',
  searchDropdownBorder: 'rgba(196,228,255,0.2)',
  searchDropdownDivider: 'rgba(196,228,255,0.09)',
  searchBackdropMask: 'rgba(0,0,0,0.62)',
  navBg: 'rgba(11,29,50,0.82)',
  navBorder: 'rgba(176,222,255,0.22)',
  navInactive: '#E6EEF7',
  navActive: '#4EAFF4',
  navCapsuleBg: 'rgba(150,210,255,0.23)',
  navCapsuleBorder: 'rgba(194,232,255,0.52)',
};

const LIGHT_THEME_COLORS = {
  screenBg: '#F1EBE3',
  containerBg: '#FFFFFF',
  textOnBg: '#0F172A',
  textOnContainer: '#0F172A',
  secondaryText: '#94A3B8',
  borderSubtle: '#D5DEE8',
  modalBg: '#FFFFFF',
  modalOptionBg: 'rgba(15,23,42,0.055)',
  modalOptionBorder: 'rgba(15,23,42,0.12)',
  modalSecondaryButtonBg: '#0F172A',
  modalSecondaryButtonText: '#F8FAFC',
  mutedSurface: 'rgba(15,23,42,0.055)',
  destructiveBg: '#FF6B6B',
  destructiveBorder: 'rgba(255,107,107,0.78)',
  destructiveText: '#FFFFFF',
  albumCoverText: '#1F2937',
  albumCoverShadeStart: 'rgba(255,255,255,0)',
  albumCoverShadeMid: 'rgba(255,255,255,0.22)',
  albumCoverShadeEnd: 'rgba(255,255,255,0.48)',
  searchDropdownBg: '#F8FAFC',
  searchDropdownBorder: 'rgba(15,23,42,0.16)',
  searchDropdownDivider: 'rgba(15,23,42,0.1)',
  searchBackdropMask: 'rgba(15,23,42,0.42)',
  navBg: 'rgba(255,255,255,0.96)',
  navBorder: '#D2DBE6',
  navInactive: '#6B7E95',
  navActive: '#4EAFF4',
  navCapsuleBg: 'rgba(78,175,244,0.2)',
  navCapsuleBorder: 'rgba(78,175,244,0.42)',
};

export function resolveThemeColors(colorScheme?: ColorSchemeName) {
  return colorScheme === 'light' ? LIGHT_THEME_COLORS : DARK_THEME_COLORS;
}

export const CONTAINER_BG = DARK_THEME_COLORS.containerBg;
export const SCREEN_BG = DARK_THEME_COLORS.screenBg;
export const TEXT_ON_BG = DARK_THEME_COLORS.textOnBg;
export const TEXT_ON_CONTAINER = DARK_THEME_COLORS.textOnContainer;
