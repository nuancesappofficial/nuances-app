import React from 'react';
import Reanimated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

// Opacity-only fade. Children keep their full layout while invisible, so
// showing them never pushes anything else around.
export const FadeWhen: React.FC<{
  visible: boolean;
  duration?: number;
  /** Delay before fading in (fading out is immediate), for staggered groups. */
  delay?: number;
  style?: any;
  children: React.ReactNode;
}> = ({ visible, duration = 220, delay = 0, style, children }) => {
  const opacity = useSharedValue(visible ? 1 : 0);
  React.useEffect(() => {
    const timing = withTiming(visible ? 1 : 0, { duration });
    opacity.value = visible && delay > 0 ? withDelay(delay, timing) : timing;
  }, [delay, duration, opacity, visible]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Reanimated.View style={[style, animatedStyle]} pointerEvents={visible ? 'auto' : 'none'}>
      {children}
    </Reanimated.View>
  );
};
