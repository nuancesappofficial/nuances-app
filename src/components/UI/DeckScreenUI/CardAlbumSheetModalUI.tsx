import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type AlbumOption = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  wordCount: number;
};

type Props = {
  visible: boolean;
  displayWord: string;
  partOfSpeech?: string;
  selectedAlbums: string[];
  allAlbums: AlbumOption[];
  onClose: () => void;
  onDone: () => void;
  onOpenCreateAlbum: () => void;
  onToggleAlbum: (albumId: string) => void;
};

export default function CardAlbumSheetModalUI({
  visible,
  displayWord,
  partOfSpeech,
  selectedAlbums,
  allAlbums,
  onClose,
  onDone,
  onOpenCreateAlbum,
  onToggleAlbum,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheetContainer}>
        <View style={styles.sheetHandle} />

        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Add to Album</Text>
          <TouchableOpacity onPress={onDone}>
            <Text style={styles.sheetDone}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sheetCardPreview}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetCardWord}>{displayWord}</Text>
            <Text style={styles.sheetCardPos}>{partOfSpeech || 'unknown'}</Text>
          </View>
          {selectedAlbums.length > 0 ? (
            <View style={styles.sheetCountBadge}>
              <Text style={styles.sheetCountText}>
                {selectedAlbums.length} album{selectedAlbums.length > 1 ? 's' : ''}
              </Text>
            </View>
          ) : null}
        </View>

        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.sheetScrollContent}>
          <TouchableOpacity style={styles.createAlbumBtn} onPress={onOpenCreateAlbum}>
            <Text style={styles.createAlbumIcon}>➕</Text>
            <Text style={styles.createAlbumText}>Create New Album</Text>
          </TouchableOpacity>

          {allAlbums.map((album) => {
            const isSelected = selectedAlbums.includes(album.id);
            return (
              <TouchableOpacity
                key={album.id}
                style={[styles.albumRow, { backgroundColor: isSelected ? album.color : '#F9F9F9' }]}
                onPress={() => onToggleAlbum(album.id)}
              >
                <View style={[styles.albumEmojiWrap, { backgroundColor: isSelected ? '#fff' : album.color }]}>
                  <Text style={styles.albumEmoji}>{album.emoji}</Text>
                </View>
                <View style={styles.albumTextWrap}>
                  <Text style={styles.albumNameText}>{album.name}</Text>
                  <Text style={styles.albumCountText}>{album.wordCount} cards</Text>
                </View>
                {isSelected ? (
                  <View style={styles.albumCheckWrap}>
                    <Text style={styles.albumCheckText}>✓</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetContainer: {
    backgroundColor: '#FAF7F3',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#C7C7CC',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#000' },
  sheetDone: { color: '#7D2A2E', fontSize: 17, fontWeight: '600' },
  sheetCardPreview: {
    backgroundColor: '#F0E7DF',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetCardWord: { fontSize: 17, fontWeight: '700', color: '#000' },
  sheetCardPos: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  sheetCountBadge: { backgroundColor: '#7D2A2E', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  sheetCountText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sheetScrollContent: { paddingBottom: 10, gap: 8 },
  createAlbumBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#7D2A2E',
  },
  createAlbumIcon: { color: '#fff', fontSize: 18 },
  createAlbumText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  albumRow: {
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  albumEmojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  albumEmoji: { fontSize: 24 },
  albumTextWrap: { flex: 1 },
  albumNameText: { fontSize: 16, color: '#000', fontWeight: '600' },
  albumCountText: { marginTop: 2, fontSize: 12, color: '#6E6E73', fontWeight: '500' },
  albumCheckWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#7D2A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumCheckText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
