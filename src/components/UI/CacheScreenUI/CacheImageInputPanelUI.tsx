import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  creatingImage: boolean;
  uploadPanelHeight: number;
  onUploadImage: () => void;
  onCaptureImage: () => void;
};

export default function CacheImageInputPanelUI({
  creatingImage,
  uploadPanelHeight,
  onUploadImage,
  onCaptureImage,
}: Props) {
  return (
    <>
      <Text style={styles.inputLabel}>Capture or upload image</Text>
      <TouchableOpacity
        style={[styles.imageUploadPanel, { height: uploadPanelHeight }]}
        activeOpacity={0.9}
        onPress={onUploadImage}
        disabled={creatingImage}
      >
        <View style={styles.imageUploadIconWrap}>
          <Text style={styles.imageUploadIcon}>🖼️</Text>
        </View>
        <Text style={styles.imageUploadText}>
          {creatingImage ? 'processing image...' : 'upload image'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.primaryAction, styles.imageAction]}
        onPress={onCaptureImage}
        disabled={creatingImage}
      >
        <Ionicons name="camera" size={22} color="#111111" />
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#97A0AF',
    marginBottom: 10,
  },
  imageUploadPanel: {
    backgroundColor: '#181C23',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  imageUploadIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E5FF4F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  imageUploadIcon: {
    fontSize: 34,
    color: '#111111',
  },
  imageUploadText: {
    color: '#FFFFFF',
    fontSize: 19,
    textAlign: 'center',
    fontWeight: '700',
  },
  primaryAction: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
  },
  imageAction: {
    backgroundColor: '#FFFFFF',
  },
  primaryActionText: {
    color: '#111111',
    fontWeight: '800',
    fontSize: 16,
  },
});
