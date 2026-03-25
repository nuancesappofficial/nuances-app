import React from 'react';
import { Modal, Pressable, View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import CacheTextInputPanelUI from './CacheTextInputPanelUI';
import CacheImageInputPanelUI from './CacheImageInputPanelUI';

type Props = {
  visible: boolean;
  suppressAnimation: boolean;
  addTab: 'text' | 'image';
  manualText: string;
  creatingImage: boolean;
  onClose: () => void;
  onDismiss: () => void;
  onTabChange: (nextTab: 'text' | 'image') => void;
  onManualTextChange: (value: string) => void;
  onSubmitText: () => void;
  onUploadImage: () => void;
  onCaptureImage: () => void;
};

export default function CacheInputModalUI({
  visible,
  suppressAnimation,
  addTab,
  manualText,
  creatingImage,
  onClose,
  onDismiss,
  onTabChange,
  onManualTextChange,
  onSubmitText,
  onUploadImage,
  onCaptureImage,
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType={suppressAnimation ? 'none' : 'slide'}
      transparent
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.modalSheet}>
        <View style={styles.sheetHandle} />

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, addTab === 'text' && styles.tabBtnActive]}
            onPress={() => onTabChange('text')}
          >
            <Text style={[styles.tabText, addTab === 'text' && styles.tabTextActive]}>Text</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, addTab === 'image' && styles.tabBtnActive]}
            onPress={() => onTabChange('image')}
          >
            <Text style={[styles.tabText, addTab === 'image' && styles.tabTextActive]}>Image</Text>
          </TouchableOpacity>
        </View>

        {addTab === 'text' ? (
          <CacheTextInputPanelUI
            manualText={manualText}
            onChangeManualText={onManualTextChange}
            onSubmit={onSubmitText}
          />
        ) : (
          <CacheImageInputPanelUI
            creatingImage={creatingImage}
            onUploadImage={onUploadImage}
            onCaptureImage={onCaptureImage}
          />
        )}

        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    minHeight: 420,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#C8C8CD',
    alignSelf: 'center',
    marginBottom: 14,
  },
  tabRow: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 4,
    flexDirection: 'row',
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    color: '#8E8E93',
    fontWeight: '600',
    fontSize: 15,
  },
  tabTextActive: {
    color: '#101010',
  },
  cancelBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
  },
  cancelBtnText: {
    color: '#007AFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
