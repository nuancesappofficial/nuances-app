import React, { useEffect, useState } from 'react';
import {
  Text as RNText,
  StyleSheet,
  type TextProps,
  type TextStyle,
} from 'react-native';
import {
  DEFAULT_USER_SETTINGS,
  subscribeUserSettings,
  type UserAppSettings,
} from '../../../services/settings/userSettings';

let globalFontScale = DEFAULT_USER_SETTINGS.stickerFontScalePercent / 100;
const scaleListeners = new Set<(scale: number) => void>();

subscribeUserSettings((settings: UserAppSettings) => {
  const nextScale = (settings.stickerFontScalePercent || 100) / 100;
  if (Math.abs(globalFontScale - nextScale) > 0.001) {
    globalFontScale = nextScale;
    scaleListeners.forEach((fn) => fn(nextScale));
  }
});

export function useGlobalTextScale(): number {
  const [scale, setScale] = useState(globalFontScale);
  useEffect(() => {
    setScale(globalFontScale);
    scaleListeners.add(setScale);
    return () => {
      scaleListeners.delete(setScale);
    };
  }, []);
  return scale;
}

export interface ScaledTextProps extends TextProps {
  ignoreAppTextScale?: boolean;
}

export const AppText = React.forwardRef<RNText, ScaledTextProps>(function AppText(
  { style, ignoreAppTextScale, allowFontScaling = false, ...rest },
  ref
) {
  const scale = useGlobalTextScale();

  let computedStyle = style;
  if (!ignoreAppTextScale && scale !== 1 && style) {
    const flat = StyleSheet.flatten(style) as TextStyle;
    if (flat && typeof flat.fontSize === 'number') {
      computedStyle = [
        style,
        {
          fontSize: Math.round(flat.fontSize * scale),
          ...(typeof flat.lineHeight === 'number'
            ? { lineHeight: Math.round(flat.lineHeight * scale) }
            : {}),
        },
      ];
    }
  }

  return (
    <RNText
      ref={ref}
      {...rest}
      style={computedStyle}
      allowFontScaling={allowFontScaling}
    />
  );
});

export default AppText;
