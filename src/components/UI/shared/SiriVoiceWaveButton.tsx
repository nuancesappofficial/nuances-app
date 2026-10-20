import React from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';

const NUM_BARS = 19;
const BAR_RESTING_SCALE = 0.06;
const DEFAULT_SIZE = 144; // 1.5x of previous 96px (radius 72px)
const BAR_MAX_HEIGHT = 76;
const BAR_WIDTH = 4;
const BAR_GAP = 4;
// Analyzing state: the frozen waveform is scanned left → right.
const SCAN_DIM_OPACITY = 0.35;
const SCAN_BAR_STAGGER_MS = 55;
const SCAN_RISE_MS = 140;
const SCAN_FALL_MS = 260;

interface SiriVoiceWaveButtonProps {
  isRecording: boolean;
  isAnalyzing?: boolean;
  metering?: number | Animated.Value;
  onPress: () => void;
  disabled?: boolean;
  pressedStyle?: StyleProp<ViewStyle>;
  idleBackgroundColor?: string;
  activeBackgroundColor?: string;
  idleBorderColor?: string;
  activeBorderColor?: string;
  glowColor?: string;
  iconColor?: string;
  activeBarColor?: string;
  inactiveBarColor?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export default function SiriVoiceWaveButton({
  isRecording,
  isAnalyzing = false,
  metering,
  onPress,
  disabled = false,
  pressedStyle,
  style,
  idleBackgroundColor = '#1c2638',
  activeBackgroundColor = 'rgba(28, 62, 99, 0.95)',
  idleBorderColor = '#2e3d57',
  activeBorderColor = '#2997FF',
  glowColor = '#2997FF',
  iconColor = '#FFFFFF',
  activeBarColor = '#2997FF',
  inactiveBarColor = '#4EAFF4',
  size = DEFAULT_SIZE,
  accessibilityLabel = '錄音按鈕',
}: SiriVoiceWaveButtonProps) {
  const reduceMotion = useReducedMotion();
  // Bars stay visible while recording AND while analyzing (frozen recording).
  const showWave = isRecording || isAnalyzing;

  // Physical on-press spring scale (0.94 on press, 1.0 on release) - Native Driver
  const pressScale = React.useRef(new Animated.Value(1)).current;

  // Glow / Container animation (0 = idle, 1 = recording) - JS Driver (colors/shadows)
  const glowAnim = React.useRef(new Animated.Value(isRecording ? 1 : 0)).current;

  // Icon <-> Waveform cross-fade & scale transition (0 = mic, 1 = wave) - Native Driver
  const transitionAnim = React.useRef(new Animated.Value(isRecording ? 1 : 0)).current;

  // Discrete bars animating on GPU scaleY with native driver
  const barScales = React.useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(BAR_RESTING_SCALE)),
  ).current;

  // Per-bar opacity for the analyzing scan (Native Driver)
  const barOpacities = React.useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(1)),
  ).current;

  // Symmetric circular mask envelope (bars naturally conform to circle)
  const envelopes = React.useMemo(() => {
    return Array.from({ length: NUM_BARS }, (_, i) => {
      const normX = (i / (NUM_BARS - 1)) * 2 - 1; // -1 to 1
      const circularMask = Math.sqrt(Math.max(0.12, 1 - normX * normX * 0.88));
      const centerDist = Math.abs(i - (NUM_BARS - 1) / 2) / ((NUM_BARS - 1) / 2);
      const centerFactor = Math.max(0.18, 1 - centerDist * 0.62);
      return circularMask * centerFactor;
    });
  }, []);

  // Handle on-press scale down and bounce back (Native Driver)
  const handlePressIn = React.useCallback(() => {
    if (disabled || isAnalyzing) return;
    Animated.spring(pressScale, {
      toValue: 0.94,
      tension: 160,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [disabled, isAnalyzing, pressScale]);

  const handlePressOut = React.useCallback(() => {
    Animated.spring(pressScale, {
      toValue: 1.0,
      tension: 140,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [pressScale]);

  // Animate button glow container (JS Driver for color/shadow)
  React.useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: isRecording ? 1 : 0,
      duration: isRecording ? 240 : 260,
      useNativeDriver: false,
    }).start();
  }, [isRecording, glowAnim]);

  // Animate Icon <-> Waveform transition (both on start and end) - Native Driver
  React.useEffect(() => {
    Animated.spring(transitionAnim, {
      toValue: showWave ? 1 : 0,
      tension: 65,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [showWave, transitionAnim]);

  // Analyzing: scan the frozen waveform left → right in a loop.
  React.useEffect(() => {
    if (!isAnalyzing) {
      barOpacities.forEach((opacity) => opacity.setValue(1));
      return;
    }
    if (reduceMotion) {
      barOpacities.forEach((opacity) => opacity.setValue(0.5));
      return;
    }
    barOpacities.forEach((opacity) => opacity.setValue(SCAN_DIM_OPACITY));
    const scan = Animated.loop(
      Animated.stagger(
        SCAN_BAR_STAGGER_MS,
        barOpacities.map((opacity) =>
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 1,
              duration: SCAN_RISE_MS,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: SCAN_DIM_OPACITY,
              duration: SCAN_FALL_MS,
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    );
    scan.start();
    return () => {
      scan.stop();
    };
  }, [isAnalyzing, reduceMotion, barOpacities]);

  // Update bar scales whenever audio metering changes (Native Driver)
  const applyMetering = React.useCallback(
    (rawVal: number) => {
      if (!isRecording) return;
      let normalized = 0;
      if (rawVal <= 1 && rawVal >= 0) {
        normalized = rawVal;
      } else {
        // dB input: silence ~ -55dB, speaking ~ -28 to -5 dB
        normalized = Math.max(0, Math.min(1, (rawVal + 50) / 45));
      }

      const animations = barScales.map((barScale, i) => {
        const targetScale = Math.max(
          BAR_RESTING_SCALE,
          Math.min(1.0, normalized * envelopes[i]),
        );
        return Animated.timing(barScale, {
          toValue: targetScale,
          duration: 65,
          useNativeDriver: true,
        });
      });

      Animated.parallel(animations).start();
    },
    [barScales, envelopes, isRecording],
  );

  // Reset bars once recording AND analysis are both over; while analyzing the
  // last recorded shape stays frozen (Native Driver)
  React.useEffect(() => {
    if (!isRecording && !isAnalyzing) {
      const resets = barScales.map((barScale) =>
        Animated.timing(barScale, {
          toValue: BAR_RESTING_SCALE,
          duration: 150,
          useNativeDriver: true,
        }),
      );
      Animated.parallel(resets).start();
    }
  }, [isRecording, isAnalyzing, barScales]);

  // Listen to metering changes
  React.useEffect(() => {
    if (!isRecording || metering === undefined) return;

    if (metering instanceof Animated.Value) {
      const listenerId = metering.addListener(({ value }) => {
        applyMetering(value);
      });
      return () => {
        metering.removeListener(listenerId);
      };
    } else if (typeof metering === 'number') {
      applyMetering(metering);
    }
  }, [isRecording, metering, applyMetering]);

  // Glow & Shadow style - applied to unclipped glow layer
  const radius = size / 2;
  const animatedGlowStyle = {
    backgroundColor: glowAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [idleBackgroundColor, activeBackgroundColor],
    }),
    borderColor: glowAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [idleBorderColor, activeBorderColor],
    }),
    // Soft coloured shadow (no black drop shadow, no neon halo)
    shadowColor: glowColor,
    shadowOpacity: glowAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.35, 0.55],
    }),
    shadowRadius: glowAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [16, 24],
    }),
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: glowAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [6, 16],
    }),
  };

  // Mic Icon animations (fade & scale down to center on record start; expand back on record end) - Native Driver
  const micOpacity = transitionAnim.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [1, 0, 0],
  });
  const micScale = transitionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.2],
  });

  // Waveform animations (expand from center on record start; shrink back into center on record end) - Native Driver
  const waveOpacity = transitionAnim.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 0.4, 1],
  });
  const waveScale = transitionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 1],
  });

  return (
    // Layer 1: Press scale transform (Native Driver)
    <Animated.View
      style={[
        styles.outerContainer,
        {
          width: size,
          height: size,
          transform: [{ scale: pressScale }],
        },
        style,
      ]}
    >
      {/* Layer 2: Glow & 3D Shadow Container (JS Driver - NO overflow: 'hidden' so shadow radiates freely) */}
      <Animated.View
        style={[
          styles.glowShadowContainer,
          { borderRadius: radius },
          animatedGlowStyle,
        ]}
      >
        {/* Layer 3: Inner Clip Container (overflow: 'hidden' to clip sound bars inside circle) */}
        <View style={[styles.innerClipContainer, { borderRadius: radius }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            disabled={disabled || isAnalyzing}
            style={({ pressed }) => [
              styles.pressableContent,
              pressed && !disabled && !isAnalyzing ? pressedStyle : null,
            ]}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={onPress}
          >
            {/* Mic Icon Layer (Native Driver - perfectly centered) */}
            <Animated.View
              style={[
                styles.centeredFill,
                {
                  opacity: micOpacity,
                  transform: [{ scale: micScale }],
                },
              ]}
              pointerEvents="none"
            >
              <Ionicons name="mic" size={size * 0.38} color={iconColor} />
            </Animated.View>

            {/* Soundwave Bars Layer (Native Driver - 100% centered) */}
            <Animated.View
              style={[
                styles.centeredFill,
                {
                  opacity: waveOpacity,
                  transform: [{ scale: waveScale }],
                },
              ]}
              pointerEvents="none"
            >
              <View style={styles.barsRow}>
                {barScales.map((barScale, index) => {
                  const isCenter = Math.abs(index - (NUM_BARS - 1) / 2) <= 2;
                  return (
                    <Animated.View
                      key={`siri-bar-${index}`}
                      style={[
                        styles.bar,
                        {
                          backgroundColor: isCenter ? activeBarColor : inactiveBarColor,
                          shadowColor: isCenter ? activeBarColor : inactiveBarColor,
                          opacity: barOpacities[index],
                          transform: [{ scaleY: barScale }],
                        },
                      ]}
                    />
                  );
                })}
              </View>
            </Animated.View>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowShadowContainer: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    // Note: Absolutely NO overflow: 'hidden' here! Allows 3D drop shadow & neon halo to shine outside!
  },
  innerClipContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressableContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: BAR_GAP,
    height: BAR_MAX_HEIGHT,
  },
  bar: {
    width: BAR_WIDTH,
    height: BAR_MAX_HEIGHT,
    borderRadius: BAR_WIDTH / 2,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
});
