import React from 'react';
import { StyleSheet, Dimensions, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  runOnJS,
  interpolate,
  Extrapolate,
  useDerivedValue,
  type SharedValue,
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
const SWIPE_COMMIT_DELAY_MS = 180;

type Props = {
  itemId: string;
  imageUri?: string;
  text: string;
  sourceLabel: string;
  importedAtLabel: string;
  index: number;
  isTopCard: boolean;
  topCardDragX: SharedValue<number>;
  swipeTrigger: {
    seq: number;
    itemId: string;
    direction: 'left' | 'right';
  } | null;
  restoreSeed: number;
  onSwipe: (itemId: string, direction: 'left' | 'right') => void;
  animationSeed: number;
};

export default function CacheCardUI({
  itemId,
  imageUri,
  text,
  sourceLabel,
  importedAtLabel,
  index,
  isTopCard,
  topCardDragX,
  swipeTrigger,
  restoreSeed,
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
  const hasRestoreInitialized = React.useRef(false);
  const lastSwipeTriggerSeq = React.useRef<number | null>(null);

  const commitSwipe = React.useCallback(
    (direction: 'left' | 'right') => {
      setTimeout(() => {
        onSwipe(itemId, direction);
      }, SWIPE_COMMIT_DELAY_MS);
    },
    [itemId, onSwipe]
  );

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

  React.useEffect(() => {
    if (!hasRestoreInitialized.current) {
      hasRestoreInitialized.current = true;
      return;
    }
    isPressed.value = false;
    x.value = 0;
    if (isTopCard) {
      topCardDragX.value = 0;
    }
    y.value = toY;
    scale.value = 1;
    rot.value = targetRot;
  }, [isTopCard, restoreSeed, isPressed, rot, scale, targetRot, toY, topCardDragX, x, y]);

  React.useEffect(() => {
    if (!isTopCard || !swipeTrigger) return;
    if (swipeTrigger.itemId !== itemId) return;
    if (lastSwipeTriggerSeq.current === swipeTrigger.seq) return;
    lastSwipeTriggerSeq.current = swipeTrigger.seq;

    const dir = swipeTrigger.direction === 'right' ? 1 : -1;
    const flyTo = width * 2 * dir;
    isPressed.value = true;
    x.value = withSpring(flyTo, ELEGANT_SPRING);
    topCardDragX.value = flyTo;
    runOnJS(commitSwipe)(swipeTrigger.direction);
  }, [commitSwipe, isTopCard, itemId, isPressed, swipeTrigger, topCardDragX, x]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      isPressed.value = true;
    })
    .onUpdate((e) => {
      x.value = e.translationX;
      if (isTopCard) {
        topCardDragX.value = e.translationX;
      }
      y.value = toY + e.translationY;
      rot.value = targetRot + e.translationX / 20;
    })
    .onEnd((e) => {
      const trigger = Math.abs(e.velocityX) > 400 || Math.abs(e.translationX) > width * 0.3;
      if (trigger) {
        const dir = e.translationX > 0 ? 1 : -1;
        x.value = withSpring(width * 2 * dir, { velocity: e.velocityX });
        if (isTopCard) {
          topCardDragX.value = width * 2 * dir;
        }
        runOnJS(commitSwipe)(dir > 0 ? 'right' : 'left');
      } else {
        isPressed.value = false;
        x.value = withSpring(0, ELEGANT_SPRING);
        if (isTopCard) {
          topCardDragX.value = 0;
        }
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

  const overlayStyle = useAnimatedStyle(() => {
    const alpha = activeOpacity.value;
    const green = interpolate(x.value, [0, width * 0.4], [0, 0.16], Extrapolate.CLAMP);
    const red = interpolate(x.value, [-width * 0.4, 0], [0.16, 0], Extrapolate.CLAMP);
    return {
      backgroundColor: x.value > 0
        ? `rgba(76, 175, 80, ${alpha * green})`
        : `rgba(244, 67, 54, ${alpha * red})`,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.shadowWrapper, animatedStyle]}>
        <View style={styles.cardContent}>
          <View style={styles.headerRow}>
            <View style={styles.sourcePill}>
              <Text style={styles.sourcePillText}>{sourceLabel}</Text>
            </View>
            <Text style={styles.relativeTimeText}>{importedAtLabel}</Text>
          </View>

          <View style={styles.mainContentContainer}>
            {imageUri ? <CacheImageCardFace imageUri={imageUri} fallbackText={text} /> : <CacheTextCardFace text={text} />}
            <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]} />
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: {
    borderRadius: 24,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 8,
  },
  cardContent: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sourcePill: {
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EFEFF3',
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  sourcePillText: {
    color: '#858895',
    fontSize: 11,
    fontWeight: '600',
  },
  relativeTimeText: {
    color: '#C4C7D0',
    fontSize: 12,
    fontWeight: '500',
  },
  mainContentContainer: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  overlay: {
    zIndex: 1,
  },
});
