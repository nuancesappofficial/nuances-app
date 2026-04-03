import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  savingEntitlement: boolean;
  entitlementMode: 'guest' | 'premium';
  onClose: () => void;
  onPressUploadProfilePic: () => void;
  onToggleEntitlement: () => void;
};

export default function ProfileSettingsModalUI({
  visible,
  savingEntitlement,
  entitlementMode,
  onClose,
  onPressUploadProfilePic,
  onToggleEntitlement,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>Settings</Text>

            <TouchableOpacity style={styles.primaryButton} activeOpacity={0.9} onPress={onPressUploadProfilePic}>
              <Text style={styles.primaryButtonText}>Upload profile pic</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.9} onPress={onToggleEntitlement}>
              <Text style={styles.secondaryButtonText}>
                {savingEntitlement
                  ? 'Updating...'
                  : entitlementMode === 'premium'
                    ? 'Switch to Guest'
                    : 'Switch to Premium'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeButton} activeOpacity={0.85} onPress={onClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 12, 18, 0.45)',
    justifyContent: 'flex-end',
  },
  safeArea: {
    width: '100%',
  },
  sheet: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.18)',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 16,
    textAlign: 'center',
  },
  primaryButton: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#111111',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#EEF2F7',
    marginBottom: 10,
  },
  secondaryButtonText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#5C6470',
    fontSize: 14,
    fontWeight: '600',
  },
});
