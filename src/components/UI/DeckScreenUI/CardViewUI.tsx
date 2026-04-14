import React from 'react';
import {
  Animated,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type Card from '@database/models/Card';

type LearningStatus = { label: 'NEW' | 'LEARNING'; icon: string; bgColor: string };

type Props = {
  screenOpacity: Animated.Value;
  themeColor: string;
  albumName: string;
  processedCards: Card[];
  learnedPercent: number;
  searchQuery: string;
  onChangeSearchQuery: (value: string) => void;
  isSearchVisible: boolean;
  searchInputRef: React.RefObject<TextInput | null>;
  onPressBack: () => void;
  onPressSearch: () => void;
  onPressSort: () => void;
  onPressCard: (card: Card) => void;
  onPressMoreCard: (card: Card) => void;
  cardImageMap: Record<string, string>;
  getWordText: (card: Card) => string;
  getLearningStatus: (card: Card) => LearningStatus;
  withHexAlpha: (color: string, alphaHex: string) => string;
};

export default function CardViewUI({
  screenOpacity,
  themeColor,
  albumName,
  processedCards,
  learnedPercent,
  searchQuery,
  onChangeSearchQuery,
  isSearchVisible,
  searchInputRef,
  onPressBack,
  onPressSearch,
  onPressSort,
  onPressCard,
  onPressMoreCard,
  cardImageMap,
  getWordText,
  getLearningStatus,
  withHexAlpha,
}: Props) {
  const listHeader = (
    <View style={styles.headerWrap}>
      <View style={styles.topNavRow}>
        <TouchableOpacity onPress={onPressBack} style={styles.iconHitArea}>
          <Text style={styles.navIcon}>‹</Text>
        </TouchableOpacity>

        <View style={styles.topNavRightRow}>
          <TouchableOpacity style={styles.iconHitArea} onPress={onPressSearch}>
            <Text style={styles.navIcon}>⌕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconHitArea} onPress={onPressSort}>
            <Text style={styles.navIcon}>⇅</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isSearchVisible ? (
        <View style={styles.searchWrap}>
          <TextInput
            ref={searchInputRef}
            value={searchQuery}
            onChangeText={onChangeSearchQuery}
            placeholder="Search words"
            placeholderTextColor="#8DA0BE"
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>
      ) : null}

      <Text style={styles.titleText} numberOfLines={1}>
        {albumName || 'Made for You'}
      </Text>

      <View style={styles.progressRow}>
        <View style={styles.progressDot} />
        <Text style={styles.progressText}>{`${processedCards.length} words, ${learnedPercent}% learned`}</Text>
      </View>

      <View style={styles.actionButtonsRow}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: themeColor }]} activeOpacity={0.9}>
          <Text style={styles.actionButtonIcon}>▥</Text>
          <Text style={styles.actionButtonText}>Review words</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: themeColor }]} activeOpacity={0.9}>
          <Text style={styles.actionButtonIcon}>☰</Text>
          <Text style={styles.actionButtonText}>Personalize</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Animated.View style={[styles.screenWrap, { opacity: screenOpacity }]}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <LinearGradient
            colors={[
              withHexAlpha(themeColor, 'F0'),
              withHexAlpha(themeColor, '8C'),
              withHexAlpha(themeColor, '2E'),
              'rgba(0,0,0,0)',
            ]}
            locations={[0, 0.2, 0.46, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.topThemeGradient}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.74)', 'rgba(0,0,0,1)']}
            locations={[0, 0.56, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.bottomBlackGradient}
          />
        </View>
        <FlatList
          data={processedCards}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const status = getLearningStatus(item);
            const imageUri = cardImageMap[item.id];

            return (
              <TouchableOpacity style={styles.cardRow} activeOpacity={0.9} onPress={() => onPressCard(item)}>
                <View style={styles.thumbnailWrap}>
                  {imageUri ? (
                    <Image
                      source={{ uri: imageUri }}
                      style={styles.thumbnailImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.thumbnailFallback}>
                      <Text style={styles.thumbnailFallbackText} numberOfLines={1}>
                        {getWordText(item).slice(0, 1)}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardMiddle}>
                  <Text style={styles.wordText} numberOfLines={1}>
                    {getWordText(item)}
                  </Text>

                  <View style={[styles.statusBadge, { backgroundColor: status.bgColor }]}>
                    <Text style={styles.statusIcon}>{status.icon}</Text>
                    <Text style={styles.statusText}>{status.label}</Text>
                  </View>
                </View>

                <View style={styles.moreWrap}>
                  <TouchableOpacity
                    style={styles.moreButton}
                    onPress={(event) => {
                      event.stopPropagation?.();
                      onPressMoreCard(item);
                    }}
                  >
                    <Text style={styles.moreIcon}>⋯</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No words yet</Text>
            </View>
          }
        />
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  topThemeGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomBlackGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  headerWrap: {
    paddingTop: 8,
    marginBottom: 8,
  },
  topNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  topNavRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconHitArea: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIcon: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 26,
  },
  searchWrap: {
    marginBottom: 12,
  },
  searchInput: {
    height: 42,
    borderRadius: 10,
    backgroundColor: '#121D2D',
    borderWidth: 1,
    borderColor: '#2A3D5D',
    color: '#FFFFFF',
    paddingHorizontal: 12,
  },
  titleText: {
    color: '#F7F8FA',
    fontSize: 34,
    fontWeight: '700',
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F7F8FA',
  },
  progressText: {
    color: '#E6ECFA',
    fontSize: 14,
    fontWeight: '500',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionButtonIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 16,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  thumbnailWrap: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: '#1A1E27',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailImage: {
    ...StyleSheet.absoluteFillObject,
  },
  thumbnailFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailFallbackText: {
    color: '#DDE7FF',
    fontSize: 22,
    fontWeight: '700',
  },
  cardMiddle: {
    flex: 1,
    marginLeft: 12,
  },
  wordText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusIcon: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  moreWrap: {
    marginLeft: 6,
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  moreIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 20,
  },
  emptyWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#E6ECFA',
    fontSize: 14,
    fontWeight: '500',
  },
});
