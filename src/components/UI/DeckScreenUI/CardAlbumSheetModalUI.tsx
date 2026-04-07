import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type LocalAlbum = {
  id: string;
  name: string;
  emoji: string;
  color: string;
};

type Props = {
  visible: boolean;
  displayWord: string;
  partOfSpeech?: string;
  selectedAlbums: string[];
  allAlbums: LocalAlbum[];
  showNewAlbumForm: boolean;
  newAlbumName: string;
  selectedEmoji: string;
  selectedColor: string;
  availableEmojis: string[];
  availableColors: string[];
  onClose: () => void;
  onDone: () => void;
  onToggleCreateForm: () => void;
  onChangeNewAlbumName: (value: string) => void;
  onSelectEmoji: (value: string) => void;
  onSelectColor: (value: string) => void;
  onCancelCreateForm: () => void;
  onCreateAlbum: () => void;
  onToggleAlbum: (albumId: string) => void;
};

export default function CardAlbumSheetModalUI({
  visible,
  displayWord,
  partOfSpeech,
  selectedAlbums,
  allAlbums,
  showNewAlbumForm,
  newAlbumName,
  selectedEmoji,
  selectedColor,
  availableEmojis,
  availableColors,
  onClose,
  onDone,
  onToggleCreateForm,
  onChangeNewAlbumName,
  onSelectEmoji,
  onSelectColor,
  onCancelCreateForm,
  onCreateAlbum,
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
          <TouchableOpacity style={styles.createAlbumBtn} onPress={onToggleCreateForm}>
            <Text style={styles.createAlbumIcon}>➕</Text>
            <Text style={styles.createAlbumText}>Create New Album</Text>
          </TouchableOpacity>

          {showNewAlbumForm ? (
            <View style={styles.newAlbumForm}>
              <Text style={styles.formLabel}>Album Name</Text>
              <TextInput
                value={newAlbumName}
                onChangeText={onChangeNewAlbumName}
                placeholder="e.g., Business English"
                style={styles.formInput}
              />

              <Text style={styles.formLabel}>Choose Emoji</Text>
              <View style={styles.emojiWrap}>
                {availableEmojis.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.emojiBtn, selectedEmoji === emoji && styles.emojiBtnActive]}
                    onPress={() => onSelectEmoji(emoji)}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Choose Color</Text>
              <View style={styles.colorWrap}>
                {availableColors.map((color) => {
                  const active = selectedColor === color;
                  return (
                    <TouchableOpacity
                      key={color}
                      style={[styles.colorBtn, { backgroundColor: color }, active && styles.colorBtnActive]}
                      onPress={() => onSelectColor(color)}
                    >
                      {active ? <Text style={styles.colorCheck}>✓</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity style={styles.formCancelBtn} onPress={onCancelCreateForm}>
                  <Text style={styles.formCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.formCreateBtn, !newAlbumName.trim() && styles.formCreateBtnDisabled]}
                  disabled={!newAlbumName.trim()}
                  onPress={onCreateAlbum}
                >
                  <Text style={styles.formCreateText}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

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
                <Text style={styles.albumNameText}>{album.name}</Text>
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
  newAlbumForm: {
    backgroundColor: '#F4ECE5',
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
  },
  formLabel: { fontSize: 13, fontWeight: '700', color: '#8E8E93', marginBottom: 8, marginTop: 8 },
  formInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  emojiWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  emojiBtnActive: { borderColor: '#007AFF', backgroundColor: '#E8F1FF' },
  emojiText: { fontSize: 22 },
  colorWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorBtnActive: { borderWidth: 2, borderColor: '#007AFF' },
  colorCheck: { color: '#007AFF', fontSize: 16, fontWeight: '800' },
  formActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  formCancelBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  formCancelText: { fontSize: 16, color: '#8E8E93', fontWeight: '700' },
  formCreateBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#7D2A2E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  formCreateBtnDisabled: { opacity: 0.4 },
  formCreateText: { fontSize: 16, color: '#fff', fontWeight: '700' },
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
  albumNameText: { flex: 1, fontSize: 16, color: '#000', fontWeight: '600' },
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
