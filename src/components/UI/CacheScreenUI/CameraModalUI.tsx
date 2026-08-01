import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UILanguage } from '../../../services/settings/userSettings';
import { tUI } from '../../../i18n/uiLanguage';

type Props = {
  visible: boolean;
  hasPermission: boolean;
  cameraRef: React.RefObject<CameraView | null>;
  facing: CameraType;
  uiLanguage: UILanguage;
  onClose: () => void;
  onToggleFacing: () => void;
  onCapture: () => void;
};

export default function CameraModalUI({
  visible,
  hasPermission,
  cameraRef,
  facing,
  uiLanguage,
  onClose,
  onToggleFacing,
  onCapture,
}: Props) {
  const insets = useSafeAreaInsets();

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
            <Text style={styles.cameraPermissionText}>
              {tUI(uiLanguage, 'camera.permissionRequired')}
            </Text>
          </View>
        )}

        <View style={[styles.cameraTopBar, { top: insets.top + 12 }]}>
          <Pressable
            style={({ pressed }) => [styles.cameraTopButton, pressed ? styles.iconButtonPressed : null]}
            onPress={onClose}
          >
            <Text style={styles.cameraTopButtonText}>✕</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.cameraTopButton, pressed ? styles.iconButtonPressed : null]}
            onPress={onToggleFacing}
          >
            <Text style={styles.cameraTopButtonText}>↺</Text>
          </Pressable>
        </View>

        <View style={[styles.cameraBottomBar, { bottom: insets.bottom + 18 }]}>
          <Pressable
            style={({ pressed }) => [
              styles.shutterOuter,
              pressed && hasPermission ? styles.shutterPressed : null,
            ]}
            onPress={onCapture}
            disabled={!hasPermission}
          >
            <View style={styles.shutterInner} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cameraContainer: {
    flex: 1,
    backgroundColor: '#02213D',
  },
  cameraPermissionFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#02213D',
  },
  cameraPermissionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraTopBar: {
    position: 'absolute',
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
  iconButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
  shutterPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
});
