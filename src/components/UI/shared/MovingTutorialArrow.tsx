import React from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTutorialArrowRenderSize } from '../../../features/tour/tutorialPresentation';

type Props = {
  direction?: 'right' | 'down' | 'up';
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export default function MovingTutorialArrow({
  direction = 'right',
  color = '#2D8A56',
  size = 32,
  style,
}: Props) {
  const offset = React.useRef(new Animated.Value(0)).current;
  const renderSize = getTutorialArrowRenderSize(size);

  React.useEffect(() => {
    let mounted = true;
    let loop: Animated.CompositeAnimation | null = null;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted || reduceMotion) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(offset, {
            toValue: 9,
            duration: 500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(offset, {
            toValue: 0,
            duration: 500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    });

    return () => {
      mounted = false;
      loop?.stop();
      offset.stopAnimation();
    };
  }, [offset]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.arrow,
        style,
        {
          transform:
            direction === 'right'
              ? [{ translateX: offset }]
              : direction === 'up'
                ? [{ translateY: Animated.multiply(offset, -1) }]
                : [{ translateY: offset }],
        },
      ]}
    >
      <Ionicons
        name={direction === 'right' ? 'arrow-forward' : direction === 'up' ? 'arrow-up' : 'arrow-down'}
        size={renderSize}
        color={color}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  arrow: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
});
