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
import {
  CONTAINER_BG,
  MODAL_CTA_COLOR,
  MODAL_CTA_COLOR_BORDER,
  SCREEN_BG,
  TEXT_ON_BG,
  TEXT_ON_CTA,
} from '../../../theme/colors';

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
const MODAL_ENTRY_TRANSLATE_Y = 520;
const MODAL_ENTRY_DURATION_MS = 460;
const MODAL_BACKDROP_DURATION_MS = 300;
const MODAL_EXIT_DURATION_MS = 260;
// Tune this value to resize Text tab input box; modal panel height follows this value.
const TEXT_INPUT_BOX_HEIGHT = 200;
const TEXT_TAB_EXTRA_HEIGHT = 50; // label + spacing
// Single control for Image tab vertical size:
// Shrink this number to make upload area smaller and drop modal top down together.
const IMAGE_UPLOAD_PANEL_HEIGHT = 210;
const IMAGE_TAB_PANEL_HEIGHT = IMAGE_UPLOAD_PANEL_HEIGHT + 110; // label + gap + capture button + anti-crop buffer

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
  const [shouldRender, setShouldRender] = React.useState(visible);
  const [panelWidth, setPanelWidth] = React.useState(0);
  const [sheetHeight, setSheetHeight] = React.useState(0);
  const slideX = React.useRef(new Animated.Value(0)).current;
  const entranceY = React.useRef(new Animated.Value(MODAL_ENTRY_TRANSLATE_Y)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;
  const keyboardLift = React.useRef(new Animated.Value(0)).current;
  const currentOffsetRef = React.useRef(0);
  const textTabPanelHeight = TEXT_INPUT_BOX_HEIGHT + TEXT_TAB_EXTRA_HEIGHT;
  const panelHeight = addTab === 'image' ? IMAGE_TAB_PANEL_HEIGHT : textTabPanelHeight;

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
    if (visible) {
      setShouldRender(true);
      if (suppressAnimation) {
        entranceY.setValue(0);
        backdropOpacity.setValue(1);
        return;
      }
      entranceY.setValue(MODAL_ENTRY_TRANSLATE_Y);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(entranceY, {
          toValue: 0,
          duration: MODAL_ENTRY_DURATION_MS,
          easing: Easing.bezier(0.30, 0.2, 0.40, 1),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: MODAL_BACKDROP_DURATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!shouldRender) return;
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(entranceY, {
        toValue: MODAL_ENTRY_TRANSLATE_Y,
        duration: MODAL_EXIT_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: MODAL_EXIT_DURATION_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(keyboardLift, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setShouldRender(false);
      onDismiss();
    });
  }, [backdropOpacity, entranceY, keyboardLift, onDismiss, shouldRender, suppressAnimation, visible]);

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

  if (!shouldRender) return null;

  return (
    <Modal
      visible
      animationType="none"
      transparent
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.modalBackdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.modalSheet,
          {
            paddingBottom: addTab === 'image' ? 0 : 16,
            transform: [{ translateY: sheetTransform }],
          },
        ]}
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
          style={[styles.panelViewport, { height: panelHeight }]}
          onLayout={handlePanelLayout}
          {...panResponder.panHandlers}
        >
          <Animated.View style={[styles.panelTrack, { transform: [{ translateX: slideX }] }]}>
            <View style={styles.panelPage}>
              <CacheTextInputPanelUI
                manualText={manualText}
                onChangeManualText={onManualTextChange}
                inputHeight={TEXT_INPUT_BOX_HEIGHT}
              />
            </View>
            <View style={styles.panelPage}>
              <CacheImageInputPanelUI
                creatingImage={creatingImage}
                uploadPanelHeight={IMAGE_UPLOAD_PANEL_HEIGHT}
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
        ) : null}
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
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SCREEN_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    minHeight: 0,
    maxHeight: '66%',
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#4B5563',
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
    backgroundColor: CONTAINER_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
    backgroundColor: MODAL_CTA_COLOR,
  },
  tabText: {
    color: '#8D93A1',
    fontWeight: '700',
    fontSize: 15,
  },
  tabTextActive: {
    color: TEXT_ON_CTA,
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
  actionRow: {
    marginTop: 0,
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
    backgroundColor: CONTAINER_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  clearBtn: {
    backgroundColor: '#273449',
    borderWidth: 1,
    borderColor: 'rgba(190,211,240,0.35)',
  },
  addBtn: {
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionBtnText: {
    fontWeight: BUTTON_TOKENS.weight.regular,
    fontSize: BUTTON_TOKENS.text.strong,
    zIndex: 2,
  },
  pasteBtnText: {
    color: TEXT_ON_BG,
  },
  clearBtnText: {
    color: TEXT_ON_BG,
  },
  addBtnText: {
    color: TEXT_ON_CTA,
  },
});
