import React from 'react';
import {
  Modal,
  Pressable,
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Animated,
  PanResponder,
  type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
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
  const [panelWidth, setPanelWidth] = React.useState(0);
  const slideX = React.useRef(new Animated.Value(0)).current;
  const currentOffsetRef = React.useRef(0);

  React.useEffect(() => {
    if (panelWidth <= 0) return;
    const toValue = addTab === 'text' ? 0 : -panelWidth;
    currentOffsetRef.current = toValue;
    Animated.spring(slideX, {
      toValue,
      useNativeDriver: true,
      damping: 24,
      stiffness: 220,
      mass: 0.9,
    }).start();
  }, [addTab, panelWidth, slideX]);

  const handlePanelLayout = React.useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0) return;
    setPanelWidth(width);
  }, []);

  const handleTabPress = React.useCallback(
    (nextTab: 'text' | 'image') => {
      if (nextTab === addTab) return;
      void Haptics.selectionAsync();
      onTabChange(nextTab);
    },
    [addTab, onTabChange]
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          const { dx, dy } = gestureState;
          return Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy);
        },
        onPanResponderMove: (_evt, gestureState) => {
          if (panelWidth <= 0) return;
          const minX = -panelWidth;
          const maxX = 0;
          const nextX = Math.max(minX, Math.min(maxX, currentOffsetRef.current + gestureState.dx));
          slideX.setValue(nextX);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          if (panelWidth <= 0) return;
          const threshold = panelWidth * 0.2;
          if (gestureState.dx < -threshold && addTab === 'text') {
            void Haptics.selectionAsync();
            onTabChange('image');
            return;
          }
          if (gestureState.dx > threshold && addTab === 'image') {
            void Haptics.selectionAsync();
            onTabChange('text');
            return;
          }
          Animated.spring(slideX, {
            toValue: currentOffsetRef.current,
            useNativeDriver: true,
            damping: 24,
            stiffness: 220,
            mass: 0.9,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(slideX, {
            toValue: currentOffsetRef.current,
            useNativeDriver: true,
            damping: 24,
            stiffness: 220,
            mass: 0.9,
          }).start();
        },
      }),
    [addTab, onTabChange, panelWidth, slideX]
  );

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
        <Text style={styles.eyebrow}>ADD TO CACHE</Text>
        <Text style={styles.title}>Capture a new phrase</Text>
        <Text style={styles.subtitle}>Choose text or image, then turn it into cards from the same flow.</Text>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, addTab === 'text' && styles.tabBtnActive]}
            onPress={() => handleTabPress('text')}
          >
            <Text style={[styles.tabText, addTab === 'text' && styles.tabTextActive]}>Text</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, addTab === 'image' && styles.tabBtnActive]}
            onPress={() => handleTabPress('image')}
          >
            <Text style={[styles.tabText, addTab === 'image' && styles.tabTextActive]}>Image</Text>
          </TouchableOpacity>
        </View>

        <View
          style={styles.panelViewport}
          onLayout={handlePanelLayout}
          {...panResponder.panHandlers}
        >
          <Animated.View style={[styles.panelTrack, { transform: [{ translateX: slideX }] }]}>
            <View style={styles.panelPage}>
              <CacheTextInputPanelUI
                manualText={manualText}
                onChangeManualText={onManualTextChange}
                onSubmit={onSubmitText}
              />
            </View>
            <View style={styles.panelPage}>
              <CacheImageInputPanelUI
                creatingImage={creatingImage}
                onUploadImage={onUploadImage}
                onCaptureImage={onCaptureImage}
              />
            </View>
          </Animated.View>
        </View>

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
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    backgroundColor: '#111318',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    minHeight: 520,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
    marginBottom: 14,
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
    marginTop: 10,
  },
  subtitle: {
    color: '#B4BBC8',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 16,
  },
  tabRow: {
    backgroundColor: '#1A1E27',
    borderRadius: 16,
    padding: 4,
    flexDirection: 'row',
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    color: '#8D93A1',
    fontWeight: '700',
    fontSize: 15,
  },
  tabTextActive: {
    color: '#101010',
  },
  panelViewport: {
    overflow: 'hidden',
  },
  panelTrack: {
    width: '200%',
    flexDirection: 'row',
  },
  panelPage: {
    width: '50%',
  },
  cancelBtn: {
    marginTop: 14,
    borderRadius: 18,
    backgroundColor: '#1A1E27',
    alignItems: 'center',
    paddingVertical: 14,
  },
  cancelBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
});
