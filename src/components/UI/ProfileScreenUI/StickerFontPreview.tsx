import React from 'react';
import Svg, { Text as SvgText } from 'react-native-svg';
import { resolveStickerFont, type StickerFontKey } from '../../../theme/stickerFonts';

type Props = {
  label: string;
  fontKey: StickerFontKey;
  width?: number;
  height?: number;
  fontSize?: number;
  strokeWidth?: number;
};

export default function StickerFontPreview({
  label,
  fontKey,
  width = 150,
  height = 42,
  fontSize = 24,
  strokeWidth = 5.2,
}: Props) {
  const stickerFont = resolveStickerFont(fontKey);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <SvgText
        x={width / 2}
        y={Math.round(height * 0.69)}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fontSize={fontSize}
        fontWeight="900"
        fontFamily={stickerFont.fontFamily}
        textAnchor="middle"
        letterSpacing={stickerFont.letterSpacing}
      >
        {label}
      </SvgText>
      <SvgText
        x={width / 2}
        y={Math.round(height * 0.69)}
        fill="#050505"
        fontSize={fontSize}
        fontWeight="900"
        fontFamily={stickerFont.fontFamily}
        textAnchor="middle"
        letterSpacing={stickerFont.letterSpacing}
      >
        {label}
      </SvgText>
    </Svg>
  );
}
