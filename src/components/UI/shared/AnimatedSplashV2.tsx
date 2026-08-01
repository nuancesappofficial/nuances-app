import React from 'react';
import {
  Image,
  StyleSheet,
  View,
  useColorScheme,
  useWindowDimensions,
  type ColorSchemeName,
  type ImageSourcePropType,
} from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { resolveThemeColors } from '../../../theme/colors';
import { useAppIsActive } from '../../../hooks/useAppIsActive';

const DEFAULT_LOGO = require('../../../../assets/app_icons/icon_cutout2.png');

const LOGO_SIZE = 142;
const LOGO_HOLD_MS = 120;
const WIPE_DURATION_MS = 430;
const EXIT_FALLBACK_MS = 1400;

type AnimatedSplashV2Props = {
  ready: boolean;
  onAnimationComplete?: () => void;
  onFinished?: () => void;
  children?: React.ReactNode;
  logoSource?: ImageSourcePropType;
  showLogo?: boolean;
};

type Palette = ReturnType<typeof resolveThemeColors>;

type WipePanelProps = {
  color: string;
  offset: number;
  progress: SharedValue<number>;
  panelSize: number;
  width: number;
  height: number;
  zIndex: number;
};

function resolveSplashPalette(colorScheme: ColorSchemeName) {
  return resolveThemeColors(colorScheme);
}

function parseHexColor(hex: string) {
  const normalized = hex.replace('#', '').trim();
  if (normalized.length !== 6) return null;

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  if ([red, green, blue].some((value) => Number.isNaN(value))) return null;
  return { red, green, blue };
}

function toRgbString(red: number, green: number, blue: number) {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `rgb(${clamp(red)}, ${clamp(green)}, ${clamp(blue)})`;
}

function shadeFromPrimary(primary: string, amount: number) {
  const rgb = parseHexColor(primary);
  if (!rgb) return primary;

  if (amount >= 0) {
    return toRgbString(
      rgb.red + (255 - rgb.red) * amount,
      rgb.green + (255 - rgb.green) * amount,
      rgb.blue + (255 - rgb.blue) * amount
    );
  }

  const multiplier = 1 + amount;
  return toRgbString(rgb.red * multiplier, rgb.green * multiplier, rgb.blue * multiplier);
}

function buildPrimaryShades(palette: Palette) {
  const primary = palette.navActive;
  return [
    shadeFromPrimary(primary, -0.24),
    shadeFromPrimary(primary, -0.08),
    shadeFromPrimary(primary, 0.16),
  ];
}

function WipePanel({ color, offset, progress, panelSize, width, height, zIndex }: WipePanelProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value },
      { translateY: progress.value },
      { rotateZ: '-45deg' },
    ],
  }));

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        styles.wipePanel,
        {
          width: panelSize,
          height: panelSize,
          left: width / 2 - panelSize / 2 + offset,
          top: height / 2 - panelSize / 2 + offset,
          backgroundColor: color,
          zIndex,
        },
        animatedStyle,
      ]}
    />
  );
}

