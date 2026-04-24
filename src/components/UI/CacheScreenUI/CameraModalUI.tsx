import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';

type Props = {
  visible: boolean;
  hasPermission: boolean;
  cameraRef: React.RefObject<CameraView | null>;
  facing: CameraType;
  onClose: () => void;
  onToggleFacing: () => void;
  onCapture: () => void;
};

export default function CameraModalUI({
  visible,
  hasPermission,
  cameraRef,
  facing,
  onClose,
  onToggleFacing,
  onCapture,
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.cameraContainer}>
        {hasPermission ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
          />
        ) : (
          <View style={styles.cameraPermissionFallback}>
            <Text style={styles.cameraPermissionText}>需要相機權限才能拍照</Text>
          </View>
        )}

        <View style={styles.cameraTopBar}>
          <TouchableOpacity style={styles.cameraTopButton} onPress={onClose}>
            <Text style={styles.cameraTopButtonText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cameraTopButton} onPress={onToggleFacing}>
            <Text style={styles.cameraTopButtonText}>↺</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cameraBottomBar}>
          <TouchableOpacity
            style={styles.shutterOuter}
            onPress={onCapture}
            disabled={!hasPermission}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cameraContainer: {
    flex: 1,
    backgroundColor: '#ADD8E6',
  },
  cameraPermissionFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ADD8E6',
  },
  cameraPermissionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraTopBar: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  cameraTopButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraTopButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  cameraBottomBar: {
    position: 'absolute',
    bottom: 42,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutterOuter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
});
