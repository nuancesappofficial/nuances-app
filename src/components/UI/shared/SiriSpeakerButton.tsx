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
import { DynamicArcSpinner } from './DynamicArcSpinner';

const DEFAULT_SIZE = 76;

interface SiriSpeakerButtonProps {
  isPlaying?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  size?: number;
  idleBackgroundColor?: string;
  activeBackgroundColor?: string;
  idleBorderColor?: string;
  activeBorderColor?: string;
  glowColor?: string;
  iconColor?: string;
  activeIconColor?: string;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export default function SiriSpeakerButton({
  isPlaying = false,
  isLoading = false,
  disabled = false,
  onPress,
  size = DEFAULT_SIZE,
  idleBackgroundColor = '#1c2638',
  activeBackgroundColor = 'rgba(28, 62, 99, 0.95)',
  idleBorderColor = '#2e3d57',
  activeBorderColor = '#4EAFF4',
  glowColor = '#00E5FF',
  iconColor = '#F1F5F9',
  activeIconColor = '#BFE7FF',
  style,
  pressedStyle,
  accessibilityLabel = '播放示範發音',
}: SiriSpeakerButtonProps) {
  // Physical on-press spring scale (0.94 on press, 1.0 on release) - Native Driver
  const pressScale = React.useRef(new Animated.Value(1)).current;

  // Active / Playing glow animation (0 = idle, 1 = active) - JS Driver (colors/shadows)
  const activeAnim = React.useRef(new Animated.Value(isPlaying || isLoading ? 1 : 0)).current;

  const isActive = isPlaying || isLoading;

  // Handle on-press scale down and bounce back (Native Driver)
  const handlePressIn = React.useCallback(() => {
    if (disabled || isLoading) return;
    Animated.spring(pressScale, {
      toValue: 0.94,
      tension: 160,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [disabled, isLoading, pressScale]);

  const handlePressOut = React.useCallback(() => {
    Animated.spring(pressScale, {
      toValue: 1.0,
      tension: 140,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [pressScale]);

  // Animate button glow container on active state change
  React.useEffect(() => {
    Animated.timing(activeAnim, {
      toValue: isActive ? 1 : 0,
      duration: isActive ? 200 : 250,
      useNativeDriver: false,
    }).start();
  }, [isActive, activeAnim]);

  const radius = size / 2;

  // Glow & Shadow style - unclipped outer layer
  const animatedGlowStyle = {
    backgroundColor: activeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [idleBackgroundColor, activeBackgroundColor],
    }),
    borderColor: activeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [idleBorderColor, activeBorderColor],
    }),
    shadowColor: activeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['#000000', glowColor],
    }),
    shadowOpacity: activeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.35, 0.88],
    }),
    shadowRadius: activeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [10, 20],
    }),
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: activeAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [4, 10],
    }),
  };

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
      {/* Layer 2: Glow & 3D Shadow Container (JS Driver - unclipped for outside glow) */}
      <Animated.View
        style={[
          styles.glowShadowContainer,
          { borderRadius: radius },
          animatedGlowStyle,
        ]}
      >
        {/* Layer 3: Inner Clip Container */}
        <View style={[styles.innerClipContainer, { borderRadius: radius }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            disabled={disabled || isLoading}
            style={({ pressed }) => [
              styles.pressableContent,
              pressed && !disabled && !isLoading ? pressedStyle : null,
            ]}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={onPress}
          >
            {/* Speaker Icon (always retained, never abruptly replaced) */}
            <View style={styles.centeredFill} pointerEvents="none">
              <Ionicons
                name="volume-medium-outline"
                size={size * 0.44}
                color={isActive ? activeIconColor : iconColor}
              />
            </View>
          </Pressable>
        </View>

        {/* Layer 4: Outer Circular Neon Spinner during download/loading */}
        {isLoading && (
          <View style={styles.spinnerGlowWrapper} pointerEvents="none">
            {/* Diffuse outer neon halo */}
            <View style={styles.spinnerDiffuseHalo}>
              <DynamicArcSpinner size={size} strokeWidth={5} color={glowColor} />
            </View>
            {/* Core focused neon beam */}
            <DynamicArcSpinner size={size} strokeWidth={3} color={glowColor} />
          </View>
        )}
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
  spinnerGlowWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00E5FF',
    shadowOpacity: 1.0,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  spinnerDiffuseHalo: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.45,
  },
});
