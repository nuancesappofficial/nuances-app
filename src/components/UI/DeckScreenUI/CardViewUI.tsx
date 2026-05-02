import React from 'react';
import {
  Animated,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type Card from '@database/models/Card';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import { SCREEN_BG, resolveThemeColors } from '../../../theme/colors';

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
  onPressPlay: () => void;
  onPressReviewTuning: () => void;
  onPressCard: (card: Card) => void;
  onPressMoreCard: (card: Card) => void;
  cardImageMap: Record<string, string>;
  getWordText: (card: Card) => string;
  getLearningStatus: (card: Card) => LearningStatus | null;
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
  onPressPlay,
  onPressReviewTuning,
  onPressCard,
  onPressMoreCard,
  cardImageMap,
  getWordText,
  getLearningStatus,
  withHexAlpha,
}: Props) {
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors('dark'), [colorScheme]);
  const isLight = false;
  const { width: screenWidth } = useWindowDimensions();
  const searchExpandProgress = React.useRef(new Animated.Value(isSearchVisible ? 1 : 0)).current;
  const maxSearchWidth = Math.max(160, screenWidth - 16 * 2 - 40 - 10);
  const searchAnimatedWidth = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [40, maxSearchWidth],
  });
  const searchFieldOpacity = searchExpandProgress.interpolate({
    inputRange: [0, 0.22, 1],
    outputRange: [0, 0, 1],
  });
  const searchFieldTranslateX = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
  });
  const searchIconOpacity = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const closeIconOpacity = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const backOpacity = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const backWidth = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  });
  const shellBorderColor = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(78,175,244,0)', 'rgba(78,175,244,0.45)'],
  });
  const shellBackgroundColor = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(18,29,45,0)', 'rgba(18,29,45,0)'],
  });
  const shellBorderWidth = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  React.useEffect(() => {
    Animated.timing(searchExpandProgress, {
      toValue: isSearchVisible ? 1 : 0,
      duration: 240,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      if (isSearchVisible) {
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else {
        searchInputRef.current?.blur();
      }
    });
  }, [isSearchVisible, searchExpandProgress, searchInputRef]);

  const listHeader = (
    <View style={styles.headerWrap}>
      <View style={styles.topNavRow}>
        <Animated.View
          style={[styles.backAnimatedWrap, { width: backWidth, opacity: backOpacity }]}
          pointerEvents={isSearchVisible ? 'none' : 'auto'}
        >
          <TouchableOpacity onPress={onPressBack} style={styles.iconHitArea}>
            <Ionicons name="chevron-back" size={30} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.topNavRightRow}>
          <Animated.View style={[styles.searchAnimatedWrap, { width: searchAnimatedWidth }]}>
            <Animated.View
              style={[
                styles.searchShell,
                {
                  borderColor: shellBorderColor,
                  borderWidth: shellBorderWidth,
                  backgroundColor: shellBackgroundColor,
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.searchFieldWrap,
                  {
                    opacity: searchFieldOpacity,
                    transform: [{ translateX: searchFieldTranslateX }],
                  },
                ]}
                pointerEvents={isSearchVisible ? 'auto' : 'none'}
              >
                <Ionicons name="search" size={20} color="#FBFBFB" style={styles.searchLeadingIcon} />
                <TextInput
                  ref={searchInputRef}
                  value={searchQuery}
                  onChangeText={onChangeSearchQuery}
                  placeholder="Search words"
                  placeholderTextColor="#8DA0BE"
                  style={styles.searchInput}
                  returnKeyType="search"
                />
              </Animated.View>

              <TouchableOpacity style={styles.searchToggleButton} activeOpacity={0.82} onPress={onPressSearch}>
                <Animated.View style={[styles.iconLayer, { opacity: searchIconOpacity }]}>
                  <Ionicons name="search" size={30} color="#FFFFFF" />
                </Animated.View>
                <Animated.View style={[styles.iconLayer, styles.iconLayerOverlay, { opacity: closeIconOpacity }]}>
                  <Ionicons name="close" size={30} color="#FFFFFF" />
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>

          <TouchableOpacity style={styles.rawIconButton} onPress={onPressSort}>
            <Ionicons name="swap-vertical" size={30} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.titleText} numberOfLines={1}>
        {albumName || 'Made for You'}
      </Text>

      <View style={styles.progressRow}>
        <View style={styles.progressDot} />
        <Text style={styles.progressText}>{`${processedCards.length} words`}</Text>
      </View>

      <View style={styles.actionButtonsRow}>
        <TouchableOpacity
          style={styles.playButton}
          activeOpacity={0.9}
          onPress={onPressPlay}
        >
          <Ionicons name="play" size={16} color="#0F172A" />
          <Text style={styles.actionButtonText}>Play</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tuningButton}
          activeOpacity={0.9}
          onPress={onPressReviewTuning}
        >
          <Ionicons name="options-outline" size={18} color="#F8FAFC" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Animated.View style={[styles.screenWrap, { opacity: screenOpacity }]}>
      <SafeAreaView style={[styles.container, { backgroundColor: palette.screenBg }]} edges={['top']}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <LinearGradient
            colors={[
              isLight ? palette.containerBg : '#1E293B',
              withHexAlpha(themeColor, '26'),
              withHexAlpha(themeColor, '1A'),
              isLight ? 'rgba(248,250,252,0.16)' : 'rgba(30,41,59,0.15)',
            ]}
            locations={[0, 0.22, 0.52, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.topThemeGradient}
          />
          <LinearGradient
            colors={
              isLight
                ? ['rgba(169,197,217,0)', 'rgba(169,197,217,0.72)', palette.screenBg]
                : ['rgba(15,23,42,0)', 'rgba(15,23,42,0.75)', '#0F172A']
            }
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
                    <Text style={styles.thumbnailFallbackText} numberOfLines={1}>
                      {getWordText(item).slice(0, 1)}
                    </Text>
                  )}
                </View>

                <View style={styles.cardMiddle}>
                  <Text style={styles.wordText} numberOfLines={1}>
                    {getWordText(item)}
                  </Text>

                  {status ? (
                    <View style={[styles.statusBadge, { backgroundColor: status.bgColor }]}>
                      <Text style={[styles.statusIcon, status.label === 'NEW' ? styles.statusTextNew : null]}>
                        {status.icon}
                      </Text>
                      <Text style={[styles.statusText, status.label === 'NEW' ? styles.statusTextNew : null]}>
                        {status.label}
                      </Text>
                    </View>
                  ) : null}
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
    backgroundColor: SCREEN_BG,
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
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 12,
  },
  backAnimatedWrap: {
    overflow: 'hidden',
  },
  topNavRightRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  iconHitArea: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchAnimatedWrap: {
    height: 44,
  },
  rawIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  searchShell: {
    width: '100%',
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 6,
  },
  searchFieldWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
  },
  searchLeadingIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 42,
    color: '#FFFFFF',
    paddingVertical: 0,
  },
  searchToggleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayerOverlay: {
    position: 'absolute',
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
  playButton: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4EAFF4',
  },
  tuningButton: {
    width: 52,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionButtonText: {
    color: '#0F172A',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  thumbnailWrap: {
    width: 68,
    height: 68,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailImage: {
    ...StyleSheet.absoluteFillObject,
  },
  thumbnailFallbackText: {
    color: '#F8FAFC',
    fontSize: 24,
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
  statusTextNew: {
    color: '#FF6B6B',
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
