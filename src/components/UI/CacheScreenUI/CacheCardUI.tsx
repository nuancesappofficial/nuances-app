import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withSequence,
  withTiming,
  withRepeat,
  cancelAnimation,
  Easing,
  runOnJS,
  interpolate,
  Extrapolate,
  useDerivedValue,
  type SharedValue,
  useReducedMotion,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import CacheTextCardFace from './CacheTextCardFace';
import CacheImageCardFace from './CacheImageCardFace';
import MovingTutorialArrow from '../shared/MovingTutorialArrow';
import { useAppIsActive } from '../../../hooks/useAppIsActive';
import { clampTutorialCacheDragX } from '../../../features/tour/tutorialCachePolicy';

export const CACHE_CARD_HORIZONTAL_INSET = 40;
export const CACHE_CARD_HEIGHT = 480;

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
  showSwipeTugHint?: boolean;
  deletionLocked?: boolean;
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
  showSwipeTugHint = false,
  deletionLocked = false,
}: Props) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const isAppActive = useAppIsActive();
  const toY = index * -4;
  const targetRot = React.useMemo(() => getStableCardRotation(itemId), [itemId]);
  const delay = (entranceOrder >= 0 ? entranceOrder : 0) * 110;

  const startsInEntrancePose = shouldAnimateEntrance && entranceOrder >= 0;

  const x = useSharedValue(0);
  const y = useSharedValue(startsInEntrancePose ? -920 : toY);
  const scale = useSharedValue(startsInEntrancePose ? 1.5 : 1);
  const rot = useSharedValue(startsInEntrancePose ? 0 : targetRot);
  const isPressed = useSharedValue(false);
  const hasRestoreInitialized = React.useRef(false);
  const lastSwipeTriggerSeq = React.useRef<number | null>(null);
  const lastEntranceTokenRef = React.useRef<string | null>(null);
  const tugHintTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tugRestartSeed, setTugRestartSeed] = React.useState(0);
  const tutorialTugX = useSharedValue(0);
  const tutorialPulse = useSharedValue(0);

  const cancelPendingTugHint = React.useCallback(() => {
    if (!tugHintTimerRef.current) return;
    clearTimeout(tugHintTimerRef.current);
    tugHintTimerRef.current = null;
  }, []);

  const restartTutorialTug = React.useCallback(() => {
    setTugRestartSeed((current) => current + 1);
  }, []);

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
      if (shouldAnimateEntrance) {
        // Entrance animation is ALREADY in progress for this card.
        // Background OCR updates or re-renders must not interrupt or snap the in-flight drop animation.
        return;
      }
      x.value = withSpring(0, ELEGANT_SPRING);
      y.value = withSpring(toY, ELEGANT_SPRING);
      scale.value = withSpring(1, ELEGANT_SPRING);
      rot.value = withSpring(targetRot, ELEGANT_SPRING);
      return;
    }

    x.value = 0;
    y.value = -920;
    scale.value = 1.5;
    rot.value = 0;
    y.value = withDelay(delay, withSpring(toY, ELEGANT_SPRING));
    scale.value = withDelay(delay, withSpring(1, ELEGANT_SPRING));
    rot.value = withDelay(delay, withSpring(targetRot, ELEGANT_SPRING));
  }, [
    animationSeed,
    delay,
    isPressed,
    itemId,
    rot,
    scale,
    shouldAnimateEntrance,
    targetRot,
    toY,
    x,
    y,
  ]);

  React.useEffect(() => {
    cancelAnimation(tutorialTugX);
    cancelAnimation(tutorialPulse);
    tutorialTugX.value = 0;
    tutorialPulse.value = showSwipeTugHint && isTopCard ? 1 : 0;

    if (!showSwipeTugHint || !isTopCard || !isAppActive) return;

    if (reduceMotion) {
      tutorialPulse.value = 1;
      return;
    }

    const entranceDuration = shouldAnimateEntrance ? delay + 1050 : 0;
    tugHintTimerRef.current = setTimeout(() => {
      tugHintTimerRef.current = null;
      tutorialTugX.value = withRepeat(
        withSequence(
          withTiming(20, { duration: 260, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 340, easing: Easing.inOut(Easing.quad) }),
          withDelay(900, withTiming(0, { duration: 1 }))
        ),
        -1,
        false
      );
      topCardDragX.value = withRepeat(
        withSequence(
          withTiming(20, { duration: 260, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 340, easing: Easing.inOut(Easing.quad) }),
          withDelay(900, withTiming(0, { duration: 1 }))
        ),
        -1,
        false
      );
      tutorialPulse.value = withRepeat(
        withSequence(
          withTiming(0.35, { duration: 720, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 720, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      );
    }, entranceDuration + 650);

    return () => {
      cancelPendingTugHint();
      cancelAnimation(tutorialTugX);
      cancelAnimation(tutorialPulse);
      if (isTopCard) {
        cancelAnimation(topCardDragX);
        topCardDragX.value = 0;
      }
    };
  }, [
    cancelPendingTugHint,
    delay,
    isAppActive,
    isTopCard,
    reduceMotion,
    shouldAnimateEntrance,
    showSwipeTugHint,
    tutorialPulse,
    tutorialTugX,
    tugRestartSeed,
    topCardDragX,
  ]);

  React.useEffect(() => {
    if (!hasRestoreInitialized.current) {
      hasRestoreInitialized.current = true;
      return;
    }
    if (shouldAnimateEntrance) {
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
  }, [isTopCard, restoreSeed, isPressed, rot, scale, targetRot, toY, topCardDragX, x, y, shouldAnimateEntrance]);

  React.useEffect(() => {
    if (!isTopCard || !swipeTrigger) return;
    if (swipeTrigger.itemId !== itemId) return;
    if (lastSwipeTriggerSeq.current === swipeTrigger.seq) return;
    lastSwipeTriggerSeq.current = swipeTrigger.seq;

    if (deletionLocked && swipeTrigger.direction === 'left') {
      isPressed.value = false;
      x.value = withSpring(0, ELEGANT_SPRING);
      topCardDragX.value = withSpring(0, ELEGANT_SPRING);
      return;
    }

    const dir = swipeTrigger.direction === 'right' ? 1 : -1;
    const flyTo = width * 2 * dir;
    isPressed.value = true;
    x.value = withSpring(flyTo, ELEGANT_SPRING);
    topCardDragX.value = flyTo;
    runOnJS(commitSwipe)(swipeTrigger.direction);
  }, [commitSwipe, deletionLocked, isTopCard, itemId, isPressed, swipeTrigger, topCardDragX, x]);

  const pan = Gesture.Pan()
    .enabled(isTopCard)
    .onBegin(() => {
      cancelAnimation(x);
      cancelAnimation(tutorialTugX);
      cancelAnimation(topCardDragX);
      tutorialTugX.value = 0;
      topCardDragX.value = 0;
      runOnJS(cancelPendingTugHint)();
      isPressed.value = true;
    })
    .onUpdate((e) => {
      const dragX = clampTutorialCacheDragX(e.translationX, deletionLocked);
      x.value = dragX;
      if (isTopCard) {
        topCardDragX.value = dragX;
      }
      y.value = toY + e.translationY;
      rot.value = targetRot + dragX / 20;
    })
    .onEnd((e) => {
      if (deletionLocked && e.translationX < 0) {
        isPressed.value = false;
        x.value = withSpring(0, ELEGANT_SPRING);
        if (isTopCard) {
          topCardDragX.value = withSpring(0, ELEGANT_SPRING);
        }
        y.value = withSpring(toY, ELEGANT_SPRING);
        rot.value = withSpring(targetRot, ELEGANT_SPRING);
        if (showSwipeTugHint && isTopCard) {
          runOnJS(restartTutorialTug)();
        }
        return;
      }
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
    width: width - CACHE_CARD_HORIZONTAL_INSET * 2,
    height: CACHE_CARD_HEIGHT,
    transform: [
      { translateX: x.value },
      { translateX: tutorialTugX.value },
      { translateY: y.value },
      { rotateZ: `${rot.value}deg` },
      { scale: scale.value },
    ],
  }));

  const tutorialBorderStyle = useAnimatedStyle(() => ({
    opacity: tutorialPulse.value,
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
          {showSwipeTugHint && isTopCard ? (
            <>
              <Animated.View pointerEvents="none" style={[styles.tutorialBorder, tutorialBorderStyle]} />
              <MovingTutorialArrow style={styles.swipeTutorialArrow} color="#4EAFF4" size={38} />
            </>
          ) : null}
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
  tutorialBorder: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#5CC58A',
    shadowColor: '#44B979',
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  swipeTutorialArrow: {
    position: 'absolute',
    right: -23,
    top: '45%',
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
