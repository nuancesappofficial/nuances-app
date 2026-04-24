import React from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type SharedValue } from 'react-native-reanimated';
import AlbumIconItemUI from './AlbumIconItemUI';
import type { DeckAlbum } from './deckTypes';

const ALBUMS_PER_PAGE = 9;
const GRID_COLUMNS = 3;
const GRID_GAP = 6;
const GRID_HORIZONTAL_PADDING = 12;
const ALBUM_GROUP_HORIZONTAL_MARGIN = 10;
// 調整整個「相簿格子 + 分頁圓點」群組的垂直位移（負值往上、正值往下）
const ALBUM_GROUP_OFFSET_Y = -180;

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="搜尋卡片關鍵字"
            placeholderTextColor="#8E8E93"
            style={styles.searchInput}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.clearSearchButton} activeOpacity={0.8} onPress={onClearSearch}>
            <Text style={styles.clearSearchButtonText}>×</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.addAlbumButton} activeOpacity={0.85} onPress={onOpenCreateAlbum}>
          <Text style={styles.addAlbumText}>＋</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity style={styles.sortPill} activeOpacity={0.85} onPress={onToggleSort}>
          <Text style={styles.sortPillText}>↕︎</Text>
          <Text style={styles.sortPillChevron}>{sortOrder === 'desc' ? '新→舊' : '舊→新'}</Text>
        </TouchableOpacity>

        {filterPills.map((pill) => (
          <TouchableOpacity key={pill} style={styles.filterPill} activeOpacity={0.85}>
            <Text style={styles.filterPillText}>{pill}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ADD8E6',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInputWrap: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: '#0B0B0F',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 0,
  },
  clearSearchButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  clearSearchButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 14,
  },
  addAlbumButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0B0F',
  },
  addAlbumText: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '300',
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 8,
  },
  sortPill: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#111317',
    gap: 6,
  },
  sortPillText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  sortPillChevron: {
    color: '#C7C7CC',
    fontSize: 12,
  },
  filterPill: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  filterPillText: {
    color: '#F2F2F7',
    fontSize: 14,
    fontWeight: '600',
  },
  albumGroup: {
    alignSelf: 'center',
    marginHorizontal: ALBUM_GROUP_HORIZONTAL_MARGIN,
    borderRadius: 24,
    backgroundColor: '#7BA8C7',
    overflow: 'hidden',
    transform: [{ translateY: ALBUM_GROUP_OFFSET_Y }],
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
