import React from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  runOnJS,
  interpolate,
  Extrapolate,
  useDerivedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import CacheTextCardFace from './CacheTextCardFace';
import CacheImageCardFace from './CacheImageCardFace';

const { width } = Dimensions.get('window');

const ELEGANT_SPRING = {
  damping: 30,
  stiffness: 80,
  mass: 1,
};

type Props = {
  itemId: string;
  imageUri?: string;
  text: string;
  index: number;
  onSwipe: (itemId: string, direction: 'left' | 'right') => void;
  animationSeed: number;
};

export default function CacheCardUI({
  itemId,
  imageUri,
  text,
  index,
  onSwipe,
  animationSeed,
}: Props) {
  const toY = index * -4;
  const targetRot = React.useMemo(() => -10 + Math.random() * 20, [animationSeed]);
  const delay = index * 100;

  const isDropMode = animationSeed % 2 === 0;
  const side = index % 2 === 0 ? 1 : -1;

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(1);
  const rot = useSharedValue(0);
  const isPressed = useSharedValue(false);

  React.useEffect(() => {
    isPressed.value = false;

    if (isDropMode) {
      x.value = 0;
      y.value = -1000;
      scale.value = 1.5;
      y.value = withDelay(delay, withSpring(toY, ELEGANT_SPRING));
      scale.value = withDelay(delay, withSpring(1, ELEGANT_SPRING));
    } else {
      x.value = side * (width + 200);
      y.value = toY;
      scale.value = 1;
      x.value = withDelay(delay, withSpring(0, ELEGANT_SPRING));
    }
    rot.value = withDelay(delay, withSpring(targetRot, ELEGANT_SPRING));
  }, [animationSeed, delay, isDropMode, isPressed, rot, scale, side, targetRot, toY, x, y]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      isPressed.value = true;
    })
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = toY + e.translationY;
      rot.value = targetRot + e.translationX / 20;
    })
    .onEnd((e) => {
      const trigger = Math.abs(e.velocityX) > 400 || Math.abs(e.translationX) > width * 0.3;
      if (trigger) {
        const dir = e.translationX > 0 ? 1 : -1;
        x.value = withSpring(width * 2 * dir, { velocity: e.velocityX });
        runOnJS(onSwipe)(itemId, dir > 0 ? 'right' : 'left');
      } else {
        isPressed.value = false;
        x.value = withSpring(0, ELEGANT_SPRING);
        y.value = withSpring(toY, ELEGANT_SPRING);
        rot.value = withSpring(targetRot, ELEGANT_SPRING);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    width: width - 80,
    height: 480,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotateZ: `${rot.value}deg` },
      { scale: scale.value },
    ],
  }));

  const activeOpacity = useDerivedValue(() => (isPressed.value ? 1 : 0));

  const likeOpacity = useAnimatedStyle(() => ({
    opacity: activeOpacity.value * interpolate(x.value, [0, width * 0.2], [0, 1], Extrapolate.CLAMP),
  }));

  const nopeOpacity = useAnimatedStyle(() => ({
    opacity: activeOpacity.value * interpolate(x.value, [-width * 0.2, 0], [1, 0], Extrapolate.CLAMP),
  }));

  const overlayStyle = useAnimatedStyle(() => {
    const alpha = activeOpacity.value;
    const green = interpolate(x.value, [0, width * 0.4], [0, 0.3], Extrapolate.CLAMP);
    const red = interpolate(x.value, [-width * 0.4, 0], [0.3, 0], Extrapolate.CLAMP);
    return {
      backgroundColor: x.value > 0
        ? `rgba(76, 175, 80, ${alpha * green})`
        : `rgba(244, 67, 54, ${alpha * red})`,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, animatedStyle]}>
        {imageUri ? <CacheImageCardFace imageUri={imageUri} /> : <CacheTextCardFace text={text} />}
        <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]} />

        <Animated.View style={[styles.stampContainer, styles.likeStamp, likeOpacity]}>
          <Ionicons name="checkmark-outline" color="#4CAF50" size={60} />
        </Animated.View>

        <Animated.View style={[styles.stampContainer, styles.nopeStamp, nopeOpacity]}>
          <Ionicons name="close-outline" color="#F44336" size={60} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 5,
  },
  overlay: {
    zIndex: 1,
  },
  stampContainer: {
    position: 'absolute',
    top: 40,
    zIndex: 10,
    padding: 10,
    borderRadius: 15,
    borderWidth: 5,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  likeStamp: {
    left: 30,
    borderColor: '#4CAF50',
    transform: [{ rotate: '-15deg' }],
  },
  nopeStamp: {
    right: 30,
    borderColor: '#F44336',
    transform: [{ rotate: '15deg' }],
  },
});
