import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface DynamicArcSpinnerProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * DynamicArcSpinner
 * 動態追逐圓弧 Spinner（80% ⇋ 20% 追逐曲線）
 * - 旋轉週期：1.25s 勻速旋轉
 * - 圓弧伸縮：0.65s 區間內前端竄出至 ~75% 圓周，隨後尾端急追收縮至 ~15% 圓周
 * - 自然呼吸節奏非線性曲線：cubic-bezier(0.4, 0, 0.2, 1)
 */
export function DynamicArcSpinner({
  size = 24,
  color = '#4EAFF4',
  strokeWidth = 2.4,
}: DynamicArcSpinnerProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const rotation = useSharedValue(0);
  const arcLength = useSharedValue(circumference * 0.15);
  const dashOffset = useSharedValue(0);

  useEffect(() => {
    // 1. 持續旋轉容器
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(360, { duration: 1250, easing: Easing.linear }),
      -1,
      false
    );

    // 2. 圓弧長度：從 15% 伸長至 75%，再縮回 15%
    arcLength.value = circumference * 0.15;
    arcLength.value = withRepeat(
      withSequence(
        withTiming(circumference * 0.75, {
          duration: 625,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
        }),
        withTiming(circumference * 0.15, {
          duration: 625,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
        })
      ),
      -1,
      false
    );

    // 3. Dash 偏移量：尾端追趕位移
    dashOffset.value = 0;
    dashOffset.value = withRepeat(
      withSequence(
        withTiming(-circumference * 0.25, {
          duration: 625,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
        }),
        withTiming(-circumference, {
          duration: 625,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
        })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(rotation);
      cancelAnimation(arcLength);
      cancelAnimation(dashOffset);
    };
  }, [circumference, arcLength, dashOffset, rotation]);

  const animatedCircleProps = useAnimatedProps(() => ({
    strokeDasharray: [arcLength.value, circumference],
    strokeDashoffset: dashOffset.value,
  }));

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={[{ width: size, height: size }, animatedContainerStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            animatedProps={animatedCircleProps}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
