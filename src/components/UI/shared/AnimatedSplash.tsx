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
import Svg, { Polygon } from 'react-native-svg';
import Reanimated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import { resolveThemeColors } from '../../../theme/colors';

const DEFAULT_LOGO = require('../../../../assets/app_icons/icon_cutout2.png');

const SPARK_SIZE = 34;
const LOGO_SIZE = 136;
const SHARD_TILE_WIDTH = 148;
const SHARD_TILE_HEIGHT = 128;
const SHARD_STEP_X = SHARD_TILE_WIDTH * 0.76;
const SHARD_STEP_Y = SHARD_TILE_HEIGHT * 0.7;
const SHARD_SHAPES = [
  '0,8 112,0 120,82 18,100',
  '10,0 120,14 100,100 0,82',
  '0,0 92,8 120,96 22,100',
  '18,0 120,0 108,88 0,100',
  '0,20 104,0 120,100 12,86',
  '8,0 120,26 94,100 0,92',
];
const SHARD_SHADE_OPACITIES = [0.92, 0.82, 0.74, 0.64, 0.54, 0.46];

type AnimatedSplashProps = {
  ready: boolean;
  onFinished?: () => void;
  logoSource?: ImageSourcePropType;
};

type Palette = ReturnType<typeof resolveThemeColors>;

function useSplashPalette(colorScheme: ColorSchemeName) {
  return React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
}

function SparkIndicator({ palette, pulseStyle }: { palette: Palette; pulseStyle: object }) {
  return (
    <Reanimated.View style={[styles.sparkWrap, pulseStyle]}>
      <View
        style={[
          styles.sparkBracket,
          styles.sparkBracketLeft,
          { borderColor: palette.navActive, shadowColor: palette.navActive },
        ]}
      />
      <View
        style={[
          styles.sparkBracket,
          styles.sparkBracketRight,
          { borderColor: palette.navActive, shadowColor: palette.navActive },
        ]}
      />
    </Reanimated.View>
  );
}

function ShardTile({
  introProgress,
  wipeProgress,
  pulseProgress,
  palette,
  index,
  width,
  height,
  x,
  y,
  delay,
  exitDelay,
}: {
  introProgress: SharedValue<number>;
  wipeProgress: SharedValue<number>;
  pulseProgress: SharedValue<number>;
  palette: Palette;
  index: number;
  width: number;
  height: number;
  x: number;
  y: number;
  delay: number;
  exitDelay: number;
}) {
  const shape = SHARD_SHAPES[index % SHARD_SHAPES.length];
  const shadeOpacity = SHARD_SHADE_OPACITIES[index % SHARD_SHADE_OPACITIES.length];
  const fillColor = index % 3 === 0 ? palette.containerBg : palette.screenBg;
  const animatedStyle = useAnimatedStyle(() => {
    const enter = interpolate(
      introProgress.value,
      [delay, delay + 0.18],
      [0, 1],
      Extrapolation.CLAMP
    );
    const exit = interpolate(
      wipeProgress.value,
      [exitDelay, exitDelay + 0.22],
      [0, 1],
      Extrapolation.CLAMP
    );
    const breathingScale = interpolate(pulseProgress.value, [0, 0.5, 1], [0.996, 1.006, 0.996]);
    const scale = Math.max(0.001, (0.9 + enter * 0.1) * (1 - exit * 0.14) * breathingScale);
    const rotateZ = (1 - enter) * ((index % 2 === 0 ? -1 : 1) * 4) + exit * ((index % 2 === 0 ? 1 : -1) * 5);

    return {
      opacity: enter * (1 - exit),
      transform: [
        { rotateZ: `${rotateZ}deg` },
        { scale },
      ],
    };
  }, [delay, exitDelay, index]);

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        styles.shardTile,
        {
          left: x,
          top: y,
        },
        animatedStyle,
      ]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 120 100">
        <Polygon
          points={shape}
          fill={fillColor}
          opacity={shadeOpacity}
        />
        <Polygon points={shape} fill={palette.mutedSurface} opacity={0.24} />
      </Svg>
    </Reanimated.View>
  );
}

