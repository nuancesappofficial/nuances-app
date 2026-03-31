import React from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  visible: boolean;
  albumName: string;
  onChangeAlbumName: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function CreateAlbumModalUI({
  visible,
  albumName,
  onChangeAlbumName,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>新增相簿</Text>

          <TextInput
            style={styles.modalInput}
            placeholder="請輸入相簿名稱"
            placeholderTextColor="#8E8E93"
            value={albumName}
            onChangeText={onChangeAlbumName}
            autoFocus
          />

          <View style={styles.modalButtonGroup}>
            <TouchableOpacity style={styles.modalButtonCancel} onPress={onCancel}>
              <Text style={styles.modalButtonTextCancel}>取消</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalButtonConfirm} onPress={onConfirm}>
              <Text style={styles.modalButtonTextConfirm}>確認</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContainer: {
    width: '80%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#D1D1D6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111111',
    marginBottom: 14,
  },
  modalButtonGroup: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalButtonCancel: {
    borderRadius: 10,
    backgroundColor: '#E5E5EA',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalButtonConfirm: {
    borderRadius: 10,
    backgroundColor: '#007AFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalButtonTextCancel: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '600',
  },
  modalButtonTextConfirm: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
