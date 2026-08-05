import React from 'react';
import { Animated, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { type SharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import AlbumIconItemUI from './AlbumIconItemUI';
import LightPressable from '../shared/LightPressable';
import TutorialSpotlight from '../shared/TutorialSpotlight';
import MovingTutorialArrow from '../shared/MovingTutorialArrow';
import type { AppTourStep } from '../../../contexts/AppTourContext';
import type { DeckAlbum } from './deckTypes';
import type { UILanguage } from '../../../services/settings/userSettings';
import { tUI } from '../../../i18n/uiLanguage';
import {
  CONTAINER_BG,
  CONTAINER_NEON_GLOW,
  CONTAINER_NEON_OUTLINE,
  SCREEN_BG,
  TEXT_ON_BG,
  TEXT_ON_CONTAINER,
  resolveThemeColors,
} from '../../../theme/colors';

const DEFAULT_GRID_COLUMNS = 3;
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
const WORD_POP_DWELL_EXTENSION_MS = 800;
const TAB_BAR_HEIGHT_ESTIMATE = 65;
const TAB_BAR_BOTTOM_MARGIN_BUFFER = 8;
const QUIZ_SAFE_BUFFER = 14;

type Props = {
  heroStatusText?: string;
  uiLanguage: UILanguage;
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
  todayNewWordsOnly: boolean;
  onPressTodayReview: () => void;
  onPressTodayReviewTuning: () => void;
  tourStep?: AppTourStep;
  onTourTargetPress?: () => void;
  showQuickQuizTutorialArrow?: boolean;
  tutorialLongPressAlbumId?: string | null;
  slideshowItems: Array<{ cardId: string; text: string; translation?: string; sentence?: string; imageUri?: string }>;
  wordPopSlideMs: number;
  wordPopEnabled: boolean;
  albumGridCount: number;
  onPressSlideshowItem: (item: { cardId: string; text: string; translation?: string; sentence?: string; imageUri?: string }) => void;
  searchResults: Array<{ cardId: string; text: string; translation?: string }>;
  onPressSearchResult: (item: { cardId: string; text: string; translation?: string }) => void;
  albums: Array<DeckAlbum | null>;
  onPressAlbum: (album: DeckAlbum) => void;
  isMenuVisible: SharedValue<boolean>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  hoveredAction: SharedValue<'none' | 'edit' | 'delete'>;
  activeAlbumId: string | null;
  onMenuStart: (album: DeckAlbum, layout: { x: number; y: number; width: number; height: number }) => void;
  onMenuFinish: () => void;
  onActionEnd: (album: DeckAlbum, action: 'none' | 'edit' | 'delete') => void;
};

export default function DeckMainScreenUI({
  uiLanguage,
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
  todayNewWordsOnly,
  onPressTodayReview,
  onPressTodayReviewTuning,
  tourStep = 'IDLE',
  onTourTargetPress,
  showQuickQuizTutorialArrow = false,
  tutorialLongPressAlbumId = null,
  slideshowItems,
  wordPopSlideMs,
  wordPopEnabled,
  albumGridCount,
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
  const isLight = colorScheme === 'light';
  const searchSecondaryTextColor = palette.secondaryText;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const searchInputRef = React.useRef<TextInput | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = React.useState(false);
  const searchExpandProgress = React.useRef(new Animated.Value(0)).current;
  const todayReviewPulse = React.useRef(new Animated.Value(0)).current;
  const todayReviewWhoosh = React.useRef(new Animated.Value(0)).current;
  const [wordIndex, setWordIndex] = React.useState(0);
  const wordCarouselRef = React.useRef<FlatList<Props['slideshowItems'][number]> | null>(null);
  const albumPagerRef = React.useRef<FlatList<Array<DeckAlbum | null>> | null>(null);
  const didRevealTutorialAlbumRef = React.useRef<string | null>(null);
  const tutorialAlbumCellRef = React.useRef<View | null>(null);
  const [createAlbumBtnLayout, setCreateAlbumBtnLayout] = React.useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [tutorialAlbumLayout, setTutorialAlbumLayout] = React.useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const wordSlideDirectionRef = React.useRef<1 | -1>(1);
  const albumsPerPage =
    albumGridCount === 3 || albumGridCount === 6
      ? albumGridCount
      : 6;
  const albumGridColumns = DEFAULT_GRID_COLUMNS;
  const albumRowCount = Math.max(1, Math.ceil(albumsPerPage / albumGridColumns));
  const albumPageWidth = Math.max(0, screenWidth - ALBUM_GROUP_HORIZONTAL_MARGIN * 2);
  const albumItemWidth = Math.max(
    0,
    (albumPageWidth - GRID_HORIZONTAL_PADDING * 2 - GRID_GAP * (albumGridColumns - 1)) / albumGridColumns
  );
  const albumCellWidth = albumItemWidth;
  const [currentPage, setCurrentPage] = React.useState(0);
  const maxSearchWidth = Math.max(200, screenWidth - 16 * 2);
  const [wordSlideWidth, setWordSlideWidth] = React.useState(Math.max(1, screenWidth - 54));
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
  const compactGridPaddingBottom = compactLevel === 2
      ? 24
      : compactLevel === 1
        ? 28
        : 32;
  const compactGridGap = compactLevel === 2 ? 10 : compactLevel === 1 ? 11 : GRID_GAP;
  const quizBottomSafeSpacing =
    Math.max(insets.bottom, TAB_BAR_BOTTOM_MARGIN_BUFFER) +
    TAB_BAR_HEIGHT_ESTIMATE +
    TAB_BAR_BOTTOM_MARGIN_BUFFER +
    QUIZ_SAFE_BUFFER;
  const newWordsLevel = React.useMemo(() => {
    if (todayReviewTotalCount <= 0) return 0;
    if (todayReviewTotalCount <= 2) return 1;
    if (todayReviewTotalCount <= 5) return 2;
    return 3;
  }, [todayReviewTotalCount]);
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
    outputRange: ['rgba(2,33,61,0)', isLight ? 'rgba(255,255,255,0.96)' : 'rgba(2,33,61,0.9)'],
  });
  const searchShellBorderWidth = searchExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const albumPages = React.useMemo(() => {
    if (albums.length <= albumsPerPage) return [albums];
    const pages: Array<Array<DeckAlbum | null>> = [];
    for (let i = 0; i < albums.length; i += albumsPerPage) {
      pages.push(albums.slice(i, i + albumsPerPage));
    }
    return pages;
  }, [albums, albumsPerPage]);

  React.useEffect(() => {
    const lastPage = Math.max(0, albumPages.length - 1);
    if (currentPage > lastPage) {
      setCurrentPage(lastPage);
    }
  }, [albumPages.length, currentPage]);

  React.useEffect(() => {
    if (!tutorialLongPressAlbumId || tourStep !== 'STEP_13_LONG_PRESS_ALBUM') {
      didRevealTutorialAlbumRef.current = null;
      return;
    }
    if (didRevealTutorialAlbumRef.current === tutorialLongPressAlbumId) return;

    const pageIndex = albumPages.findIndex((page) =>
      page.some((album) => album?.id === tutorialLongPressAlbumId)
    );
    if (pageIndex < 0) return;

    didRevealTutorialAlbumRef.current = tutorialLongPressAlbumId;
    requestAnimationFrame(() => {
      albumPagerRef.current?.scrollToIndex({ index: pageIndex, animated: true });
    });
  }, [albumPages, tourStep, tutorialLongPressAlbumId]);

  React.useEffect(() => {
    const itemCount = slideshowItems.length;
    if (itemCount <= 1) return;
    const timer = setTimeout(() => {
      const safeCurrent = wordIndex >= itemCount ? 0 : wordIndex;
      let direction = wordSlideDirectionRef.current;
      let nextIndex = safeCurrent + direction;

      if (nextIndex >= itemCount) {
        direction = -1;
        nextIndex = Math.max(0, safeCurrent - 1);
      } else if (nextIndex < 0) {
        direction = 1;
        nextIndex = Math.min(itemCount - 1, safeCurrent + 1);
      }

      wordSlideDirectionRef.current = direction;
      wordCarouselRef.current?.scrollToOffset({
        offset: nextIndex * wordSlideWidth,
        animated: true,
      });
      setWordIndex(nextIndex);
    }, wordPopSlideMs + WORD_POP_DWELL_EXTENSION_MS);

    return () => clearTimeout(timer);
  }, [slideshowItems.length, wordIndex, wordPopSlideMs, wordSlideWidth]);

  React.useEffect(() => {
    requestAnimationFrame(() => {
      wordCarouselRef.current?.scrollToOffset({
        offset: Math.min(wordIndex, Math.max(0, slideshowItems.length - 1)) * wordSlideWidth,
        animated: false,
      });
    });
  }, [slideshowItems.length, wordSlideWidth]);

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
    (pageAlbums: Array<DeckAlbum | null>, pageIndex: number) => {
      return (
        <View style={[styles.page, { width: albumPageWidth }]}>
          <View style={styles.albumGridContent}>
            {Array.from({ length: albumRowCount }).map((_, rowIndex) => {
              const rowAlbums = pageAlbums.slice(
                rowIndex * albumGridColumns,
                (rowIndex + 1) * albumGridColumns
              );
              return (
                <View
                  key={`page-${pageIndex}-row-${rowIndex}`}
                  style={[
                    styles.albumRow,
                    {
                      gap: compactGridGap,
                      justifyContent: 'flex-start',
                      marginBottom: compactGridGap,
                    },
                    rowIndex === albumRowCount - 1 ? styles.albumRowLast : null,
                  ]}
                >
                  {Array.from({ length: albumGridColumns }).map((__, colIndex) => {
                    const item = rowAlbums[colIndex];
                    return (
                      <View
                        key={`cell-${pageIndex}-${rowIndex}-${colIndex}`}
                        style={{ width: albumCellWidth }}
                        ref={
                          item && item.id === tutorialLongPressAlbumId
                            ? tutorialAlbumCellRef
                            : undefined
                        }
                        onLayout={
                          item && item.id === tutorialLongPressAlbumId && tourStep === 'STEP_13_LONG_PRESS_ALBUM'
                            ? () => {
                                requestAnimationFrame(() => {
                                  tutorialAlbumCellRef.current?.measureInWindow(
                                    (x, y, width, height) => {
                                      setTutorialAlbumLayout((prev) =>
                                        prev &&
                                        prev.x === x &&
                                        prev.y === y &&
                                        prev.width === width &&
                                        prev.height === height
                                          ? prev
                                          : { x, y, width, height }
                                      );
                                    }
                                  );
                                });
                              }
                            : undefined
                        }
                      >
                        {item ? (
                          <AlbumIconItemUI
                            item={item}
                            uiLanguage={uiLanguage}
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
      albumRowCount,
      albumGridColumns,
      albumsPerPage,
      albumCellWidth,
      onPressAlbum,
      isMenuVisible,
      startX,
      startY,
      hoveredAction,
      activeAlbumId,
      onMenuStart,
      onMenuFinish,
      onActionEnd,
      tutorialLongPressAlbumId,
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
  const renderWordShowcaseSlide = (
    item: Props['slideshowItems'][number] | undefined,
    key: string
  ) => (
    <View key={key} style={[styles.wordShowcaseContent, { width: wordSlideWidth }]}>
      {item?.imageUri ? (
        <View style={[styles.wordShowcaseHeroWrap, { height: wordPopHeroHeight }]}>
          <Image source={{ uri: item.imageUri }} style={styles.wordShowcaseHeroImage} />
        </View>
      ) : (
        <View style={[styles.wordShowcaseHeroFallback, { height: wordPopHeroHeight }]}>
          <Text
            style={[styles.wordShowcaseSentence, { color: isLight ? '#334155' : 'rgba(234,243,255,0.84)' }]}
            numberOfLines={wordPopSentenceLineLimit}
          >
            {item?.sentence || tUI(uiLanguage, 'deck.noOriginalSentence')}
          </Text>
        </View>
      )}
      <View style={styles.wordShowcaseTextBlock}>
        <Text
          style={[styles.wordShowcaseWord, { color: palette.textOnContainer }]}
          numberOfLines={1}
        >
          {item?.text || tUI(uiLanguage, 'deck.emptyWordPopTitle')}
        </Text>
        <Text
          style={[
            styles.wordShowcaseTranslation,
            { color: isLight ? '#64748B' : 'rgba(234,243,255,0.74)' },
          ]}
          numberOfLines={wordPopTextLineLimit}
        >
          {item?.translation || tUI(uiLanguage, 'deck.emptyWordPopSubtitle')}
        </Text>
      </View>
    </View>
  );
  const activeReviewShadowOpacity = todayReviewPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0.55],
  });
  const activeReviewShadowRadius = todayReviewPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 22],
  });
  const activeReviewWhooshTranslateX = todayReviewWhoosh.interpolate({
    inputRange: [0, 1],
    outputRange: [-260, 260],
  });
  const activeReviewWhooshOpacity = todayReviewWhoosh.interpolate({
    inputRange: [0, 0.12, 0.85, 1],
    outputRange: [0, 0.2, 0.2, 0],
  });
  const activeReviewCardTone = React.useMemo(() => {
    if (isLight) {
      if (newWordsLevel === 1) {
        return {
          overlayColor: 'rgba(78,175,244,0.16)',
          borderColor: 'rgba(78,175,244,0.52)',
          shadowColor: '#4EAFF4',
        };
      }
      return {
        overlayColor: newWordsLevel >= 3 ? 'rgba(78,175,244,0.2)' : 'rgba(78,175,244,0.18)',
        borderColor: newWordsLevel >= 3 ? 'rgba(78,175,244,0.74)' : 'rgba(78,175,244,0.62)',
        shadowColor: '#4EAFF4',
      };
    }

    if (newWordsLevel === 1) {
      return {
        overlayColor: 'rgba(78,175,244,0.1)',
        borderColor: 'rgba(137,206,255,0.42)',
        shadowColor: '#4EAFF4',
      };
    }
    return {
      overlayColor: newWordsLevel >= 3 ? 'rgba(78,175,244,0.14)' : 'rgba(78,175,244,0.12)',
      borderColor: newWordsLevel >= 3 ? 'rgba(176,222,255,0.72)' : 'rgba(137,206,255,0.56)',
      shadowColor: '#4EAFF4',
    };
  }, [isLight, newWordsLevel]);
  const activeReviewCardVisualStyle = React.useMemo(
    () => ({
      borderColor: activeReviewCardTone.borderColor,
      shadowColor: activeReviewCardTone.shadowColor,
    }),
    [activeReviewCardTone.borderColor, activeReviewCardTone.shadowColor]
  );
  const inactiveReviewCardTone = React.useMemo(
    () =>
      isLight
        ? {
            backgroundColor: palette.containerBg,
            borderColor: palette.borderSubtle,
            borderWidth: 1,
            shadowOpacity: 0.06,
          }
        : {
            backgroundColor: palette.containerBg,
            borderColor: 'rgba(176,222,255,0.32)',
            shadowOpacity: 0.24,
          },
    [isLight, palette.containerBg]
  );
  const handleTourTargetPress = React.useCallback(() => {
    onTourTargetPress?.();
  }, [onTourTargetPress]);
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.screenBg }]} edges={['top']}>
      <View style={[styles.topRightRow, isSearchExpanded ? styles.topRightRowExpanded : null]}>
          {!isSearchExpanded ? (
            <Pressable
              style={({ pressed }) => [styles.brandIconButton, pressed ? styles.deckIconButtonPressed : null]}
              onPress={() => onPressCacheFab?.()}
            >
              <Image source={require('../../../../assets/app_icons/icon_cutout2.png')} style={styles.brandIcon} resizeMode="contain" />
            </Pressable>
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
                    placeholder={tUI(uiLanguage, 'deck.searchPlaceholder')}
                    placeholderTextColor={palette.secondaryText}
                    style={[styles.searchInput, { color: palette.textOnContainer }]}
                    returnKeyType="search"
                  />
                </Animated.View>

                <Pressable
                  style={({ pressed }) => [styles.searchToggleButton, pressed ? styles.deckIconButtonPressed : null]}
                  onPress={handleSearchToggle}
                >
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
                </Pressable>
              </Animated.View>

              {isSearchExpanded && searchQuery.trim().length > 0 ? (
                <View
                  style={[
                    styles.searchResultsWrap,
                    {
                      backgroundColor: palette.searchDropdownBg,
                      borderColor: palette.searchDropdownBorder,
                      shadowOpacity: isLight ? 0.16 : 0.42,
                    },
                  ]}
                >
                  <ScrollView style={styles.searchResultsList} contentContainerStyle={styles.searchResultsContent}>
                    {searchResults.length > 0 ? (
                      searchResults.map((item) => (
                        <Pressable
                          key={`${item.cardId}-${item.text}`}
                          style={({ pressed }) => [
                            styles.searchResultItem,
                            { borderBottomColor: palette.searchDropdownDivider },
                            pressed ? styles.deckMediumButtonPressed : null,
                          ]}
                          onPress={() => onPressSearchResult(item)}
                        >
                          <Text style={[styles.searchResultWord, { color: palette.textOnContainer }]} numberOfLines={1}>
                            {item.text}
                          </Text>
                          {item.translation ? (
                            <Text style={[styles.searchResultTranslation, { color: searchSecondaryTextColor }]} numberOfLines={1}>
                              {item.translation}
                            </Text>
                          ) : null}
                        </Pressable>
                      ))
                    ) : (
                      <View style={styles.searchResultEmpty}>
                        <Text style={[styles.searchResultEmptyText, { color: searchSecondaryTextColor }]}>
                          {tUI(uiLanguage, 'deck.searchNoMatches')}
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              ) : null}
            </Animated.View>

            {!isSearchExpanded ? (
              <TutorialSpotlight
                active={tourStep === 'STEP_11_CREATE_ALBUM'}
                onSpotlightPress={handleTourTargetPress}
                style={styles.createAlbumSpotlight}
              >
                <Pressable
                  style={({ pressed }) => [styles.rawIconButton, pressed ? styles.deckIconButtonPressed : null]}
                  onPress={onOpenCreateAlbum}
                  onLayout={(event) => {
                    const { x, y, width, height } = event.nativeEvent.layout;
                    setCreateAlbumBtnLayout((prev) =>
                      prev &&
                      prev.x === x &&
                      prev.y === y &&
                      prev.width === width &&
                      prev.height === height
                        ? prev
                        : { x, y, width, height }
                    );
                  }}
                >
                  <Ionicons name="add" size={38} color={palette.textOnBg} />
                </Pressable>
                {tourStep === 'STEP_11_CREATE_ALBUM' && createAlbumBtnLayout ? (
                  <MovingTutorialArrow
                    direction="up"
                    style={[
                      styles.createAlbumFloatingArrow,
                      {
                        top: createAlbumBtnLayout.y + createAlbumBtnLayout.height + 6,
                        left: createAlbumBtnLayout.x + createAlbumBtnLayout.width / 2,
                      },
                    ]}
                  />
                ) : null}
              </TutorialSpotlight>
            ) : null}
          </View>
      </View>

      {tourStep === 'STEP_13_LONG_PRESS_ALBUM' && tutorialAlbumLayout ? (
        <View
          pointerEvents="none"
          style={[
            styles.longPressTutorialWrap,
            {
              top: tutorialAlbumLayout.y - insets.top - 52,
              left: tutorialAlbumLayout.x + tutorialAlbumLayout.width / 2,
            },
          ]}
        >
          <Text style={styles.longPressTutorialLabel}>
            {uiLanguage === 'zh-TW' || uiLanguage === 'zh-CN' ? '長按' : 'Hold to edit'}
          </Text>
          <MovingTutorialArrow
            direction="down"
            color="#2D9E66"
            size={30}
            style={styles.longPressTutorialArrow}
          />
        </View>
      ) : null}

      {isSearchExpanded && searchQuery.trim().length > 0 ? (
        <Pressable
          style={[styles.searchBackdropMask, { backgroundColor: palette.searchBackdropMask }]}
          onPress={handleSearchToggle}
        />
      ) : null}

      {wordPopEnabled ? (
        <View style={styles.wordShowcaseWrap}>
          <LightPressable
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
            pressedScale={0.988}
            pressedOpacity={0.96}
            disabled={!activeShowcaseItem}
            onPress={() => {
              if (!activeShowcaseItem) return;
              onPressSlideshowItem(activeShowcaseItem);
            }}
          >
            <FlatList
              ref={wordCarouselRef}
              data={slideshowItems}
              horizontal
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.wordShowcaseTrack}
              style={styles.wordShowcaseViewport}
              keyExtractor={(item, index) => `${item.cardId}-${index}`}
              renderItem={({ item, index }) =>
                renderWordShowcaseSlide(item, `${item.cardId}-${index}`)
              }
              ListEmptyComponent={renderWordShowcaseSlide(undefined, 'empty')}
              getItemLayout={(_, index) => ({
                length: wordSlideWidth,
                offset: wordSlideWidth * index,
                index,
              })}
              initialNumToRender={3}
              windowSize={5}
              onLayout={(event) => {
                const nextWidth = event.nativeEvent.layout.width;
                if (nextWidth > 0 && Math.abs(nextWidth - wordSlideWidth) > 0.5) {
                  setWordSlideWidth(nextWidth);
                }
              }}
            />
          </LightPressable>
        </View>
      ) : null}

      <View style={styles.albumGroupShadow}>
          <View
            style={[
              styles.albumGroup,
              isLight
                ? {
                    backgroundColor: palette.containerBg,
                    borderColor: palette.borderSubtle,
                  }
                : null,
            ]}
          >
            <FlatList
              ref={albumPagerRef}
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
        <View style={styles.todayReviewInactiveRow}>
          <Animated.View
            style={[
              styles.todayReviewQuickQuizShell,
              isTodayReviewActive
                ? {
                    shadowOpacity: activeReviewShadowOpacity,
                    shadowRadius: activeReviewShadowRadius,
                  }
                : null,
            ]}
          >
            {showQuickQuizTutorialArrow ? (
              <MovingTutorialArrow
                direction="up"
                color="#2D9E66"
                size={30}
                style={styles.quickQuizTutorialArrow}
              />
            ) : null}
            {isTodayReviewActive ? (
            <TutorialSpotlight
              active={tourStep === 'STEP_10_QUIZ_SAMPLE'}
              style={styles.todayReviewButtonFill}
              onSpotlightPress={handleTourTargetPress}
            >
              <LightPressable
                style={styles.todayReviewButtonFill}
                contentStyle={[
                  styles.todayReviewCard,
                  styles.todayReviewCardActive,
                  newWordsLevel === 1 ? styles.todayReviewCardLevel1 : null,
                  newWordsLevel >= 2 ? styles.todayReviewCardLevel2 : null,
                  { backgroundColor: palette.containerBg },
                  activeReviewCardVisualStyle,
                ]}
                pressedScale={0.988}
                pressedOpacity={0.96}
                onPress={onPressTodayReview}
              >
                <View
                  pointerEvents="none"
                  style={[
                    styles.todayReviewTintLayer,
                    {
                      backgroundColor: activeReviewCardTone.overlayColor,
                    },
                  ]}
                />
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
                  <Text style={[styles.todayReviewLabel, { color: palette.textOnContainer }]}>
                    {tUI(uiLanguage, 'deck.newWords')}
                  </Text>
                  {newWordsLevel >= 2 ? (
                    <View style={[styles.todayReviewBadge, newWordsLevel >= 3 ? styles.todayReviewBadgeUrgent : null]}>
                      <Text
                        style={[
                          styles.todayReviewBadgeText,
                          newWordsLevel >= 3 ? styles.todayReviewBadgeTextUrgent : null,
                        ]}
                      >
                        {todayReviewTotalCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </LightPressable>
            </TutorialSpotlight>
          ) : (
              <TutorialSpotlight
                active={tourStep === 'STEP_10_QUIZ_SAMPLE'}
                style={styles.todayReviewButtonFill}
                onSpotlightPress={handleTourTargetPress}
              >
                <LightPressable
                  style={styles.todayReviewButtonFill}
                  contentStyle={[
                    styles.todayReviewCard,
                    styles.todayReviewCardInactive,
                    styles.todayReviewQuickQuizButton,
                    inactiveReviewCardTone,
                  ]}
                  pressedScale={0.988}
                  pressedOpacity={0.96}
                  onPress={onPressTodayReview}
                >
                  <View style={[styles.todayReviewHeaderRow, styles.todayReviewHeaderRowInactive]}>
                    <Text
                      style={[styles.todayReviewLabel, styles.todayReviewLabelInactive, { color: palette.textOnContainer }]}
                    >
                      {tUI(uiLanguage, 'deck.quickQuiz')}
                    </Text>
                    <Ionicons name="play" size={16} color={palette.textOnContainer} />
                  </View>
                </LightPressable>
              </TutorialSpotlight>
          )}
          </Animated.View>

          <LightPressable
            style={styles.todayReviewEqualizerShell}
            contentStyle={[
              styles.todayReviewEqualizerButton,
              inactiveReviewCardTone,
            ]}
            pressedScale={0.988}
            pressedOpacity={0.96}
            onPress={onPressTodayReviewTuning}
          >
            <Ionicons name="options-outline" size={22} color={palette.textOnContainer} />
          </LightPressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  quickQuizTutorialArrow: {
    position: 'absolute',
    bottom: -40,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  createAlbumSpotlight: {
    position: 'relative',
  },
  createAlbumFloatingArrow: {
    position: 'absolute',
    zIndex: 999,
    pointerEvents: 'none',
    marginLeft: -32,
  },
  longPressTutorialWrap: {
    position: 'absolute',
    zIndex: 999,
    pointerEvents: 'none',
    alignItems: 'center',
    marginLeft: -15,
  },
  longPressTutorialLabel: {
    color: '#2D9E66',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  longPressTutorialArrow: {
    marginLeft: 0,
  },
  topRightRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 30,
  },
  topRightRowExpanded: {
    justifyContent: 'flex-end',
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    position: 'relative',
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
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  todayReviewCardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  todayReviewInactiveRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  todayReviewButtonShell: {
    width: '100%',
  },
  todayReviewButtonFill: {
    width: '100%',
  },
  todayReviewQuickQuizShell: {
    flex: 1,
    overflow: 'visible',
  },
  todayReviewEqualizerShell: {
    width: 74,
    height: 74,
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
    marginBottom: 0,
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
  todayReviewTintLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
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
    flexShrink: 0,
  },
  wordShowcaseViewport: {
    overflow: 'hidden',
  },
  wordShowcaseTrack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    borderWidth: 1,
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
  deckMediumButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  deckIconButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
});
