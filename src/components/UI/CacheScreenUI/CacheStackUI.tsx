import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import CacheCardUI from './CacheCardUI';

type CacheStackItem = {
  id: string;
  imageUri?: string;
  text: string;
  sourceLabel: string;
  importedAtLabel: string;
};

type Props = {
  cards: CacheStackItem[];
  animationSeed: number;
  restoreSeed: number;
  onCardSwipe: (itemId: string, direction: 'left' | 'right') => void;
};

export default function CacheStackUI({ cards, animationSeed, restoreSeed, onCardSwipe }: Props) {
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
      opacity: 0.35 + progress * 0.65,
      transform: [{ scale: 1 + progress * 0.08 }],
      backgroundColor: '#FFEEEE',
      borderColor: `rgba(204, 51, 51, ${0.18 + progress * 0.32})`,
    };
  });

  const createActionStyle = useAnimatedStyle(() => {
    const progress = interpolate(topCardDragX.value, [0, 140], [0, 1], Extrapolate.CLAMP);
    return {
      opacity: 0.35 + progress * 0.65,
      transform: [{ scale: 1 + progress * 0.08 }],
      backgroundColor: '#E6F9EF',
      borderColor: `rgba(26, 138, 58, ${0.18 + progress * 0.32})`,
    };
  });

  const skipTintStyle = useAnimatedStyle(() => {
    const progress = interpolate(topCardDragX.value, [-180, 0], [1, 0], Extrapolate.CLAMP);
    return {
      backgroundColor: `rgba(244, 67, 54, ${0.12 + progress * 0.28})`,
    };
  });

  const createTintStyle = useAnimatedStyle(() => {
    const progress = interpolate(topCardDragX.value, [0, 180], [0, 1], Extrapolate.CLAMP);
    return {
      backgroundColor: `rgba(76, 175, 80, ${0.12 + progress * 0.28})`,
    };
  });

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
          <Pressable onPress={() => triggerTopCardSwipe('left')} style={styles.actionPressTarget}>
            <Animated.View style={[styles.floatingActionBtn, styles.skipActionBtn, skipActionStyle]}>
              <Animated.View style={[StyleSheet.absoluteFill, skipTintStyle]} />
              <View style={styles.actionContentRow}>
                <Ionicons name="close" size={14} color="#D75454" />
                <Text style={styles.skipActionText}>Skip</Text>
              </View>
            </Animated.View>
          </Pressable>
          <Pressable onPress={() => triggerTopCardSwipe('right')} style={styles.actionPressTarget}>
            <Animated.View style={[styles.floatingActionBtn, styles.createActionBtn, createActionStyle]}>
              <Animated.View style={[StyleSheet.absoluteFill, createTintStyle]} />
              <View style={styles.actionContentRow}>
                <Text style={styles.createActionText}>Create</Text>
                <Ionicons name="sparkles" size={12} color="#44A764" />
              </View>
            </Animated.View>
          </Pressable>
        </View>
      ) : null}
      {cards.map((item, index) => (
        <CacheCardUI
          key={`${animationSeed}-${item.id}`}
          itemId={item.id}
          imageUri={item.imageUri}
          text={item.text}
          sourceLabel={item.sourceLabel}
          importedAtLabel={item.importedAtLabel}
          index={index}
          isTopCard={index === cards.length - 1}
          topCardDragX={topCardDragX}
          swipeTrigger={swipeTrigger}
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
    height: 32,
    borderRadius: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  actionPressTarget: {
    borderRadius: 12,
  },
  skipActionBtn: {
    borderColor: 'rgba(204, 51, 51, 0.2)',
  },
  createActionBtn: {
    borderColor: 'rgba(26, 138, 58, 0.2)',
  },
  actionContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  skipActionText: {
    color: '#D75454',
    fontSize: 12,
    fontWeight: '700',
  },
  createActionText: {
    color: '#44A764',
    fontSize: 12,
    fontWeight: '700',
  },
});