export default function AnimatedSplashV2({
  ready,
  onAnimationComplete,
  onFinished,
  children,
  logoSource = DEFAULT_LOGO,
  showLogo = true,
}: AnimatedSplashV2Props) {
  const isAppActive = useAppIsActive();
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveSplashPalette(colorScheme), [colorScheme]);
  const shades = React.useMemo(() => buildPrimaryShades(palette), [palette]);
  const { width, height } = useWindowDimensions();
  const completionRef = React.useRef(onAnimationComplete ?? onFinished);
  const hasStartedExitRef = React.useRef(false);
  const hasCompletedExitRef = React.useRef(false);
  const logoScale = useSharedValue(1);
  const logoExitProgress = useSharedValue(0);
  const logoPulse = useSharedValue(0);
  const panelOneProgress = useSharedValue(0);
  const panelTwoProgress = useSharedValue(0);
  const panelThreeProgress = useSharedValue(0);

  React.useEffect(() => {
    completionRef.current = onAnimationComplete ?? onFinished;
  }, [onAnimationComplete, onFinished]);

  const completeExit = React.useCallback(() => {
    if (hasCompletedExitRef.current) return;
    hasCompletedExitRef.current = true;
    cancelAnimation(logoPulse);
    completionRef.current?.();
  }, [logoPulse]);

  React.useEffect(() => {
    if (!ready) return;
    // Native animations can be interrupted while iOS backgrounds the app.
    // Never let a missing animation callback leave the boot curtain mounted.
    const fallbackTimer = setTimeout(completeExit, EXIT_FALLBACK_MS);
    return () => clearTimeout(fallbackTimer);
  }, [completeExit, ready]);

  React.useEffect(() => {
    if (!isAppActive) {
      cancelAnimation(logoPulse);
      return;
    }
    logoPulse.value = withRepeat(
      withTiming(1, { duration: 1450, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );

    return () => {
      cancelAnimation(logoPulse);
    };
  }, [isAppActive, logoPulse]);

  React.useEffect(() => {
    if (!ready) {
      hasStartedExitRef.current = false;
      hasCompletedExitRef.current = false;
      cancelAnimation(logoScale);
      cancelAnimation(logoExitProgress);
      cancelAnimation(panelOneProgress);
      cancelAnimation(panelTwoProgress);
      cancelAnimation(panelThreeProgress);
      logoScale.value = 1;
      logoExitProgress.value = 0;
      panelOneProgress.value = 0;
      panelTwoProgress.value = 0;
      panelThreeProgress.value = 0;
      return;
    }

    if (hasStartedExitRef.current) return;
    hasStartedExitRef.current = true;

    const travelDistance = -Math.max(width, height) * 2.35;

    logoScale.value = withSpring(1.12, {
      stiffness: 250,
      damping: 15,
      mass: 1,
    });

    logoExitProgress.value = withDelay(
      LOGO_HOLD_MS,
      withTiming(1, {
        duration: WIPE_DURATION_MS + 150,
        easing: Easing.inOut(Easing.cubic),
      })
    );

    panelOneProgress.value = withDelay(
      LOGO_HOLD_MS,
      withTiming(travelDistance, {
        duration: WIPE_DURATION_MS,
        easing: Easing.inOut(Easing.cubic),
      })
    );
    panelTwoProgress.value = withDelay(
      LOGO_HOLD_MS + 100,
      withTiming(travelDistance, {
        duration: WIPE_DURATION_MS,
        easing: Easing.inOut(Easing.cubic),
      })
    );
    panelThreeProgress.value = withDelay(
      LOGO_HOLD_MS + 150,
      withTiming(
        travelDistance,
        {
          duration: WIPE_DURATION_MS,
          easing: Easing.inOut(Easing.cubic),
        },
        (finished) => {
          if (finished) {
            runOnJS(completeExit)();
          }
        }
      )
    );

  }, [completeExit, height, logoExitProgress, logoScale, panelOneProgress, panelThreeProgress, panelTwoProgress, ready, width]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(logoExitProgress.value, [0, 0.82, 1], [1, 1, 0], 'clamp'),
    transform: [
      {
        scale:
          logoScale.value *
          (0.985 +
            logoPulse.value *
              0.035 *
              interpolate(logoExitProgress.value, [0, 0.18, 1], [1, 0, 0], 'clamp')) *
          interpolate(logoExitProgress.value, [0, 1], [1, 0.02], 'clamp'),
      },
    ],
  }));

  const panelSize = Math.max(width, height) * 2.85;
  const shouldRenderLogo = showLogo || ready;

  return (
    <View style={styles.root} pointerEvents="none">
      {children}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <WipePanel
          color={shades[0]}
          offset={-40}
          progress={panelOneProgress}
          panelSize={panelSize}
          width={width}
          height={height}
          zIndex={1}
        />
        <WipePanel
          color={shades[1]}
          offset={0}
          progress={panelTwoProgress}
          panelSize={panelSize}
          width={width}
          height={height}
          zIndex={2}
        />
        <WipePanel
          color={shades[2]}
          offset={44}
          progress={panelThreeProgress}
          panelSize={panelSize}
          width={width}
          height={height}
          zIndex={3}
        />

        {shouldRenderLogo ? (
          <View style={styles.centerStage} pointerEvents="none">
            <Reanimated.View style={[styles.logoWrap, logoStyle]}>
              <Image source={logoSource} style={styles.logoImage} resizeMode="contain" />
            </Reanimated.View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 999,
  },
  wipePanel: {
    position: 'absolute',
  },
  centerStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
});
