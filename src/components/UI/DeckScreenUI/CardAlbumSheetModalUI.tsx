import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import {
  CONTAINER_BG,
  MODAL_CTA_COLOR,
  MODAL_CTA_COLOR_BORDER,
  SCREEN_BG,
  TEXT_ON_BG,
  TEXT_ON_CTA,
  TEXT_ON_CONTAINER,
} from '../../../theme/colors';

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
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
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
                style={[styles.albumRow, isSelected && styles.albumRowSelected]}
                onPress={() => onToggleAlbum(album.id)}
              >
                <View style={styles.albumEmojiWrap}>
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
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetContainer: {
    backgroundColor: SCREEN_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    maxHeight: '75%',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#4B5563',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 24, fontWeight: '800', color: TEXT_ON_BG },
  sheetDone: { color: TEXT_ON_BG, fontSize: BUTTON_TOKENS.text.strong, fontWeight: BUTTON_TOKENS.weight.regular },
  sheetCardPreview: {
    backgroundColor: CONTAINER_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetCardWord: { fontSize: 17, fontWeight: '700', color: TEXT_ON_CONTAINER },
  sheetCardPos: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  sheetCountBadge: {
    backgroundColor: MODAL_CTA_COLOR,
    borderColor: MODAL_CTA_COLOR_BORDER,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sheetCountText: { color: TEXT_ON_CTA, fontSize: 12, fontWeight: '700' },
  sheetScrollContent: { paddingBottom: 10, gap: 8 },
  createAlbumBtn: {
    borderRadius: BUTTON_TOKENS.radius.md,
    minHeight: BUTTON_TOKENS.height.regular,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
  },
  createAlbumIcon: { color: TEXT_ON_CTA, fontSize: 18 },
  createAlbumText: { color: TEXT_ON_CTA, fontSize: BUTTON_TOKENS.text.strong, fontWeight: BUTTON_TOKENS.weight.regular },
  albumRow: {
    borderRadius: BUTTON_TOKENS.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: CONTAINER_BG,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  albumRowSelected: {
    borderColor: MODAL_CTA_COLOR_BORDER,
    backgroundColor: 'rgba(78,175,244,0.16)',
  },
  albumEmojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  albumEmoji: { fontSize: 24 },
  albumTextWrap: { flex: 1 },
  albumNameText: { fontSize: 16, color: TEXT_ON_CONTAINER, fontWeight: '600' },
  albumCountText: { marginTop: 2, fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  albumCheckWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumCheckText: { color: TEXT_ON_CTA, fontSize: 16, fontWeight: '800' },
});
