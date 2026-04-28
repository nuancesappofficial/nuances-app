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
  Keyboard,
  Platform,
  Easing,
  useWindowDimensions,
  type LayoutChangeEvent,
  type EmitterSubscription,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import CacheTextInputPanelUI from './CacheTextInputPanelUI';
import CacheImageInputPanelUI from './CacheImageInputPanelUI';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';

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
  textPrimaryAction: 'paste' | 'clear';
  onPressPaste: () => void;
  onPressClearText: () => void;
  pasteEnabled: boolean;
  onUploadImage: () => void;
  onCaptureImage: () => void;
};

const SHEET_TOP_SAFE_MARGIN = 72;
const KEYBOARD_EXTRA_GAP = 8;

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
  textPrimaryAction,
  onPressPaste,
  onPressClearText,
  pasteEnabled,
  onUploadImage,
  onCaptureImage,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [panelWidth, setPanelWidth] = React.useState(0);
  const [sheetHeight, setSheetHeight] = React.useState(0);
  const slideX = React.useRef(new Animated.Value(0)).current;
  const entranceY = React.useRef(new Animated.Value(36)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;
  const keyboardLift = React.useRef(new Animated.Value(0)).current;
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

  React.useEffect(() => {
    if (!visible) {
      entranceY.setValue(36);
      backdropOpacity.setValue(0);
      keyboardLift.setValue(0);
      return;
    }

    if (suppressAnimation) {
      entranceY.setValue(0);
      backdropOpacity.setValue(1);
      return;
    }

    Animated.parallel([
      Animated.timing(entranceY, {
        toValue: 0,
        duration: 230,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, entranceY, keyboardLift, suppressAnimation, visible]);

  React.useEffect(() => {
    if (!visible) return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: any) => {
      const kbHeight = Math.max(0, event?.endCoordinates?.height ?? 0);
      const requestedLift = kbHeight + KEYBOARD_EXTRA_GAP;
      const maxAllowedLift = Math.max(0, windowHeight - Math.max(sheetHeight, 360) - SHEET_TOP_SAFE_MARGIN);
      const nextLift = Math.min(requestedLift, maxAllowedLift);
      const duration = typeof event?.duration === 'number' ? event.duration : 220;
      Animated.timing(keyboardLift, {
        toValue: nextLift,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };

    const onHide = (event: any) => {
      const duration = typeof event?.duration === 'number' ? event.duration : 200;
      Animated.timing(keyboardLift, {
        toValue: 0,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };

    const subs: EmitterSubscription[] = [
      Keyboard.addListener(showEvent, onShow),
      Keyboard.addListener(hideEvent, onHide),
    ];

    return () => {
      subs.forEach((sub) => sub.remove());
    };
  }, [keyboardLift, sheetHeight, visible, windowHeight]);

  const sheetTransform = React.useMemo(
    () => Animated.add(entranceY, Animated.multiply(keyboardLift, -1)),
    [entranceY, keyboardLift]
  );

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <Animated.View style={[styles.modalBackdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[styles.modalSheet, { transform: [{ translateY: sheetTransform }] }]}
        onLayout={(event) => {
          const nextHeight = Math.round(event.nativeEvent.layout.height);
          setSheetHeight((prev) => (prev === nextHeight ? prev : nextHeight));
        }}
      >
        <View style={styles.sheetHandle} />
        <Text style={styles.eyebrow}>ADD TO CACHE</Text>

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

        {addTab === 'text' ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                textPrimaryAction === 'clear' ? styles.clearBtn : styles.pasteBtn,
                textPrimaryAction === 'paste' && !pasteEnabled && styles.actionBtnDisabled,
              ]}
              disabled={textPrimaryAction === 'paste' ? !pasteEnabled : false}
              onPress={textPrimaryAction === 'clear' ? onPressClearText : onPressPaste}
            >
              <Text
                style={[
                  styles.actionBtnText,
                  textPrimaryAction === 'clear' ? styles.clearBtnText : styles.pasteBtnText,
                ]}
              >
                {textPrimaryAction === 'clear' ? 'Clear' : 'Paste'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.addBtn, !manualText.trim() && styles.actionBtnDisabled]}
              disabled={!manualText.trim()}
              onPress={onSubmitText}
            >
              <Text style={[styles.actionBtnText, styles.addBtnText]}>Add</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.actionRow, styles.actionRowGhost]} />
        )}
      </Animated.View>
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
    paddingTop: 10,
    paddingBottom: 16,
    minHeight: 320,
    maxHeight: '66%',
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
    marginBottom: 10,
  },
  eyebrow: {
    color: '#8D93A1',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  tabRow: {
    backgroundColor: '#1A1E27',
    borderRadius: 16,
    padding: 4,
    flexDirection: 'row',
    marginBottom: 12,
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
    minHeight: 280,
  },
  panelTrack: {
    width: '200%',
    flexDirection: 'row',
  },
  panelPage: {
    width: '50%',
  },
  actionRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    borderRadius: BUTTON_TOKENS.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    height: BUTTON_TOKENS.height.prominent,
    overflow: 'hidden',
  },
  pasteBtn: {
    backgroundColor: '#3F6DFF',
    borderWidth: 1,
    borderColor: 'rgba(178,201,255,0.7)',
  },
  clearBtn: {
    backgroundColor: '#3B4353',
    borderWidth: 1,
    borderColor: 'rgba(193,204,224,0.42)',
  },
  addBtn: {
    backgroundColor: '#2F8B53',
    borderWidth: 1,
    borderColor: 'rgba(200,241,216,0.62)',
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionRowGhost: {
    opacity: 0,
  },
  actionBtnText: {
    fontWeight: BUTTON_TOKENS.weight.regular,
    fontSize: BUTTON_TOKENS.text.strong,
    zIndex: 2,
  },
  pasteBtnText: {
    color: '#FFFFFF',
  },
  clearBtnText: {
    color: '#FFFFFF',
  },
  addBtnText: {
    color: '#FFFFFF',
  },
});
