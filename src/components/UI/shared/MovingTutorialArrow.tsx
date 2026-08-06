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
  /** 動畫模式：bounce = 來回移動（預設），longPress = 長按視覺環（提示需按住） */
  motion?: 'bounce' | 'longPress';
};

export default function MovingTutorialArrow({
  direction = 'right',
  color = '#4EAFF4',
  size = 32,
  style,
  motion = 'bounce',
}: Props) {
  const offset = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(1)).current;
  const ringScale = React.useRef(new Animated.Value(0.3)).current;
  const ringOpacity = React.useRef(new Animated.Value(0)).current;
  const renderSize = getTutorialArrowRenderSize(size);

  React.useEffect(() => {
    let mounted = true;
    let loop: Animated.CompositeAnimation | null = null;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted || reduceMotion) return;
      if (motion === 'longPress') {
        // 長按視覺環：按下 → 保持擴張（提示需按住）→ 釋放彈開，反覆循環
        loop = Animated.loop(
          Animated.sequence([
            Animated.parallel([
              Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
              Animated.timing(offset, { toValue: 0, duration: 0, useNativeDriver: true }),
              Animated.timing(ringScale, { toValue: 0.3, duration: 0, useNativeDriver: true }),
              Animated.timing(ringOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
            ]),
            Animated.delay(200),
            Animated.parallel([
              Animated.timing(offset, {
                toValue: 6,
                duration: 180,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(scale, {
                toValue: 0.85,
                duration: 180,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(ringOpacity, {
                toValue: 0.7,
                duration: 180,
                useNativeDriver: true,
              }),
            ]),
            Animated.timing(ringScale, {
              toValue: 1.6,
              duration: 1000,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.parallel([
              Animated.spring(scale, {
                toValue: 1.1,
                friction: 4,
                tension: 120,
                useNativeDriver: true,
              }),
              Animated.timing(offset, { toValue: 0, duration: 150, useNativeDriver: true }),
              Animated.timing(ringOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]),
            Animated.delay(400),
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
      ringScale.stopAnimation();
      ringOpacity.stopAnimation();
    };
  }, [offset, scale, ringScale, ringOpacity, motion]);

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

  // 長按視覺環：定位在箭頭尖端
  const ringPosition =
    direction === 'right'
      ? { right: -4 }
      : direction === 'left'
        ? { left: -4 }
        : direction === 'up'
          ? { top: -4 }
          : { bottom: -4 };

  const ringSize = renderSize * 1.1;

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
      {motion === 'longPress' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            ringPosition,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderWidth: 2.5,
              borderColor: color,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      ) : null}
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
  ring: {
    position: 'absolute',
  },
});
