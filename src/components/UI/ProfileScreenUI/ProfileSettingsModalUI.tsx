import React from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const [mounted, setMounted] = React.useState(visible);
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const sheetTranslateY = React.useRef(new Animated.Value(48)).current;

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          damping: 18,
          stiffness: 180,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 48,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [overlayOpacity, sheetTranslateY, visible]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <Animated.View
            style={[
              styles.sheet,
              {
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
          >
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
          </Animated.View>
        </SafeAreaView>
      </Animated.View>
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
