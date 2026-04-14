import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';

type Props = {
  creatingImage: boolean;
  onUploadImage: () => void;
  onCaptureImage: () => void;
};

export default function CacheImageInputPanelUI({
  creatingImage,
  onUploadImage,
  onCaptureImage,
}: Props) {
  return (
    <>
      <Text style={styles.inputLabel}>Capture or upload image</Text>
      <TouchableOpacity
        style={styles.imageUploadPanel}
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
        <Text style={styles.primaryActionText}>Capture Image</Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  imageUploadPanel: {
    minHeight: 210,
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  imageUploadIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FF9500',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  imageUploadIcon: {
    fontSize: 34,
    color: '#fff',
  },
  imageUploadText: {
    color: '#8E8E93',
    fontSize: 19,
    textAlign: 'center',
  },
  primaryAction: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    alignItems: 'center',
    height: 52,
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  imageAction: {
    backgroundColor: '#FF9500',
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
