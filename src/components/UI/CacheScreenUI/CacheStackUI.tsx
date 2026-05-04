import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import CacheCardUI from './CacheCardUI';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';

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
  enteringCardIds: string[];
  onCardSwipeStart: (itemId: string, direction: 'left' | 'right') => void;
  onCardSwipe: (itemId: string, direction: 'left' | 'right') => void;
  onCardImageError: (itemId: string) => void;
};

export default function CacheStackUI({
  cards,
  animationSeed,
  restoreSeed,
  enteringCardIds,
  onCardSwipeStart,
  onCardSwipe,
  onCardImageError,
}: Props) {
  const topCardDragX = useSharedValue(0);
  const swipeSeqRef = React.useRef(0);
  const [swipeTrigger, setSwipeTrigger] = React.useState<{
    seq: number;
    itemId: string;
    direction: 'left' | 'right';
  } | null>(null);
  const topCard = cards[cards.length - 1];
  const swipingItemIdsRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    const activeIds = new Set(cards.map((card) => card.id));
    swipingItemIdsRef.current.forEach((id) => {
      if (!activeIds.has(id)) {
        swipingItemIdsRef.current.delete(id);
      }
    });
  }, [cards]);

  const skipActionStyle = useAnimatedStyle(() => {
    const progress = interpolate(topCardDragX.value, [-140, 0], [1, 0], Extrapolate.CLAMP);
    return {
      opacity: 0.78 + progress * 0.22,
      transform: [{ scale: 1 + progress * 0.07 }],
      backgroundColor: '#CF4747',
      borderColor: `rgba(255, 214, 214, ${0.25 + progress * 0.35})`,
    };
  });

  const createActionStyle = useAnimatedStyle(() => {
    const progress = interpolate(topCardDragX.value, [0, 140], [0, 1], Extrapolate.CLAMP);
    return {
      opacity: 0.78 + progress * 0.22,
      transform: [{ scale: 1 + progress * 0.07 }],
      backgroundColor: '#2D8A56',
      borderColor: `rgba(207, 245, 222, ${0.25 + progress * 0.35})`,
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

  const triggerActionTapHaptic = React.useCallback((direction: 'left' | 'right') => {
    void Haptics.impactAsync(
      direction === 'left' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    );
  }, []);

  const triggerTopCardSwipe = React.useCallback(
    (direction: 'left' | 'right') => {
      if (!topCard) return;
      if (swipingItemIdsRef.current.has(topCard.id)) return;
      swipingItemIdsRef.current.add(topCard.id);
      setTimeout(() => {
        swipingItemIdsRef.current.delete(topCard.id);
      }, 600);
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
    <View style={styles.stackContainer} pointerEvents="box-none">
      {cards.length > 0 ? (
        <View style={styles.floatingActionsRow}>
          <Pressable
            onPress={() => {
              triggerActionTapHaptic('left');
              triggerTopCardSwipe('left');
            }}
            style={styles.actionPressTarget}
          >
            <Animated.View style={styles.actionShell}>
              <Animated.View style={[styles.floatingActionBtn, styles.skipActionBtn, skipActionStyle]}>
                <Animated.View style={[StyleSheet.absoluteFill, styles.actionTintLayer, skipTintStyle]} pointerEvents="none" />
                <View style={styles.actionContentRow}>
                  <Ionicons name="close" size={14} color="#FFFFFF" />
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
            <Animated.View style={styles.actionShell}>
              <Animated.View style={[styles.floatingActionBtn, styles.createActionBtn, createActionStyle]}>
                <Animated.View
                  style={[StyleSheet.absoluteFill, styles.actionTintLayer, createTintStyle]}
                  pointerEvents="none"
                />
                <View style={styles.actionContentRow}>
                  <Text style={styles.createActionText}>Create</Text>
                  <Ionicons name="sparkles" size={12} color="#FFFFFF" />
                </View>
              </Animated.View>
            </Animated.View>
          </Pressable>
        </View>
      ) : null}
      {cards.map((item, index) => {
        const entranceOrder = enteringCardIds.indexOf(item.id);
        const shouldAnimateEntrance = entranceOrder >= 0;

        return (
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
            onSwipeStart={onCardSwipeStart}
            onSwipe={onCardSwipe}
            animationSeed={animationSeed}
            shouldAnimateEntrance={shouldAnimateEntrance}
            entranceOrder={entranceOrder}
          />
        );
      })}
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
    height: 44,
    borderRadius: BUTTON_TOKENS.radius.md,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1.2,
    overflow: 'hidden',
    backgroundColor: '#2D8A56',
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  actionPressTarget: {
    borderRadius: BUTTON_TOKENS.radius.md,
  },
  actionShell: {
    position: 'relative',
    borderRadius: BUTTON_TOKENS.radius.md,
  },
  skipActionBtn: {
    borderColor: 'rgba(255, 214, 214, 0.5)',
  },
  createActionBtn: {
    borderColor: 'rgba(207, 245, 222, 0.5)',
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
  skipActionText: {
    color: '#FFFFFF',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  createActionText: {
    color: '#FFFFFF',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
});
