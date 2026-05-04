export type StickerFontKey = 'marker' | 'chalkboard' | 'noteworthy' | 'party' | 'snell';

export type StickerFontOption = {
  key: StickerFontKey;
  label: string;
  fontFamily: string;
  letterSpacing: number;
};

export const STICKER_FONT_OPTIONS: StickerFontOption[] = [
  { key: 'marker', label: 'Marker', fontFamily: 'MarkerFelt-Wide', letterSpacing: -0.8 },
  { key: 'chalkboard', label: 'Chalk', fontFamily: 'ChalkboardSE-Bold', letterSpacing: -1.1 },
  { key: 'noteworthy', label: 'Note', fontFamily: 'Noteworthy-Bold', letterSpacing: -0.7 },
  { key: 'party', label: 'Party', fontFamily: 'PartyLET', letterSpacing: -0.5 },
  { key: 'snell', label: 'Script', fontFamily: 'SnellRoundhand-Black', letterSpacing: -0.35 },
];

export const DEFAULT_STICKER_FONT_KEY: StickerFontKey = 'marker';

export function resolveStickerFont(key?: StickerFontKey | null): StickerFontOption {
  return STICKER_FONT_OPTIONS.find((option) => option.key === key) ?? STICKER_FONT_OPTIONS[0];
}
