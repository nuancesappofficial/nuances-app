import React from 'react';
import { StyleSheet, Dimensions, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
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
  damping: 32,
  stiffness: 64,
  mass: 1.12,
  restDisplacementThreshold: 0.4,
  restSpeedThreshold: 0.4,
};
const SWIPE_COMMIT_DELAY_MS = 180;

function getStableCardRotation(itemId: string): number {
  let hash = 0;
  for (let i = 0; i < itemId.length; i += 1) {
    hash = (hash * 31 + itemId.charCodeAt(i)) >>> 0;
  }
  return -10 + (hash % 2000) / 100;
}

type Props = {
  itemId: string;
  imageUri?: string;
  text: string;
  detectedPreview?: string;
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
  onImageError: (itemId: string) => void;
  restoreSeed: number;
  onSwipeStart: (itemId: string, direction: 'left' | 'right') => void;
  onSwipe: (itemId: string, direction: 'left' | 'right') => void;
  animationSeed: number;
  shouldAnimateEntrance?: boolean;
  entranceOrder?: number;
};

export default function CacheCardUI({
  itemId,
  imageUri,
  text,
  detectedPreview,
  sourceLabel,
  importedAtLabel,
  index,
  isTopCard,
  topCardDragX,
  swipeTrigger,
  onImageError,
  restoreSeed,
  onSwipeStart,
  onSwipe,
  animationSeed,
  shouldAnimateEntrance = false,
  entranceOrder = -1,
}: Props) {
  const toY = index * -4;
  const targetRot = React.useMemo(() => getStableCardRotation(itemId), [itemId]);
  const delay = (entranceOrder >= 0 ? entranceOrder : 0) * 110;

  const isDropMode = animationSeed % 2 === 0;
  const side = (entranceOrder >= 0 ? entranceOrder : index) % 2 === 0 ? 1 : -1;
  const startsInEntrancePose = shouldAnimateEntrance && entranceOrder >= 0;

  const x = useSharedValue(startsInEntrancePose && !isDropMode ? side * (width + 200) : 0);
  const y = useSharedValue(startsInEntrancePose && isDropMode ? -920 : toY);
  const scale = useSharedValue(startsInEntrancePose && isDropMode ? 1.5 : 1);
  const rot = useSharedValue(startsInEntrancePose ? 0 : targetRot);
  const isPressed = useSharedValue(false);
  const hasRestoreInitialized = React.useRef(false);
  const lastSwipeTriggerSeq = React.useRef<number | null>(null);
  const lastEntranceTokenRef = React.useRef<string | null>(null);

  const triggerSwipeHaptic = React.useCallback((direction: 'left' | 'right') => {
    void Haptics.impactAsync(
      direction === 'left' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    );
  }, []);

  const commitSwipe = React.useCallback(
    (direction: 'left' | 'right') => {
      setTimeout(() => {
        onSwipeStart(itemId, direction);
        onSwipe(itemId, direction);
      }, SWIPE_COMMIT_DELAY_MS);
    },
    [itemId, onSwipe, onSwipeStart]
  );

  React.useEffect(() => {
    const entranceToken = shouldAnimateEntrance ? `${animationSeed}:${itemId}` : null;
    const shouldRunEntrance = Boolean(entranceToken && lastEntranceTokenRef.current !== entranceToken);
    lastEntranceTokenRef.current = entranceToken;
    isPressed.value = false;

    if (!shouldRunEntrance) {
      x.value = withSpring(0, ELEGANT_SPRING);
      y.value = withSpring(toY, ELEGANT_SPRING);
      scale.value = withSpring(1, ELEGANT_SPRING);
      rot.value = withSpring(targetRot, ELEGANT_SPRING);
      return;
    }

    if (isDropMode) {
      x.value = 0;
      y.value = -920;
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
  }, [
    animationSeed,
    delay,
    isDropMode,
    isPressed,
    itemId,
    rot,
    scale,
    shouldAnimateEntrance,
    side,
    targetRot,
    toY,
    x,
    y,
  ]);

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
    .enabled(isTopCard)
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
        runOnJS(triggerSwipeHaptic)(dir > 0 ? 'right' : 'left');
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

  const rightMaskStyle = useAnimatedStyle(() => {
    const alpha = activeOpacity.value;
    const progress = interpolate(x.value, [0, width * 0.42], [0, 1], Extrapolate.CLAMP);
    return {
      opacity: alpha * progress,
      backgroundColor: '#33A65D',
    };
  });

  const leftMaskStyle = useAnimatedStyle(() => {
    const alpha = activeOpacity.value;
    const progress = interpolate(x.value, [-width * 0.42, 0], [1, 0], Extrapolate.CLAMP);
    return {
      opacity: alpha * progress,
      backgroundColor: '#E43E3E',
    };
  });

  const rightIconStyle = useAnimatedStyle(() => {
    const alpha = activeOpacity.value;
    const progress = interpolate(x.value, [0, width * 0.42], [0, 1], Extrapolate.CLAMP);
    const scaleValue = interpolate(progress, [0, 1], [0.82, 1.08], Extrapolate.CLAMP);
    return {
      opacity: alpha * progress,
      transform: [{ scale: scaleValue }],
    };
  });

  const leftIconStyle = useAnimatedStyle(() => {
    const alpha = activeOpacity.value;
    const progress = interpolate(x.value, [-width * 0.42, 0], [1, 0], Extrapolate.CLAMP);
    const scaleValue = interpolate(progress, [0, 1], [0.82, 1.08], Extrapolate.CLAMP);
    return {
      opacity: alpha * progress,
      transform: [{ scale: scaleValue }],
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
            {imageUri ? (
              <CacheImageCardFace
                imageUri={imageUri}
                fallbackText={text}
                detectedPreview={detectedPreview}
                onImageError={() => onImageError(itemId)}
              />
            ) : (
              <CacheTextCardFace text={text} />
            )}
            <Animated.View style={[StyleSheet.absoluteFillObject, styles.dragMaskLayer, rightMaskStyle]} />
            <Animated.View style={[StyleSheet.absoluteFillObject, styles.dragMaskLayer, leftMaskStyle]} />

            <Animated.View style={[styles.dragIconWrap, rightIconStyle]}>
              <Ionicons name="checkmark" size={56} color="#FFFFFF" style={styles.dragIcon} />
            </Animated.View>

            <Animated.View style={[styles.dragIconWrap, leftIconStyle]}>
              <Ionicons name="close" size={56} color="#FFFFFF" style={styles.dragIcon} />
            </Animated.View>
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
  dragMaskLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    pointerEvents: 'none',
  },
  dragIconWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  dragIcon: {
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
});
