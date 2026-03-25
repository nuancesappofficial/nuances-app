import React from 'react';
import { View, StyleSheet } from 'react-native';
import CacheCardUI from './CacheCardUI';

type CacheStackItem = {
  id: string;
  imageUri?: string;
  text: string;
};

type Props = {
  cards: CacheStackItem[];
  animationSeed: number;
  onCardSwipe: (itemId: string, direction: 'left' | 'right') => void;
};

export default function CacheStackUI({ cards, animationSeed, onCardSwipe }: Props) {
  return (
    <View style={styles.stackContainer}>
      {cards.map((item, index) => (
        <CacheCardUI
          key={`${animationSeed}-${item.id}`}
          itemId={item.id}
          imageUri={item.imageUri}
          text={item.text}
          index={index}
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
});
