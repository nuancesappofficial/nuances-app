import React from 'react';
import { Text, type TextStyle } from 'react-native';
import { colorWithAlpha, type RevealBand } from '../../../features/createCard/steadyReveal';

const HIDDEN: TextStyle = { color: 'transparent', backgroundColor: 'transparent', textDecorationColor: 'transparent' };

/**
 * Renders reveal bands as nested Text runs. Hidden runs stay in the layout as
 * transparent text; fading runs use the base colour at the band's opacity.
 * `boldStyle(alpha)` styles highlighted runs (it must keep the same font
 * weight at every alpha so widths never change).
 */
export function renderRevealRuns(
  bands: readonly RevealBand[],
  opts: { color?: string; boldStyle: (alpha: number) => TextStyle; keyPrefix?: string }
): React.ReactNode[] {
  const prefix = opts.keyPrefix ?? 'run';
  return bands.map((band, i) => {
    const key = `${prefix}-${i}`;
    if (band.alpha <= 0) {
      return (
        <Text key={key} style={[band.isBold ? opts.boldStyle(0) : null, HIDDEN]}>
          {band.text}
        </Text>
      );
    }
    if (band.alpha >= 1) {
      return band.isBold ? (
        <Text key={key} style={opts.boldStyle(1)}>
          {band.text}
        </Text>
      ) : (
        <React.Fragment key={key}>{band.text}</React.Fragment>
      );
    }
    const fadeColor = opts.color ? { color: colorWithAlpha(opts.color, band.alpha) } : null;
    return (
      <Text key={key} style={band.isBold ? [fadeColor, opts.boldStyle(band.alpha)] : fadeColor}>
        {band.text}
      </Text>
    );
  });
}
