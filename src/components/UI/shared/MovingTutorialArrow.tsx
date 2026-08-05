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
  direction?: 'right' | 'down' | 'up' | 'left';
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** 動畫模式：bounce = 來回移動（預設），spring = 彈簧釋放般的伸縮（形狀變化） */
  motion?: 'bounce' | 'spring';
};

export default function MovingTutorialArrow({
  direction = 'right',
  color = '#2D8A56',
  size = 32,
  style,
  motion = 'bounce',
}: Props) {
  const offset = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(1)).current;
  const renderSize = getTutorialArrowRenderSize(size);

  React.useEffect(() => {
    let mounted = true;
    let loop: Animated.CompositeAnimation | null = null;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted || reduceMotion) return;
      if (motion === 'spring') {
        // 彈簧釋放：箭頭沿軸向從壓縮狀態彈開（帶 overshoot），反覆伸縮
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(scale, {
              toValue: 0.35,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.spring(scale, {
              toValue: 1,
              friction: 3.5,
              tension: 110,
              useNativeDriver: true,
            }),
            Animated.delay(260),
            Animated.spring(scale, {
              toValue: 0.35,
              friction: 3.5,
              tension: 110,
              useNativeDriver: true,
            }),
            Animated.delay(160),
          ])
        );
      } else {
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
      }
      loop.start();
    });

    return () => {
      mounted = false;
      loop?.stop();
      offset.stopAnimation();
      scale.stopAnimation();
    };
  }, [offset, scale, motion]);

  // 沿箭頭軸向伸縮：left/right 用 scaleX，up/down 用 scaleY
  const axisScale =
    direction === 'left' || direction === 'right'
      ? { scaleX: scale }
      : { scaleY: scale };

  const translate =
    direction === 'right'
      ? [{ translateX: offset }]
      : direction === 'left'
        ? [{ translateX: Animated.multiply(offset, -1) }]
        : direction === 'up'
          ? [{ translateY: Animated.multiply(offset, -1) }]
          : [{ translateY: offset }];

  const iconName =
    direction === 'right'
      ? 'arrow-forward'
      : direction === 'left'
        ? 'arrow-back'
        : direction === 'up'
          ? 'arrow-up'
          : 'arrow-down';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.arrow,
        style,
        {
          transform: [...translate, axisScale],
        },
      ]}
    >
      <Ionicons name={iconName} size={renderSize} color={color} />
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
