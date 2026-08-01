import React from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAppIsActive } from '../../../hooks/useAppIsActive';

const AnimatedImage = Animated.createAnimatedComponent(Image);

const DEFAULT_SIZE = 260;
const SATELLITE_SPREAD_RATIO = 0.29;
const SPRING_CONFIG = {
  damping: 14,
  stiffness: 150,
  mass: 0.9,
};

type OnboardingHeroTripletProps = {
  centerImage: ImageSourcePropType;
  leftImage: ImageSourcePropType;
  rightImage: ImageSourcePropType;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export default function OnboardingHeroTriplet({
  centerImage,
  leftImage,
  rightImage,
  size = DEFAULT_SIZE,
  style,
}: OnboardingHeroTripletProps) {
  const isAppActive = useAppIsActive();
  const entranceScale = useSharedValue(0.5);
  const spreadProgress = useSharedValue(0);
  const idleY = useSharedValue(0);
  const satelliteSpread = Math.min(size * SATELLITE_SPREAD_RATIO, 112);

  React.useEffect(() => {
    if (!isAppActive) {
      cancelAnimation(idleY);
      return;
    }
    entranceScale.value = withSpring(1, SPRING_CONFIG);
    spreadProgress.value = withDelay(100, withSpring(1, SPRING_CONFIG));
    idleY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    return () => cancelAnimation(idleY);
  }, [entranceScale, idleY, isAppActive, spreadProgress]);

  const idleContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: idleY.value }],
  }));

  const centerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: entranceScale.value }],
  }));

  const leftStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: entranceScale.value },
      { translateX: interpolate(spreadProgress.value, [0, 1], [0, -satelliteSpread], 'clamp') },
      { translateY: interpolate(spreadProgress.value, [0, 1], [0, size * 0.05], 'clamp') },
      { rotateZ: `${interpolate(spreadProgress.value, [0, 1], [0, -18], 'clamp')}deg` },
    ],
  }));

  const rightStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: entranceScale.value },
      { translateX: interpolate(spreadProgress.value, [0, 1], [0, satelliteSpread], 'clamp') },
      { translateY: interpolate(spreadProgress.value, [0, 1], [0, size * 0.05], 'clamp') },
      { rotateZ: `${interpolate(spreadProgress.value, [0, 1], [0, 20], 'clamp')}deg` },
    ],
  }));

  const dimensions = React.useMemo(
    () => ({
      container: { width: size, height: size },
      center: { width: size * 0.52, height: size * 0.52 },
      satellite: { width: size * 0.32, height: size * 0.32 },
    }),
    [size]
  );

  return (
    <View style={[styles.container, dimensions.container, style]}>
      <Animated.View style={[styles.stage, idleContainerStyle]}>
        <AnimatedImage
          source={leftImage}
          resizeMode="contain"
          style={[styles.image, styles.leftImage, dimensions.satellite as ImageStyle, leftStyle]}
        />
        <AnimatedImage
          source={rightImage}
          resizeMode="contain"
          style={[styles.image, styles.rightImage, dimensions.satellite as ImageStyle, rightStyle]}
        />
        <AnimatedImage
          source={centerImage}
          resizeMode="contain"
          style={[styles.image, styles.centerImage, dimensions.center as ImageStyle, centerStyle]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    position: 'absolute',
  },
  leftImage: {
    marginTop: 18,
    marginLeft: -8,
  },
  rightImage: {
    marginTop: 20,
    marginLeft: 8,
  },
  centerImage: {
    marginTop: -8,
  },
});
