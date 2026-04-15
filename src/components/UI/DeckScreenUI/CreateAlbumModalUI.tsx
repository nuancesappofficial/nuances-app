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
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onCancel} />

        <View style={styles.sheet}>
          <Text style={styles.eyebrow}>NEW ALBUM</Text>
          <Text style={styles.title}>Create a new album</Text>
          <Text style={styles.subtitle}>Give this collection a name so it feels like its own space.</Text>

          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Album name</Text>
            <TextInput
              style={styles.input}
              placeholder="Type album name"
              placeholderTextColor="#737B88"
              value={albumName}
              onChangeText={onChangeAlbumName}
              autoFocus
            />
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
              <Text style={styles.confirmText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end', 
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 350, // 增加這個數值，Modal 就會垂直往上平移
  },
  sheet: {
    borderRadius: 24,
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    //minHeight: 700,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 32,
    gap: 16,
  },
  eyebrow: {
    color: '#8D93A1',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#B4BBC8',
    fontSize: 14,
    lineHeight: 20,
  },
  inputCard: {
    borderRadius: 20,
    backgroundColor: '#181C23',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  inputLabel: {
    color: '#97A0AF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#111318',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#FFFFFF',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#1A1E27',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  confirmText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '800',
  },
});
