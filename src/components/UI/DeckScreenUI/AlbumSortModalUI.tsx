import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';

type SortMode = 'recently_added' | 'recently_reviewed' | 'alphabetical';

type Props = {
  visible: boolean;
  sortMode: SortMode;
  sortLabel: string;
  onClose: () => void;
  onChangeSortMode: (mode: SortMode) => void;
};

export default function AlbumSortModalUI({
  visible,
  sortMode,
  sortLabel,
  onClose,
  onChangeSortMode,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sortModalOverlay} onPress={onClose}>
        <Pressable style={styles.sortModalCard} onPress={() => undefined}>
          <Text style={styles.sortModalTitle}>Sort by...</Text>

          <TouchableOpacity
            style={[styles.sortOptionBtn, sortMode === 'recently_added' && styles.sortOptionBtnActive]}
            onPress={() => onChangeSortMode('recently_added')}
          >
            <Text style={[styles.sortOptionText, sortMode === 'recently_added' && styles.sortOptionTextActive]}>
              Recently added
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sortOptionBtn, sortMode === 'recently_reviewed' && styles.sortOptionBtnActive]}
            onPress={() => onChangeSortMode('recently_reviewed')}
          >
            <Text style={[styles.sortOptionText, sortMode === 'recently_reviewed' && styles.sortOptionTextActive]}>
              Recently reviewed
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sortOptionBtn, sortMode === 'alphabetical' && styles.sortOptionBtnActive]}
            onPress={() => onChangeSortMode('alphabetical')}
          >
            <Text style={[styles.sortOptionText, sortMode === 'alphabetical' && styles.sortOptionTextActive]}>
              Alphabetical
            </Text>
          </TouchableOpacity>

          <Text style={styles.sortModeHint}>{`Current: ${sortLabel}`}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sortModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sortModalCard: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    gap: 10,
  },
  sortModalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  sortOptionBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sortOptionBtnActive: {
    borderColor: '#4F7BFF',
    backgroundColor: 'rgba(79,123,255,0.2)',
  },
  sortOptionText: {
    color: '#DFE7FF',
    fontSize: 15,
    fontWeight: '600',
  },
  sortOptionTextActive: {
    color: '#FFFFFF',
  },
  sortModeHint: {
    marginTop: 4,
    color: '#9BA9C6',
    fontSize: 12,
  },
});
