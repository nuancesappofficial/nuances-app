import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Reanimated from 'react-native-reanimated';
import type Card from '@database/models/Card';

type Props = {
  scopedCards: Card[];
  flatListRef: React.RefObject<FlatList<Card> | null>;
  currentIndex: number;
  displayIndex: number;
  extraData?: unknown;
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
  extraData,
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
          extraData={extraData}
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
});
