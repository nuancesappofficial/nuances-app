import React from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
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
  const albumPageWidth = Math.max(0, screenWidth - ALBUM_GROUP_HORIZONTAL_MARGIN * 2);
  const albumItemWidth = Math.max(
    0,
    (albumPageWidth - GRID_HORIZONTAL_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS
  );
  const [currentPage, setCurrentPage] = React.useState(0);

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

  const handleOpenSearch = React.useCallback(() => {
    setIsSearchExpanded(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const handleSearchSecondaryAction = React.useCallback(() => {
    if (searchQuery.trim().length > 0) {
      onClearSearch();
      return;
    }
    setIsSearchExpanded(false);
  }, [onClearSearch, searchQuery]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topRightRow}>
        {isSearchExpanded ? (
          <View style={styles.searchInputWrap}>
            <Ionicons name="search" size={22} color="#FFFFFF" style={styles.searchLeadingIcon} />
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={onSearchChange}
              placeholder="搜尋卡片關鍵字"
              placeholderTextColor="#8E8E93"
              style={styles.searchInput}
              returnKeyType="search"
              onBlur={() => {
                if (!searchQuery.trim()) setIsSearchExpanded(false);
              }}
            />
            <TouchableOpacity style={styles.clearSearchButton} activeOpacity={0.8} onPress={handleSearchSecondaryAction}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.rawIconButton} activeOpacity={0.7} onPress={handleOpenSearch}>
            <Ionicons name="search" size={32} color="#0E1117" />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.rawIconButton} activeOpacity={0.7} onPress={onOpenCreateAlbum}>
          <Ionicons name="add" size={38} color="#0E1117" />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ADD8E6',
  },
  topRightRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  rawIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  searchInputWrap: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: '#0B0B0F',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  searchLeadingIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 0,
  },
  clearSearchButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
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
    backgroundColor: '#7BA8C7',
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
    backgroundColor: '#7BA8C7',
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
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  paginationDotActive: {
    backgroundColor: '#FFFFFF',
  },
});
