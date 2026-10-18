import { Platform } from 'react-native';

export type StickerFontKey = 'marker' | 'chalkboard' | 'noteworthy' | 'party' | 'snell';

export type StickerFontOption = {
  key: StickerFontKey;
  label: string;
  fontFamily: string;
  letterSpacing: number;
  fontWeight?: 'normal' | 'bold' | '700' | '900';
};

export const STICKER_FONT_ASSETS = {
  'NerkoOne-Regular': require('../../assets/fonts/NerkoOne-Regular.ttf'),
  'ComicNeue-Bold': require('../../assets/fonts/ComicNeue-Bold.ttf'),
  'Handlee-Regular': require('../../assets/fonts/Handlee-Regular.ttf'),
  'StyleScript-Regular': require('../../assets/fonts/StyleScript-Regular.ttf'),
  'PinyonScript-Regular': require('../../assets/fonts/PinyonScript-Regular.ttf'),
};

export const STICKER_FONT_OPTIONS: StickerFontOption[] = [
  {
    key: 'marker',
    label: 'Marker',
    fontFamily: Platform.select({ ios: 'MarkerFelt-Wide', default: 'NerkoOne-Regular' })!,
    letterSpacing: Platform.select({ ios: -0.8, default: 0 })!,
    fontWeight: Platform.select({ ios: undefined, default: 'normal' }),
  },
  {
    key: 'chalkboard',
    label: 'Chalk',
    fontFamily: Platform.select({ ios: 'ChalkboardSE-Bold', default: 'ComicNeue-Bold' })!,
    letterSpacing: Platform.select({ ios: -1.1, default: 0 })!,
    fontWeight: Platform.select({ ios: undefined, default: 'bold' }),
  },
  {
    key: 'noteworthy',
    label: 'Note',
    fontFamily: Platform.select({ ios: 'Noteworthy-Bold', default: 'Handlee-Regular' })!,
    letterSpacing: Platform.select({ ios: -0.7, default: 0 })!,
    fontWeight: Platform.select({ ios: undefined, default: 'normal' }),
  },
  {
    key: 'party',
    label: 'Party',
    fontFamily: Platform.select({ ios: 'PartyLET', default: 'StyleScript-Regular' })!,
    letterSpacing: Platform.select({ ios: -0.5, default: 0 })!,
    fontWeight: Platform.select({ ios: undefined, default: 'normal' }),
  },
  {
    key: 'snell',
    label: 'Script',
    fontFamily: Platform.select({ ios: 'SnellRoundhand-Black', default: 'PinyonScript-Regular' })!,
    letterSpacing: Platform.select({ ios: -0.35, default: 0 })!,
    fontWeight: Platform.select({ ios: undefined, default: 'normal' }),
  },
];

export const DEFAULT_STICKER_FONT_KEY: StickerFontKey = 'marker';

export function resolveStickerFont(key?: StickerFontKey | null): StickerFontOption {
  return STICKER_FONT_OPTIONS.find((option) => option.key === key) ?? STICKER_FONT_OPTIONS[0];
}
