import React from 'react';
import { Animated, FlatList, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useColorScheme, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { type SharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import AlbumIconItemUI from './AlbumIconItemUI';
import type { DeckAlbum } from './deckTypes';
import {
  CONTAINER_BG,
  CONTAINER_NEON_GLOW,
  CONTAINER_NEON_OUTLINE,
  SCREEN_BG,
  TEXT_ON_BG,
  TEXT_ON_CONTAINER,
  resolveThemeColors,
} from '../../../theme/colors';

const ALBUMS_PER_PAGE = 9;
const GRID_COLUMNS = 3;
const GRID_GAP = 12;
const GRID_HORIZONTAL_PADDING = 12;
const ALBUM_GROUP_HORIZONTAL_MARGIN = 10;
// 調整整個「相簿格子 + 分頁圓點」群組的垂直位移（負值往上、正值往下）
const ALBUM_GROUP_OFFSET_Y = 0;
const WORD_POP_MIN_HEIGHT = 220;
const WORD_POP_HERO_HEIGHT = 110;
const WORD_POP_VERTICAL_PADDING = 14;
const WORD_POP_TEXT_LINE_LIMIT = 2;
const WORD_POP_SENTENCE_LINE_LIMIT = 4;
const TAB_BAR_HEIGHT_ESTIMATE = 65;
const TAB_BAR_BOTTOM_MARGIN_BUFFER = 8;
const QUIZ_SAFE_BUFFER = 14;

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
  slideshowItems: Array<{ cardId: string; text: string; translation?: string; sentence?: string; imageUri?: string }>;
  wordPopSlideMs: number;
  onPressSlideshowItem: (item: { cardId: string; text: string; translation?: string; sentence?: string; imageUri?: string }) => void;
  searchResults: Array<{ cardId: string; text: string; translation?: string }>;
  onPressSearchResult: (item: { cardId: string; text: string; translation?: string }) => void;
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
  onPressCacheFab,
  onOpenCreateAlbum,
  sortOrder,
  onToggleSort,
  filterPills,
  todayReviewTotalCount,
  todayReviewPendingCount,
  onPressTodayReview,
  onPressTodayReviewTuning,
  slideshowItems,
  wordPopSlideMs,
  onPressSlideshowItem,
  searchResults,
  onPressSearchResult,
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
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const isLight = false;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
  const maxSearchWidth = Math.max(200, screenWidth - 16 * 2);
  const compactLevel = React.useMemo(() => {
    if (screenHeight < 760) return 2;
    if (screenHeight < 860) return 1;
    return 0;
  }, [screenHeight]);
  const wordPopMinHeight = React.useMemo(() => {
    if (compactLevel === 2) return 160;
    if (compactLevel === 1) return 186;
    return WORD_POP_MIN_HEIGHT;
  }, [compactLevel]);
  const wordPopHeroHeight = React.useMemo(() => {
    if (compactLevel === 2) return 72;
    if (compactLevel === 1) return 88;
    return WORD_POP_HERO_HEIGHT;
  }, [compactLevel]);
  const wordPopVerticalPadding = React.useMemo(() => {
    if (compactLevel === 2) return 9;
    if (compactLevel === 1) return 11;
    return WORD_POP_VERTICAL_PADDING;
  }, [compactLevel]);
  const wordPopTextLineLimit = compactLevel === 2 ? 1 : WORD_POP_TEXT_LINE_LIMIT;
  const wordPopSentenceLineLimit = compactLevel === 2 ? 2 : compactLevel === 1 ? 3 : WORD_POP_SENTENCE_LINE_LIMIT;
  const compactGridPaddingTop = compactLevel === 2 ? 8 : compactLevel === 1 ? 9 : 10;
  const compactGridPaddingBottom = compactLevel === 2 ? 24 : compactLevel === 1 ? 28 : 32;
  const compactGridGap = compactLevel === 2 ? 10 : compactLevel === 1 ? 11 : GRID_GAP;
  const quizBottomSafeSpacing =
    Math.max(insets.bottom, TAB_BAR_BOTTOM_MARGIN_BUFFER) +
    TAB_BAR_HEIGHT_ESTIMATE +
    TAB_BAR_BOTTOM_MARGIN_BUFFER +
    QUIZ_SAFE_BUFFER;
  const newWordsLevel = React.useMemo(() => {
    if (todayReviewPendingCount <= 0) return 0;
    if (todayReviewPendingCount <= 2) return 1;
    if (todayReviewPendingCount <= 5) return 2;
    return 3;
  }, [todayReviewPendingCount]);
  const isTodayReviewActive = newWordsLevel > 0;

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
    outputRange: ['rgba(2,33,61,0)', isLight ? 'rgba(255,255,255,0.96)' : 'rgba(2,33,61,0.9)'],
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
    }, wordPopSlideMs);

    return () => clearInterval(timer);
  }, [slideshowItems, wordOpacity, wordPopSlideMs]);

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
                  style={[
                    styles.albumRow,
                    { gap: compactGridGap, marginBottom: compactGridGap },
                    rowIndex === rowCount - 1 ? styles.albumRowLast : null,
                  ]}
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
      compactGridGap,
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
    <SafeAreaView style={[styles.container, { backgroundColor: palette.screenBg }]} edges={['top']}>
      <View style={[styles.topRightRow, isSearchExpanded ? styles.topRightRowExpanded : null]}>
        {!isSearchExpanded ? (
          <TouchableOpacity
            style={styles.brandIconButton}
            activeOpacity={0.8}
            onPress={() => onPressCacheFab?.()}
          >
            <Image source={require('../../../../assets/icon_cutout2.png')} style={styles.brandIcon} resizeMode="contain" />
          </TouchableOpacity>
        ) : null}
        <View style={[styles.topActionsRow, isSearchExpanded ? styles.topActionsRowExpanded : null]}>
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
                <Ionicons name="search" size={20} color={palette.textOnContainer} style={styles.searchLeadingIcon} />
                <TextInput
                  ref={searchInputRef}
                  value={searchQuery}
                  onChangeText={onSearchChange}
                  placeholder="搜尋卡片關鍵字"
                  placeholderTextColor={palette.secondaryText}
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
                  <Ionicons name="search" size={30} color={palette.textOnBg} />
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
                  <Ionicons name="close" size={30} color={palette.textOnBg} />
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>

            {isSearchExpanded && searchQuery.trim().length > 0 ? (
              <View style={styles.searchResultsWrap}>
                <ScrollView style={styles.searchResultsList} contentContainerStyle={styles.searchResultsContent}>
                  {searchResults.length > 0 ? (
                    searchResults.map((item) => (
                      <TouchableOpacity
                        key={`${item.cardId}-${item.text}`}
                        style={styles.searchResultItem}
                        activeOpacity={0.85}
                        onPress={() => onPressSearchResult(item)}
                      >
                        <Text style={[styles.searchResultWord, { color: palette.textOnContainer }]} numberOfLines={1}>
                          {item.text}
                        </Text>
                        {item.translation ? (
                          <Text style={[styles.searchResultTranslation, { color: isLight ? '#64748B' : 'rgba(234,243,255,0.72)' }]} numberOfLines={1}>
                            {item.translation}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.searchResultEmpty}>
                      <Text style={[styles.searchResultEmptyText, { color: isLight ? '#64748B' : 'rgba(234,243,255,0.72)' }]}>
                        No matching words
                      </Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            ) : null}
          </Animated.View>

          {!isSearchExpanded ? (
            <TouchableOpacity style={styles.rawIconButton} activeOpacity={0.7} onPress={onOpenCreateAlbum}>
              <Ionicons name="add" size={38} color={palette.textOnBg} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {isSearchExpanded && searchQuery.trim().length > 0 ? (
        <TouchableOpacity
          style={styles.searchBackdropMask}
          activeOpacity={1}
          onPress={handleSearchToggle}
        />
      ) : null}

      <View style={styles.wordShowcaseWrap}>
        <TouchableOpacity
          style={[
            styles.wordShowcase,
            {
              minHeight: wordPopMinHeight,
              paddingVertical: wordPopVerticalPadding,
            },
            isLight
              ? {
                  backgroundColor: palette.containerBg,
                  borderColor: palette.borderSubtle,
                  shadowOpacity: 0.05,
                }
              : null,
          ]}
          activeOpacity={0.88}
          disabled={!activeShowcaseItem}
          onPress={() => {
            if (!activeShowcaseItem) return;
            onPressSlideshowItem(activeShowcaseItem);
          }}
        >
          <View style={styles.wordShowcaseContent}>
            {activeShowcaseItem?.imageUri ? (
              <Animated.View style={[styles.wordShowcaseHeroWrap, { opacity: wordOpacity, height: wordPopHeroHeight }]}>
                <Image source={{ uri: activeShowcaseItem.imageUri }} style={styles.wordShowcaseHeroImage} />
              </Animated.View>
            ) : (
              <Animated.View style={[styles.wordShowcaseHeroFallback, { opacity: wordOpacity, height: wordPopHeroHeight }]}>
                <Text
                  style={[styles.wordShowcaseSentence, { color: isLight ? '#334155' : 'rgba(234,243,255,0.84)' }]}
                  numberOfLines={wordPopSentenceLineLimit}
                >
                  {activeShowcaseItem?.sentence || 'No original sentence yet.'}
                </Text>
              </Animated.View>
            )}
            <View style={styles.wordShowcaseTextBlock}>
              <Animated.Text style={[styles.wordShowcaseWord, { opacity: wordOpacity, color: palette.textOnContainer }]} numberOfLines={1}>
                {activeShowcaseItem?.text || 'Start adding cards to generate words'}
              </Animated.Text>
              <Animated.Text
                style={[styles.wordShowcaseTranslation, { opacity: wordOpacity, color: isLight ? '#64748B' : 'rgba(234,243,255,0.74)' }]}
                numberOfLines={wordPopTextLineLimit}
              >
                {activeShowcaseItem?.translation || 'Tap to open card details'}
              </Animated.Text>
            </View>
          </View>
        </TouchableOpacity>
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
            contentContainerStyle={{
              paddingTop: compactGridPaddingTop,
              paddingBottom: compactGridPaddingBottom,
            }}
          />

          {albumPages.length > 1 ? (
            <View style={styles.paginationDots}>
              {albumPages.map((_, index) => (
                <View
                  key={`dot-${index}`}
                  style={[
                    styles.paginationDot,
                    { backgroundColor: isLight ? 'rgba(15,23,42,0.22)' : 'rgba(2,33,61,0.3)' },
                    index === currentPage ? [styles.paginationDotActive, { backgroundColor: palette.navActive }] : null,
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.todayReviewWrap, { marginBottom: quizBottomSafeSpacing }]}>
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
              style={[
                styles.todayReviewCard,
                styles.todayReviewCardActive,
                newWordsLevel === 1 ? styles.todayReviewCardLevel1 : null,
                newWordsLevel >= 2 ? styles.todayReviewCardLevel2 : null,
                isLight
                  ? {
                      backgroundColor: 'rgba(78,175,244,0.1)',
                      borderColor: 'rgba(78,175,244,0.46)',
                    }
                  : null,
              ]}
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
                <Text style={[styles.todayReviewLabel, { color: palette.textOnContainer }]}>New words</Text>
                {newWordsLevel >= 2 ? (
                  <View style={[styles.todayReviewBadge, newWordsLevel >= 3 ? styles.todayReviewBadgeUrgent : null]}>
                    <Text
                      style={[
                        styles.todayReviewBadgeText,
                        newWordsLevel >= 3 ? styles.todayReviewBadgeTextUrgent : null,
                      ]}
                    >
                      {todayReviewPendingCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.todayReviewInactiveRow}>
              <TouchableOpacity
                style={[
                  styles.todayReviewCard,
                  styles.todayReviewCardInactive,
                  styles.todayReviewQuickQuizButton,
                  isLight
                    ? {
                        backgroundColor: palette.containerBg,
                        borderColor: palette.borderSubtle,
                        shadowOpacity: 0.05,
                      }
                    : null,
                ]}
                activeOpacity={0.9}
                onPress={onPressTodayReview}
              >
                <View style={[styles.todayReviewHeaderRow, styles.todayReviewHeaderRowInactive]}>
                  <Text style={[styles.todayReviewLabel, styles.todayReviewLabelInactive, { color: palette.textOnContainer }]}>Quick quiz</Text>
                  <Ionicons name="play" size={16} color={palette.textOnContainer} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.todayReviewEqualizerButton,
                  isLight
                    ? {
                        backgroundColor: palette.containerBg,
                        borderColor: palette.borderSubtle,
                        shadowOpacity: 0.05,
                      }
                    : null,
                ]}
                activeOpacity={0.9}
                onPress={onPressTodayReviewTuning}
              >
                <Ionicons name="options-outline" size={22} color={palette.textOnContainer} />
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  topRightRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topRightRowExpanded: {
    justifyContent: 'flex-end',
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topActionsRowExpanded: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  brandIcon: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  brandIconButton: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchAnimatedWrap: {
    height: 44,
    overflow: 'visible',
    zIndex: 140,
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
    marginTop: 4,
    borderRadius: 16,
    shadowColor: CONTAINER_NEON_GLOW,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 7,
    transform: [{ translateY: ALBUM_GROUP_OFFSET_Y }],
  },
  albumGroup: {
    borderRadius: 16,
    backgroundColor: CONTAINER_BG,
    borderWidth: 1,
    borderColor: CONTAINER_NEON_OUTLINE,
    overflow: 'hidden',
  },
  albumGridContent: {
    paddingHorizontal: GRID_HORIZONTAL_PADDING,
    paddingTop: 0,
    paddingBottom: 0,
  },
  page: {
    width: '100%',
  },
  albumPager: {
    flexGrow: 0,
    backgroundColor: 'transparent',
  },
  albumRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
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
    backgroundColor: SCREEN_BG,
  },
  wordShowcaseWrap: {
    marginTop: 10,
    marginHorizontal: 10,
    marginBottom: 4,
  },
  todayReviewWrap: {
    marginTop: 12,
    marginHorizontal: 10,
  },
  todayReviewCard: {
    minHeight: 88,
    borderRadius: 16,
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
    backgroundColor: 'rgba(78,175,244,0.2)',
    borderColor: 'rgba(78,175,244,0.9)',
    borderWidth: 1,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  todayReviewCardLevel1: {
    backgroundColor: 'rgba(78,175,244,0.1)',
    borderWidth: 0,
  },
  todayReviewCardLevel2: {
    backgroundColor: 'rgba(78,175,244,0.2)',
    borderWidth: 1,
    borderColor: '#4EAFF4',
  },
  todayReviewCardInactive: {
    backgroundColor: CONTAINER_BG,
    borderColor: CONTAINER_NEON_OUTLINE,
    shadowColor: CONTAINER_NEON_GLOW,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  todayReviewQuickQuizButton: {
    flex: 1,
    minHeight: 74,
  },
  todayReviewEqualizerButton: {
    width: 74,
    height: 74,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CONTAINER_NEON_OUTLINE,
    backgroundColor: CONTAINER_BG,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: CONTAINER_NEON_GLOW,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
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
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  todayReviewLabelInactive: {
    color: TEXT_ON_CONTAINER,
    fontWeight: '700',
  },
  todayReviewWhoosh: {
    position: 'absolute',
    top: -28,
    bottom: -28,
    width: 120,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  todayReviewBadge: {
    minWidth: 30,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 9,
    backgroundColor: '#4EAFF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayReviewBadgeUrgent: {
    backgroundColor: '#FF6B6B',
  },
  todayReviewBadgeText: {
    color: '#02213D',
    fontSize: 13,
    fontWeight: '800',
  },
  todayReviewBadgeTextUrgent: {
    color: '#FFFFFF',
  },
  wordShowcase: {
    minHeight: WORD_POP_MIN_HEIGHT,
    borderRadius: 16,
    backgroundColor: CONTAINER_BG,
    borderWidth: 1,
    borderColor: CONTAINER_NEON_OUTLINE,
    paddingHorizontal: 16,
    paddingVertical: WORD_POP_VERTICAL_PADDING,
    justifyContent: 'flex-start',
    shadowColor: CONTAINER_NEON_GLOW,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  wordShowcaseContent: {
    gap: 10,
  },
  wordShowcaseHeroWrap: {
    width: '100%',
    height: WORD_POP_HERO_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
  },
  wordShowcaseHeroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  wordShowcaseHeroFallback: {
    width: '100%',
    height: WORD_POP_HERO_HEIGHT,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.16)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  wordShowcaseWord: {
    color: TEXT_ON_CONTAINER,
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 34,
  },
  wordShowcaseTextBlock: {
    gap: 4,
  },
  wordShowcaseTranslation: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  searchResultsWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 46,
    zIndex: 120,
    borderRadius: 20,
    backgroundColor: 'rgba(3,10,20,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(196,228,255,0.2)',
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
    maxHeight: 240,
    overflow: 'hidden',
  },
  searchBackdropMask: {
    ...StyleSheet.absoluteFillObject,
    top: 64,
    backgroundColor: 'rgba(0,0,0,0.62)',
    zIndex: 100,
  },
  searchResultsList: {
    width: '100%',
  },
  searchResultsContent: {
    paddingVertical: 4,
  },
  searchResultItem: {
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,228,255,0.09)',
    justifyContent: 'center',
  },
  searchResultWord: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  searchResultTranslation: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
  },
  searchResultEmpty: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  searchResultEmptyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  wordShowcaseSentence: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
});
