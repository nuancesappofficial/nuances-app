import React from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  pressedScale?: number;
  pressedOpacity?: number;
};

const PRESS_IN_CONFIG = {
  speed: 34,
  bounciness: 0,
  useNativeDriver: true,
} as const;

const PRESS_OUT_CONFIG = {
  speed: 28,
  bounciness: 4,
  useNativeDriver: true,
} as const;

export default function LightPressable({
  children,
  style,
  contentStyle,
  pressedScale = 0.96,
  pressedOpacity = 0.92,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const pressProgress = React.useRef(new Animated.Value(0)).current;

  const animatePress = React.useCallback(
    (toValue: number) => {
      Animated.spring(pressProgress, {
        ...(toValue > 0 ? PRESS_IN_CONFIG : PRESS_OUT_CONFIG),
        toValue,
      }).start();
    },
    [pressProgress]
  );

  const handlePressIn = React.useCallback(
    (event: GestureResponderEvent) => {
      if (!disabled) animatePress(1);
      onPressIn?.(event);
    },
    [animatePress, disabled, onPressIn]
  );

  const handlePressOut = React.useCallback(
    (event: GestureResponderEvent) => {
      animatePress(0);
      onPressOut?.(event);
    },
    [animatePress, onPressOut]
  );

  const animatedStyle = React.useMemo(
    () => ({
      opacity: pressProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, pressedOpacity],
      }),
      transform: [
        {
          scale: pressProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, pressedScale],
          }),
        },
      ],
    }),
    [pressProgress, pressedOpacity, pressedScale]
  );

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      style={style}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[styles.content, contentStyle, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
  },
});
