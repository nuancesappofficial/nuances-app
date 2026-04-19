import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type SharedValue } from 'react-native-reanimated';
import AlbumIconItemUI from './AlbumIconItemUI';
import NativeLiquidGlassBar from './NativeLiquidGlassBar';
import type { DeckAlbum } from './deckTypes';

type Props = {
  heroStatusText: string;
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
  heroStatusText,
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
  void filterPills;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.contentWrap}>
        <View style={styles.topRow}>
          <View style={styles.cacheStatusRow}>
            <Ionicons name="folder-open-outline" size={16} color="#E8EEFB" />
            <Text style={styles.cacheStatusText}>{heroStatusText}</Text>
          </View>

          <TouchableOpacity style={styles.avatarButton} activeOpacity={0.85} onPress={onPressAvatar}>
            <Text style={styles.avatarLabel}>N</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLead}>Hey...</Text>
          <Text style={styles.heroBody}>Welcome back. Keep your daily streak going with one quick review.</Text>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color="#D1D4DB" />
            <TextInput
              value={searchQuery}
              onChangeText={onSearchChange}
              placeholder="搜尋卡片關鍵字"
              placeholderTextColor="#9EA0A7"
              style={styles.searchInput}
              returnKeyType="search"
            />
            {!!searchQuery && (
              <TouchableOpacity style={styles.clearSearchButton} activeOpacity={0.8} onPress={onClearSearch}>
                <Text style={styles.clearSearchButtonText}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.folderRowHeader}>
          <Text style={styles.folderRowTitle}>Folders</Text>

          <View style={styles.folderRowActions}>
            <TouchableOpacity style={styles.iconPill} activeOpacity={0.85} onPress={onToggleSort}>
              <Ionicons
                name={sortOrder === 'desc' ? 'arrow-down-outline' : 'arrow-up-outline'}
                size={15}
                color="#E2E8F6"
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.iconPill} activeOpacity={0.85} onPress={onOpenCreateAlbum}>
              <Ionicons name="add" size={16} color="#E2E8F6" />
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={albums}
          horizontal
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.albumCarouselContent}
          renderItem={({ item }) => (
            <AlbumIconItemUI
              item={item}
              layout="compact"
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
      </View>

      <View style={styles.cacheTabWrap}>
        <NativeLiquidGlassBar title="Open Cache" onPress={onPressCacheFab} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070A12',
  },
  contentWrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cacheStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cacheStatusText: {
    color: '#E8EEFB',
    fontSize: 16,
    fontWeight: '600',
  },
  avatarButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  avatarLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(21,27,40,0.78)',
    padding: 14,
  },
  heroLead: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 40,
  },
  heroBody: {
    marginTop: 6,
    marginBottom: 12,
    color: '#BAC5DA',
    fontSize: 13,
    lineHeight: 18,
  },
  searchBar: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 0,
    marginLeft: 8,
  },
  clearSearchButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
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
  folderRowHeader: {
    marginTop: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  folderRowTitle: {
    color: '#F4F7FF',
    fontSize: 15,
    fontWeight: '700',
  },
  folderRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconPill: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  albumCarouselContent: {
    paddingBottom: 12,
    gap: 10,
  },
  cacheTabWrap: {
    marginTop: 'auto',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
});