function ShardField({
  introProgress,
  wipeProgress,
  pulseProgress,
  palette,
  width,
  height,
}: {
  introProgress: SharedValue<number>;
  wipeProgress: SharedValue<number>;
  pulseProgress: SharedValue<number>;
  palette: Palette;
  width: number;
  height: number;
}) {
  const tiles = React.useMemo(() => {
    const columns = Math.ceil(width / SHARD_STEP_X) + 4;
    const rows = Math.ceil(height / SHARD_STEP_Y) + 4;
    const entranceX = -width * 0.12;
    const entranceY = height * 0.96;
    const exitX = width * 1.08;
    const exitY = -height * 0.14;
    const maxDistance = Math.hypot(width * 1.22, height * 1.1);
    const nextTiles: Array<{ id: string; x: number; y: number; delay: number; exitDelay: number }> = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const x = col * SHARD_STEP_X - SHARD_TILE_WIDTH * 1.4 + ((row + col) % 3) * 10;
        const y = row * SHARD_STEP_Y + (col % 2 === 0 ? 0 : SHARD_STEP_Y / 2) - SHARD_TILE_HEIGHT * 1.2;
        const centerX = x + SHARD_TILE_WIDTH / 2;
        const centerY = y + SHARD_TILE_HEIGHT / 2;
        const delay = Math.min(0.74, (Math.hypot(centerX - entranceX, centerY - entranceY) / maxDistance) * 0.74);
        const exitDelay = Math.min(0.7, (Math.hypot(centerX - exitX, centerY - exitY) / maxDistance) * 0.7);
        nextTiles.push({ id: `${row}-${col}`, x, y, delay, exitDelay });
      }
    }

    return nextTiles;
  }, [height, width]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {tiles.map((tile, index) => (
        <ShardTile
          key={tile.id}
          introProgress={introProgress}
          wipeProgress={wipeProgress}
          pulseProgress={pulseProgress}
          palette={palette}
          index={index}
          width={width}
          height={height}
          x={tile.x}
          y={tile.y}
          delay={tile.delay}
          exitDelay={tile.exitDelay}
        />
      ))}
    </View>
  );
}

