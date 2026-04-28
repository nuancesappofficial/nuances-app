import React from 'react';
import { Animated, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type SharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import AlbumIconItemUI from './AlbumIconItemUI';
import type { DeckAlbum } from './deckTypes';

const ALBUMS_PER_PAGE = 9;
const GRID_COLUMNS = 3;
const GRID_GAP = 6;
const GRID_HORIZONTAL_PADDING = 12;
const ALBUM_GROUP_HORIZONTAL_MARGIN = 10;
// 調整整個「相簿格子 + 分頁圓點」群組的垂直位移（負值往上、正值往下）
const ALBUM_GROUP_OFFSET_Y = 0;

type Props = {
  heroStatusText?: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onPressAvatar?: () => void;
  onPressCacheFab?: () => void;
  onOpenCreateAlbum: () => void;
  sortOrder: 'desc' | 'asc';
  onToggleSort: () => void;
  filterPills: string[];
  todayReviewTotalCount: number;
  todayReviewPendingCount: number;
  onPressTodayReview: () => void;
  onPressTodayReviewTuning: () => void;
  slideshowItems: Array<{ cardId: string; text: string; imageUri?: string }>;
  onPressSlideshowItem: (item: { cardId: string; text: string; imageUri?: string }) => void;
  albums: DeckAlbum[];
  onPressAlbum: (album: DeckAlbum) => void;
  isMenuVisible: SharedValue<boolean>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  hoveredAction: SharedValue<'none' | 'sort' | 'edit' | 'delete'>;
  activeAlbumId: string | null;
  onMenuStart: (album: DeckAlbum, layout: { x: number; y: number; width: number; height: number }) => void;
  onMenuFinish: () => void;
  onActionEnd: (album: DeckAlbum, action: 'none' | 'sort' | 'edit' | 'delete') => void;
};

export default function DeckMainScreenUI({
  searchQuery,
  onSearchChange,
  onClearSearch,
  onOpenCreateAlbum,
  sortOrder,
  onToggleSort,
  filterPills,
  todayReviewTotalCount,
  todayReviewPendingCount,
  onPressTodayReview,
  onPressTodayReviewTuning,
  slideshowItems,
  onPressSlideshowItem,
  albums,
  onPressAlbum,
  isMenuVisible,
  startX,
  startY,
  hoveredAction,
  activeAlbumId,
  onMenuStart,
  onMenuFinish,
  onActionEnd,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const searchInputRef = React.useRef<TextInput | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = React.useState(false);
  const searchExpandProgress = React.useRef(new Animated.Value(0)).current;
  const todayReviewPulse = React.useRef(new Animated.Value(0)).current;
  const todayReviewWhoosh = React.useRef(new Animated.Value(0)).current;
  const [wordIndex, setWordIndex] = React.useState(0);
  const wordOpacity = React.useRef(new Animated.Value(1)).current;
  const albumPageWidth = Math.max(0, screenWidth - ALBUM_GROUP_HORIZONTAL_MARGIN * 2);
  const albumItemWidth = Math.max(
    0,
    (albumPageWidth - GRID_HORIZONTAL_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS
  );
  const [currentPage, setCurrentPage] = React.useState(0);
  const maxSearchWidth = Math.max(160, screenWidth - 16 * 2 - 40 - 10);
  const isTodayReviewActive = todayReviewPendingCount > 0;

  const searchAnimatedWidth = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [40, maxSearchWidth],
  });
  const searchFieldOpacity = searchExpandProgress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0, 1],
  });
  const searchFieldTranslateX = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });
  const searchIconOpacity = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const closeIconOpacity = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const searchIconRotate = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });
  const closeIconRotate = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-90deg', '0deg'],
  });
  const closeIconTranslateX = 1;
  const searchShellBorderColor = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(78,175,244,0)', 'rgba(78,175,244,0.45)'],
  });
  const searchShellBackgroundColor = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(2,33,61,0)', 'rgba(2,33,61,0.9)'],
  });
  const searchShellBorderWidth = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const albumPages = React.useMemo(() => {
    if (albums.length <= ALBUMS_PER_PAGE) return [albums];
    const pages: DeckAlbum[][] = [];
    for (let i = 0; i < albums.length; i += ALBUMS_PER_PAGE) {
      pages.push(albums.slice(i, i + ALBUMS_PER_PAGE));
    }
    return pages;
  }, [albums]);

  React.useEffect(() => {
    const lastPage = Math.max(0, albumPages.length - 1);
    if (currentPage > lastPage) {
      setCurrentPage(lastPage);
    }
  }, [albumPages.length, currentPage]);

  React.useEffect(() => {
    if (slideshowItems.length <= 1) return;
    const timer = setInterval(() => {
      Animated.timing(wordOpacity, {
        toValue: 0,
        duration: 170,
        useNativeDriver: true,
      }).start(() => {
        setWordIndex((prev) => {
          if (slideshowItems.length <= 1) return 0;
          let next = prev;
          while (next === prev) {
            next = Math.floor(Math.random() * slideshowItems.length);
          }
          return next;
        });
        Animated.timing(wordOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }).start();
      });
    }, 2600);

    return () => clearInterval(timer);
  }, [slideshowItems, wordOpacity]);

  React.useEffect(() => {
    if (!isTodayReviewActive) {
      todayReviewPulse.stopAnimation();
      todayReviewPulse.setValue(0);
      todayReviewWhoosh.stopAnimation();
      todayReviewWhoosh.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(todayReviewPulse, {
          toValue: 1,
          duration: 920,
          useNativeDriver: false,
        }),
        Animated.timing(todayReviewPulse, {
          toValue: 0,
          duration: 920,
          useNativeDriver: false,
        }),
      ])
    );
    const whooshLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(todayReviewWhoosh, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(todayReviewWhoosh, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(400),
      ])
    );
    loop.start();
    whooshLoop.start();
    return () => {
      loop.stop();
      whooshLoop.stop();
    };
  }, [isTodayReviewActive, todayReviewPulse, todayReviewWhoosh]);

  React.useEffect(() => {
    if (wordIndex >= slideshowItems.length) setWordIndex(0);
  }, [slideshowItems.length, wordIndex]);

  const renderAlbumPage = React.useCallback(
    (pageAlbums: DeckAlbum[], pageIndex: number) => {
      const rowCount = albumPages.length > 1 ? 3 : Math.max(1, Math.ceil(pageAlbums.length / GRID_COLUMNS));

      return (
        <View style={[styles.page, { width: albumPageWidth }]}>
          <View style={styles.albumGridContent}>
            {Array.from({ length: rowCount }).map((_, rowIndex) => {
              const rowAlbums = pageAlbums.slice(rowIndex * GRID_COLUMNS, (rowIndex + 1) * GRID_COLUMNS);
              return (
                <View
                  key={`page-${pageIndex}-row-${rowIndex}`}
                  style={[styles.albumRow, rowIndex === rowCount - 1 ? styles.albumRowLast : null]}
                >
                  {Array.from({ length: GRID_COLUMNS }).map((__, colIndex) => {
                    const item = rowAlbums[colIndex];
                    return (
                      <View key={`cell-${pageIndex}-${rowIndex}-${colIndex}`} style={{ width: albumItemWidth }}>
                        {item ? (
                          <AlbumIconItemUI
                            item={item}
                            onPress={onPressAlbum}
                            isMenuVisible={isMenuVisible}
                            startX={startX}
                            startY={startY}
                            hoveredAction={hoveredAction}
                            activeAlbumId={activeAlbumId}
                            onMenuStart={onMenuStart}
                            onMenuFinish={onMenuFinish}
                            onActionEnd={onActionEnd}
                          />
                        ) : (
                          <View style={styles.albumCellPlaceholder} />
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </View>
      );
    },
    [
      albumPageWidth,
      albumPages.length,
      onPressAlbum,
      isMenuVisible,
      startX,
      startY,
      hoveredAction,
      activeAlbumId,
      onMenuStart,
      onMenuFinish,
      onActionEnd,
      albumItemWidth,
    ]
  );

  React.useEffect(() => {
    Animated.timing(searchExpandProgress, {
      toValue: isSearchExpanded ? 1 : 0,
      duration: 240,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      if (isSearchExpanded) {
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else {
        searchInputRef.current?.blur();
      }
    });
  }, [isSearchExpanded, searchExpandProgress]);

  const handleSearchToggle = React.useCallback(() => {
    if (isSearchExpanded) {
      onClearSearch();
      setIsSearchExpanded(false);
      return;
    }
    setIsSearchExpanded(true);
  }, [isSearchExpanded, onClearSearch]);

  const activeShowcaseItem = slideshowItems[wordIndex];
  const activeReviewShadowOpacity = todayReviewPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0.55],
  });
  const activeReviewShadowRadius = todayReviewPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 22],
  });
  const activeReviewScale = todayReviewPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.018],
  });
  const activeReviewWhooshTranslateX = todayReviewWhoosh.interpolate({
    inputRange: [0, 1],
    outputRange: [-260, 260],
  });
  const activeReviewWhooshOpacity = todayReviewWhoosh.interpolate({
    inputRange: [0, 0.12, 0.85, 1],
    outputRange: [0, 0.2, 0.2, 0],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topRightRow}>
        <Image source={require('../../../../assets/NUANCES_ICON6.png')} style={styles.brandIcon} resizeMode="cover" />
        <View style={styles.topActionsRow}>
          <Animated.View style={[styles.searchAnimatedWrap, { width: searchAnimatedWidth }]}>
            <Animated.View
              style={[
                styles.searchInputWrap,
                {
                  borderColor: searchShellBorderColor,
                  backgroundColor: searchShellBackgroundColor,
                  borderWidth: searchShellBorderWidth,
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
                pointerEvents={isSearchExpanded ? 'auto' : 'none'}
              >
                <Ionicons name="search" size={20} color="#FBFBFB" style={styles.searchLeadingIcon} />
                <TextInput
                  ref={searchInputRef}
                  value={searchQuery}
                  onChangeText={onSearchChange}
                  placeholder="搜尋卡片關鍵字"
                  placeholderTextColor="#8E8E93"
                  style={styles.searchInput}
                  returnKeyType="search"
                />
              </Animated.View>

              <TouchableOpacity style={styles.searchToggleButton} activeOpacity={0.8} onPress={handleSearchToggle}>
                <Animated.View
                  style={[
                    styles.iconLayer,
                    {
                      opacity: searchIconOpacity,
                      transform: [{ rotate: searchIconRotate }],
                    },
                  ]}
                >
                  <Ionicons name="search" size={30} color="#FBFBFB" />
                </Animated.View>
                <Animated.View
                  style={[
                    styles.iconLayer,
                    styles.iconLayerOverlay,
                    {
                      opacity: closeIconOpacity,
                      transform: [{ rotate: closeIconRotate }, { translateX: closeIconTranslateX }],
                    },
                  ]}
                >
                  <Ionicons name="close" size={30} color="#FBFBFB" />
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>

          <TouchableOpacity style={styles.rawIconButton} activeOpacity={0.7} onPress={onOpenCreateAlbum}>
            <Ionicons name="add" size={38} color="#FBFBFB" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.albumGroupShadow}>
        <View style={styles.albumGroup}>
          <FlatList
            data={albumPages}
            horizontal
            pagingEnabled
            style={styles.albumPager}
            keyExtractor={(_, index) => `album-page-${index}`}
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            bounces={false}
          onMomentumScrollEnd={(event) => {
            const offsetX = event.nativeEvent.contentOffset.x;
            const page = Math.round(offsetX / Math.max(albumPageWidth, 1));
            setCurrentPage(Math.max(0, Math.min(page, albumPages.length - 1)));
          }}
            renderItem={({ item, index }) => renderAlbumPage(item, index)}
          />

          {albumPages.length > 1 ? (
            <View style={styles.paginationDots}>
              {albumPages.map((_, index) => (
                <View
                  key={`dot-${index}`}
                  style={[styles.paginationDot, index === currentPage ? styles.paginationDotActive : null]}
                />
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.todayReviewWrap}>
        <Animated.View
          style={
            isTodayReviewActive
              ? {
                  transform: [{ scale: activeReviewScale }],
                  shadowOpacity: activeReviewShadowOpacity,
                  shadowRadius: activeReviewShadowRadius,
                }
              : undefined
          }
        >
          {isTodayReviewActive ? (
            <TouchableOpacity
              style={[styles.todayReviewCard, styles.todayReviewCardActive]}
              activeOpacity={0.9}
              onPress={onPressTodayReview}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.todayReviewWhoosh,
                  {
                    opacity: activeReviewWhooshOpacity,
                    transform: [{ translateX: activeReviewWhooshTranslateX }, { rotate: '-18deg' }],
                  },
                ]}
              />
              <View style={styles.todayReviewHeaderRow}>
                <Text style={styles.todayReviewLabel}>New words</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.todayReviewInactiveRow}>
              <TouchableOpacity
                style={[styles.todayReviewCard, styles.todayReviewCardInactive, styles.todayReviewQuickQuizButton]}
                activeOpacity={0.9}
                onPress={onPressTodayReview}
              >
                <View style={[styles.todayReviewHeaderRow, styles.todayReviewHeaderRowInactive]}>
                  <Text style={[styles.todayReviewLabel, styles.todayReviewLabelInactive]}>Quick quiz</Text>
                  <Ionicons name="play" size={16} color="#1C3E63" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.todayReviewEqualizerButton}
                activeOpacity={0.9}
                onPress={onPressTodayReviewTuning}
              >
                <Ionicons name="options-outline" size={22} color="#1C3E63" />
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </View>

      <View style={styles.wordShowcaseWrap}>
        <TouchableOpacity
          style={styles.wordShowcase}
          activeOpacity={0.88}
          disabled={!activeShowcaseItem}
          onPress={() => {
            if (!activeShowcaseItem) return;
            onPressSlideshowItem(activeShowcaseItem);
          }}
        >
          <Text style={styles.wordShowcaseLabel}>Word Pop</Text>
          <View style={styles.wordShowcaseContent}>
            {activeShowcaseItem?.imageUri ? (
              <Animated.View style={[styles.wordThumbWrap, { opacity: wordOpacity }]}>
                <Image source={{ uri: activeShowcaseItem.imageUri }} style={styles.wordThumb} />
              </Animated.View>
            ) : (
              <Animated.View style={[styles.wordThumbFallback, { opacity: wordOpacity }]}>
                <Text style={styles.wordThumbFallbackText}>Aa</Text>
              </Animated.View>
            )}
            <Animated.Text style={[styles.wordShowcaseWord, { opacity: wordOpacity }]} numberOfLines={2}>
              {activeShowcaseItem?.text || 'Start adding cards to generate words'}
            </Animated.Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02213D',
  },
  topRightRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 60,
    height: 60,
    borderRadius: 8,
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
  searchInputWrap: {
    width: '100%',
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 6,
  },
  searchFieldWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  searchLeadingIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FBFBFB',
    fontSize: 15,
    paddingVertical: 0,
  },
  searchToggleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayerOverlay: {
    position: 'absolute',
  },
  albumGroupShadow: {
    alignSelf: 'center',
    marginHorizontal: ALBUM_GROUP_HORIZONTAL_MARGIN,
    marginTop: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 8,
    transform: [{ translateY: ALBUM_GROUP_OFFSET_Y }],
  },
  albumGroup: {
    borderRadius: 24,
    backgroundColor: '#8FD2FA',
    overflow: 'hidden',
  },
  albumGridContent: {
    paddingHorizontal: GRID_HORIZONTAL_PADDING,
    paddingTop: 10,
    paddingBottom: 32,
  },
  page: {
    width: '100%',
  },
  albumPager: {
    flexGrow: 0,
    backgroundColor: '#8FD2FA',
  },
  albumRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    marginBottom: 8,
  },
  albumRowLast: {
    marginBottom: 0,
  },
  albumCellPlaceholder: {
    width: '100%',
    aspectRatio: 1,
  },
  paginationDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  paginationDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(2,33,61,0.3)',
  },
  paginationDotActive: {
    backgroundColor: '#02213D',
  },
  wordShowcaseWrap: {
    marginTop: 10,
    marginHorizontal: 10,
    marginBottom: 12,
  },
  todayReviewWrap: {
    marginTop: 12,
    marginHorizontal: 10,
  },
  todayReviewCard: {
    minHeight: 88,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  todayReviewInactiveRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  todayReviewCardActive: {
    backgroundColor: '#D97706',
    borderColor: 'rgba(255,214,153,0.95)',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  todayReviewCardInactive: {
    backgroundColor: '#8FD2FA',
    borderColor: 'rgba(2,33,61,0.22)',
    shadowColor: '#2C79B4',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  todayReviewQuickQuizButton: {
    flex: 1,
    minHeight: 74,
  },
  todayReviewEqualizerButton: {
    width: 74,
    height: 74,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(2,33,61,0.22)',
    backgroundColor: '#8FD2FA',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2C79B4',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  todayReviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },
  todayReviewHeaderRowInactive: {
    marginBottom: 0,
  },
  todayReviewLabel: {
    color: '#F7FBFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  todayReviewLabelInactive: {
    color: '#1C3E63',
    fontWeight: '700',
  },
  todayReviewWhoosh: {
    position: 'absolute',
    top: -28,
    bottom: -28,
    width: 120,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  wordShowcase: {
    minHeight: 88,
    borderRadius: 20,
    backgroundColor: '#8FD2FA',
    borderWidth: 1,
    borderColor: 'rgba(2,33,61,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  wordShowcaseLabel: {
    color: 'rgba(28,62,99,0.86)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  wordShowcaseContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wordThumbWrap: {
    width: 54,
    height: 54,
    borderRadius: 12,
    overflow: 'hidden',
  },
  wordThumb: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  wordThumbFallback: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: 'rgba(251,251,251,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordThumbFallbackText: {
    color: '#1C3E63',
    fontSize: 18,
    fontWeight: '700',
  },
  wordShowcaseWord: {
    color: '#1C3E63',
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
});
