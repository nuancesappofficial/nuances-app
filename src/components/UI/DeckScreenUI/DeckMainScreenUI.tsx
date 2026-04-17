import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type SharedValue } from 'react-native-reanimated';
import AlbumIconItemUI from './AlbumIconItemUI';
import type { DeckAlbum } from './deckTypes';

type Props = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onPressAvatar: () => void;
  onPressCacheFab: () => void;
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
  onPressAvatar,
  onPressCacheFab,
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
      <View style={styles.topBarWrap}>
        <View style={styles.topBarPill}>
          <View style={styles.searchSlot}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              value={searchQuery}
              onChangeText={onSearchChange}
              placeholder="搜尋卡片關鍵字"
              placeholderTextColor="#9EA0A7"
              style={styles.searchInput}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.clearSearchButton} activeOpacity={0.8} onPress={onClearSearch}>
              <Text style={styles.clearSearchButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.avatarButton} activeOpacity={0.85} onPress={onPressAvatar}>
            <Text style={styles.avatarLabel}>N</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity style={styles.createAlbumPill} activeOpacity={0.85} onPress={onOpenCreateAlbum}>
          <Text style={styles.createAlbumPillIcon}>＋</Text>
          <Text style={styles.createAlbumPillText}>新增相簿</Text>
        </TouchableOpacity>

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

      <TouchableOpacity style={styles.cacheFab} activeOpacity={0.86} onPress={onPressCacheFab}>
        <Ionicons name="albums-outline" size={24} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  topBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  topBarPill: {
    minHeight: 56,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    backgroundColor: 'rgba(18,20,25,0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 6,
  },
  searchSlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIcon: {
    color: '#D1D4DB',
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
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  clearSearchButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 14,
  },
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  avatarLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
  },
  createAlbumPill: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#151922',
    gap: 5,
  },
  createAlbumPillIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '300',
    lineHeight: 16,
  },
  createAlbumPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
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
    paddingBottom: 150,
    gap: 16,
  },
  albumRow: {
    justifyContent: 'space-between',
  },
  cacheFab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000000',
    shadowOpacity: 0.26,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 9,
  },
});
