export type StickerFontKey = 'marker' | 'chalkboard' | 'noteworthy' | 'party' | 'snell';

export type StickerFontOption = {
  key: StickerFontKey;
  label: string;
  fontFamily: string;
  letterSpacing: number;
  fontWeight?: 'normal' | 'bold' | '700' | '900';
};

export const STICKER_FONT_ASSETS = {
  'PermanentMarker-Regular': require('../../assets/fonts/PermanentMarker-Regular.ttf'),
  'GochiHand-Regular': require('../../assets/fonts/GochiHand-Regular.ttf'),
  'PatrickHand-Regular': require('../../assets/fonts/PatrickHand-Regular.ttf'),
  'Pacifico-Regular': require('../../assets/fonts/Pacifico-Regular.ttf'),
  'DancingScript-Bold': require('../../assets/fonts/DancingScript-Bold.ttf'),
};

export const STICKER_FONT_OPTIONS: StickerFontOption[] = [
  {
    key: 'marker',
    label: 'Marker',
    fontFamily: 'PermanentMarker-Regular',
    letterSpacing: 0,
    fontWeight: 'normal',
  },
  {
    key: 'chalkboard',
    label: 'Chalk',
    fontFamily: 'GochiHand-Regular',
    letterSpacing: 0,
    fontWeight: 'bold',
  },
  {
    key: 'noteworthy',
    label: 'Note',
    fontFamily: 'PatrickHand-Regular',
    letterSpacing: 0,
    fontWeight: 'bold',
  },
  {
    key: 'party',
    label: 'Party',
    fontFamily: 'Pacifico-Regular',
    letterSpacing: 0,
    fontWeight: 'normal',
  },
  {
    key: 'snell',
    label: 'Script',
    fontFamily: 'DancingScript-Bold',
    letterSpacing: 0,
    fontWeight: 'bold',
  },
];

export const DEFAULT_STICKER_FONT_KEY: StickerFontKey = 'marker';

export function resolveStickerFont(key?: StickerFontKey | null): StickerFontOption {
  return STICKER_FONT_OPTIONS.find((option) => option.key === key) ?? STICKER_FONT_OPTIONS[0];
}
