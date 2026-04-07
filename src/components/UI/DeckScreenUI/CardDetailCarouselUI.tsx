import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Reanimated from 'react-native-reanimated';
import type Card from '@database/models/Card';

type Props = {
  scopedCards: Card[];
  flatListRef: React.RefObject<FlatList<Card> | null>;
  currentIndex: number;
  displayIndex: number;
  renderItem: ({ item, index }: { item: Card; index: number }) => React.ReactElement;
  scrollHandler: any;
  onMomentumScrollEnd: (event: any) => void;
  snapInterval: number;
  sidePadding: number;
};

export default function CardDetailCarouselUI({
  scopedCards,
  flatListRef,
  currentIndex: _currentIndex,
  displayIndex,
  renderItem,
  scrollHandler,
  onMomentumScrollEnd,
  snapInterval,
  sidePadding,
}: Props) {
  return (
    <View style={styles.stageSection}>
      <View style={styles.carouselStage}>
        <Reanimated.FlatList
          ref={flatListRef}
          data={scopedCards}
          keyExtractor={(item) => item.id}
          horizontal
          scrollEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={snapInterval}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          directionalLockEnabled
          alwaysBounceHorizontal={false}
          bounces={false}
          overScrollMode="never"
          contentContainerStyle={[styles.carouselContent, { paddingHorizontal: sidePadding }]}
          initialNumToRender={3}
          windowSize={5}
          maxToRenderPerBatch={3}
          removeClippedSubviews={false}
          getItemLayout={(_, index) => ({
            length: snapInterval,
            offset: snapInterval * index,
            index,
          })}
          renderItem={renderItem}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          onMomentumScrollEnd={onMomentumScrollEnd}
        />
      </View>

      <View pointerEvents="none" style={styles.floatingCountWrap}>
        <BlurView intensity={26} tint="dark" style={styles.floatingCountPill}>
          <Text style={styles.floatingCountText}>{`${displayIndex + 1}/${scopedCards.length}`}</Text>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stageSection: {
    flex: 1,
    paddingTop: 0,
    backgroundColor: 'transparent',
  },
  carouselStage: {
    flex: 1,
    minHeight: 620,
    marginTop: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  carouselContent: {
    paddingHorizontal: 0,
  },
  floatingCountWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCountPill: {
    minWidth: 56,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(16, 16, 18, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  floatingCountText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
