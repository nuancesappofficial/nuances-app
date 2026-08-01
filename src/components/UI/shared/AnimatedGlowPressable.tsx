import React from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

type Props = Omit<PressableProps, 'style'> & {
  active: boolean;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  idleBackgroundColor: string;
  activeBackgroundColor?: string;
  idleBorderColor: string;
  activeBorderColor?: string;
  glowColor?: string;
  children: React.ReactNode;
};

export default function AnimatedGlowPressable({
  active,
  style,
  pressedStyle,
  idleBackgroundColor,
  activeBackgroundColor = 'rgba(28,62,99,0.96)',
  idleBorderColor,
  activeBorderColor = '#4EAFF4',
  glowColor = '#4EAFF4',
  children,
  ...pressableProps
}: Props) {
  const reduceMotion = useReducedMotion();
  const progress = React.useRef(new Animated.Value(active ? 1 : 0)).current;

  React.useEffect(() => {
    if (reduceMotion) {
      progress.setValue(active ? 1 : 0);
      return;
    }
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: active ? 220 : 260,
      useNativeDriver: false,
    }).start();
  }, [active, progress, reduceMotion]);

  const animatedStyle = {
    backgroundColor: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [idleBackgroundColor, activeBackgroundColor],
    }),
    borderColor: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [idleBorderColor, activeBorderColor],
    }),
    shadowColor: glowColor,
    shadowOpacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.08, 0.5],
    }),
    shadowRadius: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [6, 18],
    }),
    elevation: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [2, 8],
    }),
  };

  return (
    <Animated.View style={[style, animatedStyle]}>
      <Pressable
        {...pressableProps}
        style={({ pressed }) => [
          StyleSheet.absoluteFill,
          styles.pressableContent,
          pressed ? pressedStyle : null,
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressableContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
