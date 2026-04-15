import React from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type SharedValue } from 'react-native-reanimated';
import AlbumIconItemUI from './AlbumIconItemUI';
import type { DeckAlbum } from './deckTypes';

type Props = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
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

      <FlatList
        data={albums}
        numColumns={2}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.albumGridContent}
        columnWrapperStyle={styles.albumRow}
        renderItem={({ item }) => (
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
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
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
  albumGridContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 120,
    gap: 16,
  },
  albumRow: {
    justifyContent: 'space-between',
  },
});
