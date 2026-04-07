import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onDelete: () => void;
};

export default function CardActionModalUI({ visible, title, onClose, onDelete }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sortModalOverlay} onPress={onClose}>
        <Pressable style={styles.sortModalCard} onPress={() => undefined}>
          <Text style={styles.sortModalTitle}>{title}</Text>
          <TouchableOpacity style={styles.deleteOptionBtn} onPress={onDelete}>
            <Text style={styles.deleteOptionText}>刪掉卡片</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelOptionBtn} onPress={onClose}>
            <Text style={styles.cancelOptionText}>取消</Text>
          </TouchableOpacity>
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
  deleteOptionBtn: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,59,48,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.36)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  deleteOptionText: {
    color: '#FF8D87',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  cancelOptionBtn: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cancelOptionText: {
    color: '#DFE7FF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