export default function AnimatedSplash({
  ready,
  onFinished,
  logoSource = DEFAULT_LOGO,
}: AnimatedSplashProps) {
  const colorScheme = useColorScheme();
  const palette = useSplashPalette(colorScheme);
  const { width, height } = useWindowDimensions();
  const finishRef = React.useRef(onFinished);
  const pulse = useSharedValue(0);
  const indicatorScale = useSharedValue(1);
  const indicatorOpacity = useSharedValue(1);
  const logoScale = useSharedValue(0);
  const logoOpacity = useSharedValue(0);
  const shardIntroProgress = useSharedValue(0);
  const wipeProgress = useSharedValue(0);

  React.useEffect(() => {
    finishRef.current = onFinished;
  }, [onFinished]);

  React.useEffect(() => {
    shardIntroProgress.value = withTiming(1, {
      duration: 1180,
      easing: Easing.out(Easing.cubic),
    });
    logoOpacity.value = withTiming(1, {
      duration: 120,
      easing: Easing.out(Easing.quad),
    });
    logoScale.value = withDelay(
      160,
      withSpring(1, {
        stiffness: 440,
        damping: 18,
        mass: 0.74,
        overshootClamping: false,
        energyThreshold: 0.001,
      })
    );
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 1600,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      false
    );

    return () => {
      cancelAnimation(pulse);
    };
  }, [logoOpacity, logoScale, pulse, shardIntroProgress]);

  React.useEffect(() => {
    if (!ready) {
      indicatorScale.value = 1;
      indicatorOpacity.value = 1;
      wipeProgress.value = 0;
      return;
    }

    indicatorScale.value = withTiming(0, {
      duration: 130,
      easing: Easing.in(Easing.cubic),
    });
    indicatorOpacity.value = withTiming(0, {
      duration: 90,
      easing: Easing.out(Easing.quad),
    });
    logoScale.value = withDelay(1180, withTiming(0.001, {
      duration: 560,
      easing: Easing.inOut(Easing.cubic),
    }));
    wipeProgress.value = withDelay(
      1180,
      withTiming(
        1,
        {
          duration: 720,
          easing: Easing.inOut(Easing.cubic),
        },
        (finished) => {
          if (finished && finishRef.current) {
            runOnJS(finishRef.current)();
          }
        }
      )
    );
  }, [indicatorOpacity, indicatorScale, logoOpacity, logoScale, ready, wipeProgress]);

  const sparkStyle = useAnimatedStyle(() => {
    const pulseScale = interpolate(pulse.value, [0, 0.5, 1], [0.9, 1.1, 0.9]);
    return {
      opacity: indicatorOpacity.value,
      transform: [{ scale: indicatorScale.value * pulseScale }],
    };
  });

  const logoStyle = useAnimatedStyle(() => {
    const exit = wipeProgress.value;
    const pulsingScale = interpolate(pulse.value, [0, 0.5, 1], [0.985, 1.035, 0.985]);
    const exitTranslateX = exit * width * 0.48;
    const exitTranslateY = -exit * height * 0.42;
    return {
      opacity: logoOpacity.value,
      transform: [
        { translateX: exitTranslateX },
        { translateY: exitTranslateY },
        { scale: logoScale.value * pulsingScale },
      ],
    };
  }, [height, width]);

  const logoHaloStyle = useAnimatedStyle(() => {
    const haloScale = interpolate(logoScale.value, [0, 1], [0.78, 1.2], Extrapolation.CLAMP);
    return {
      opacity: interpolate(logoScale.value, [0, 1], [0, 0.2], Extrapolation.CLAMP),
      transform: [{ scale: haloScale }],
    };
  });

  return (
    <View pointerEvents="none" style={styles.root}>
      <ShardField
        introProgress={shardIntroProgress}
        wipeProgress={wipeProgress}
        pulseProgress={pulse}
        palette={palette}
        width={width}
        height={height}
      />

      <View style={styles.centerStage}>
        <SparkIndicator palette={palette} pulseStyle={sparkStyle} />
        <Reanimated.View
          style={[
            styles.logoHalo,
            {
              backgroundColor: palette.navActive,
            },
            logoHaloStyle,
          ]}
        />
        <Reanimated.View
          style={[
            styles.logoCard,
            {
              borderColor: palette.navCapsuleBorder,
              backgroundColor: palette.containerBg,
              shadowColor: palette.navActive,
            },
            logoStyle,
          ]}
        >
          <Image source={logoSource} style={styles.logoImage} resizeMode="contain" />
        </Reanimated.View>
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
  shardTile: {
    position: 'absolute',
    width: SHARD_TILE_WIDTH,
    height: SHARD_TILE_HEIGHT,
  },
  centerStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkWrap: {
    position: 'absolute',
    width: SPARK_SIZE,
    height: SPARK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sparkBracket: {
    width: 11,
    height: 24,
    borderTopWidth: 3,
    borderBottomWidth: 3,
    shadowOpacity: 0.26,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  sparkBracketLeft: {
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  sparkBracketRight: {
    borderRightWidth: 3,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  logoHalo: {
    position: 'absolute',
    width: LOGO_SIZE * 1.24,
    height: LOGO_SIZE * 1.24,
    borderRadius: BUTTON_TOKENS.radius.pill,
  },
  logoCard: {
    position: 'absolute',
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: BUTTON_TOKENS.radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.26,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  logoImage: {
    width: '86%',
    height: '86%',
  },
});
