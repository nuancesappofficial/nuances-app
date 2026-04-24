import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import CacheCardUI from './CacheCardUI';

// 調整「Skip + Add + Cache Stack」整組的垂直位移（負值往上、正值往下）
const CACHE_STACK_GROUP_OFFSET_Y = -50;

type CacheStackItem = {
  id: string;
  imageUri?: string;
  text: string;
  detectedPreview?: string;
  sourceLabel: string;
  importedAtLabel: string;
};

type Props = {
  cards: CacheStackItem[];
  animationSeed: number;
  restoreSeed: number;
  onCardSwipe: (itemId: string, direction: 'left' | 'right') => void;
  onCardImageError: (itemId: string) => void;
};

export default function CacheStackUI({ cards, animationSeed, restoreSeed, onCardSwipe, onCardImageError }: Props) {
  const topCardDragX = useSharedValue(0);
  const swipeSeqRef = React.useRef(0);
  const [swipeTrigger, setSwipeTrigger] = React.useState<{
    seq: number;
    itemId: string;
    direction: 'left' | 'right';
  } | null>(null);
  const topCard = cards[cards.length - 1];

  const skipActionStyle = useAnimatedStyle(() => {
    const progress = interpolate(topCardDragX.value, [-140, 0], [1, 0], Extrapolate.CLAMP);
    return {
      opacity: 0.78 + progress * 0.22,
      transform: [{ scale: 1 + progress * 0.07 }],
      backgroundColor: '#E1E5EC',
      borderColor: `rgba(255, 132, 132, ${0.2 + progress * 0.35})`,
    };
  });

  const createActionStyle = useAnimatedStyle(() => {
    const progress = interpolate(topCardDragX.value, [0, 140], [0, 1], Extrapolate.CLAMP);
    return {
      opacity: 0.78 + progress * 0.22,
      transform: [{ scale: 1 + progress * 0.07 }],
      backgroundColor: '#E1E5EC',
      borderColor: `rgba(119, 229, 157, ${0.2 + progress * 0.35})`,
    };
  });

  const skipTintStyle = useAnimatedStyle(() => {
    const progress = interpolate(topCardDragX.value, [-180, 0], [1, 0], Extrapolate.CLAMP);
    return {
      backgroundColor: `rgba(228, 62, 62, ${0.1 + progress * 0.22})`,
    };
  });

  const createTintStyle = useAnimatedStyle(() => {
    const progress = interpolate(topCardDragX.value, [0, 180], [0, 1], Extrapolate.CLAMP);
    return {
      backgroundColor: `rgba(51, 166, 93, ${0.1 + progress * 0.22})`,
    };
  });

  const skipShellStyle = useAnimatedStyle(() => {
    const progress = interpolate(topCardDragX.value, [-180, 0], [1, 0], Extrapolate.CLAMP);
    return {
      transform: [{ translateY: -progress * 1.5 }],
      shadowOpacity: 0.12 + progress * 0.16,
      shadowRadius: 8 + progress * 4,
      elevation: 5 + progress * 3,
    };
  });

  const createShellStyle = useAnimatedStyle(() => {
    const progress = interpolate(topCardDragX.value, [0, 180], [0, 1], Extrapolate.CLAMP);
    return {
      transform: [{ translateY: -progress * 1.5 }],
      shadowOpacity: 0.12 + progress * 0.16,
      shadowRadius: 8 + progress * 4,
      elevation: 5 + progress * 3,
    };
  });

  const skipGlowStyle = useAnimatedStyle(() => {
    const progress = interpolate(topCardDragX.value, [-190, 0], [1, 0], Extrapolate.CLAMP);
    return {
      opacity: 0.1 + progress * 0.5,
    };
  });

  const createGlowStyle = useAnimatedStyle(() => {
    const progress = interpolate(topCardDragX.value, [0, 190], [0, 1], Extrapolate.CLAMP);
    return {
      opacity: 0.1 + progress * 0.5,
    };
  });

  const triggerActionTapHaptic = React.useCallback((direction: 'left' | 'right') => {
    void Haptics.impactAsync(
      direction === 'left' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    );
  }, []);

  const triggerTopCardSwipe = React.useCallback(
    (direction: 'left' | 'right') => {
      if (!topCard) return;
      swipeSeqRef.current += 1;
      setSwipeTrigger({
        seq: swipeSeqRef.current,
        itemId: topCard.id,
        direction,
      });
    },
    [topCard]
  );

  return (
    <View style={styles.stackContainer}>
      {cards.length > 0 ? (
        <View style={styles.floatingActionsRow}>
          <Pressable
            onPress={() => {
              triggerActionTapHaptic('left');
              triggerTopCardSwipe('left');
            }}
            style={styles.actionPressTarget}
          >
            <Animated.View style={[styles.actionShell, styles.skipActionShell, skipShellStyle]}>
              <Animated.View style={[styles.floatingActionBtn, styles.skipActionBtn, skipActionStyle]}>
                <View style={styles.metalTopHighlight} pointerEvents="none" />
                <View style={styles.metalBottomShade} pointerEvents="none" />
                <Animated.View style={[StyleSheet.absoluteFill, styles.actionTintLayer, skipTintStyle]} pointerEvents="none" />
                <Animated.View style={[styles.actionGlow, styles.skipGlow, skipGlowStyle]} pointerEvents="none" />
                <View style={styles.actionContentRow}>
                  <Ionicons name="close" size={14} color="#C93E3E" />
                  <Text style={styles.skipActionText}>Skip</Text>
                </View>
              </Animated.View>
            </Animated.View>
          </Pressable>
          <Pressable
            onPress={() => {
              triggerActionTapHaptic('right');
              triggerTopCardSwipe('right');
            }}
            style={styles.actionPressTarget}
          >
            <Animated.View style={[styles.actionShell, styles.createActionShell, createShellStyle]}>
              <Animated.View style={[styles.floatingActionBtn, styles.createActionBtn, createActionStyle]}>
                <View style={styles.metalTopHighlight} pointerEvents="none" />
                <View style={styles.metalBottomShade} pointerEvents="none" />
                <Animated.View
                  style={[StyleSheet.absoluteFill, styles.actionTintLayer, createTintStyle]}
                  pointerEvents="none"
                />
                <Animated.View style={[styles.actionGlow, styles.createGlow, createGlowStyle]} pointerEvents="none" />
                <View style={styles.actionContentRow}>
                  <Text style={styles.createActionText}>Create</Text>
                  <Ionicons name="sparkles" size={12} color="#2F8B53" />
                </View>
              </Animated.View>
            </Animated.View>
          </Pressable>
        </View>
      ) : null}
      {cards.map((item, index) => (
        <CacheCardUI
          key={item.id}
          itemId={item.id}
          imageUri={item.imageUri}
          text={item.text}
          detectedPreview={item.detectedPreview}
          sourceLabel={item.sourceLabel}
          importedAtLabel={item.importedAtLabel}
          index={index}
          isTopCard={index === cards.length - 1}
          topCardDragX={topCardDragX}
          swipeTrigger={swipeTrigger}
          onImageError={onCardImageError}
          restoreSeed={restoreSeed}
          onSwipe={onCardSwipe}
          animationSeed={animationSeed}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: 40 + CACHE_STACK_GROUP_OFFSET_Y }],
  },
  floatingActionsRow: {
    position: 'absolute',
    top: 100,
    left: 40,
    right: 40,
    zIndex: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  floatingActionBtn: {
    minWidth: 94,
    height: 38,
    borderRadius: 13,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1.2,
    overflow: 'hidden',
    backgroundColor: '#E1E5EC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  actionPressTarget: {
    borderRadius: 14,
  },
  actionShell: {
    position: 'relative',
    borderRadius: 14,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  skipActionShell: {
    shadowColor: 'rgba(182, 54, 54, 1)',
  },
  createActionShell: {
    shadowColor: 'rgba(46, 122, 78, 1)',
  },
  skipActionBtn: {
    borderColor: 'rgba(204, 51, 51, 0.25)',
  },
  createActionBtn: {
    borderColor: 'rgba(26, 138, 58, 0.25)',
  },
  actionContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    zIndex: 4,
  },
  actionTintLayer: {
    zIndex: 1,
  },
  metalTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '46%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    zIndex: 2,
  },
  metalBottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
    backgroundColor: 'rgba(0,0,0,0.1)',
    zIndex: 2,
  },
  actionGlow: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  skipGlow: {
    backgroundColor: 'rgba(255, 106, 106, 0.35)',
  },
  createGlow: {
    backgroundColor: 'rgba(90, 224, 138, 0.35)',
  },
  skipActionText: {
    color: '#B83939',
    fontSize: 12.5,
    fontWeight: '800',
  },
  createActionText: {
    color: '#2D8150',
    fontSize: 12.5,
    fontWeight: '800',
  },
});
