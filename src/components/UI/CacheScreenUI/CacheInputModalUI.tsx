import React from 'react';
import {
  Modal,
  Pressable,
  View,
  StyleSheet,
  Text,
  Animated,
  PanResponder,
  Keyboard,
  Platform,
  Easing,
  useColorScheme,
  useWindowDimensions,
  type LayoutChangeEvent,
  type EmitterSubscription,
} from 'react-native';
import { BlurView } from 'expo-blur';
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
  resolveThemeColors,
} from '../../../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_USER_SETTINGS, type UILanguage } from '../../../services/settings/userSettings';
import { tUI } from '../../../i18n/uiLanguage';

type Props = {
  visible: boolean;
  suppressAnimation: boolean;
  addTab: 'text' | 'image';
  manualText: string;
  creatingImage: boolean;
  creatingText: boolean;
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
  tourPasteTextActive?: boolean;
  tourPasteTextTooltip?: string;
  onTourPasteTextPress?: () => void;
  tourSampleSentences?: string[];
  onTourCopySampleText?: (sentence: string) => void;
  tourAddTextActive?: boolean;
  tourAddTextTooltip?: string;
  onTourAddTextPress?: () => void;
  uiLanguage?: UILanguage;
};

type LocalLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const SHEET_TOP_SAFE_MARGIN = 72;
const KEYBOARD_EXTRA_GAP = 8;
const MODAL_ENTRY_TRANSLATE_Y = 520;
const MODAL_ENTRY_DURATION_MS = 460;
const MODAL_BACKDROP_DURATION_MS = 300;
const MODAL_EXIT_DURATION_MS = 260;
const TOUR_HIGHLIGHT_FADE_IN_MS = 420;
const TOUR_HIGHLIGHT_FADE_OUT_MS = 180;
const DARK_MODE_TOUR_TOOLTIP_BG = 'rgba(2, 33, 61, 0.97)';
const DARK_MODE_TOUR_TOOLTIP_TEXT = '#F8FAFC';
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
  creatingText,
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
  tourPasteTextActive = false,
  tourPasteTextTooltip = '',
  onTourPasteTextPress,
  tourSampleSentences = [],
  onTourCopySampleText,
  tourAddTextActive = false,
  tourAddTextTooltip = '',
  onTourAddTextPress,
  uiLanguage = DEFAULT_USER_SETTINGS.uiLanguage,
}: Props) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const isLight = colorScheme === 'light';
  const lightModalColors = React.useMemo(
    () => ({
      sheetBg: palette.screenBg,
      tabShellBg: palette.containerBg,
      tabShellBorder: palette.borderSubtle,
      tabText: palette.textOnContainer,
      tabTextActive: TEXT_ON_CTA,
    }),
    [palette]
  );
  const { height: windowHeight } = useWindowDimensions();
  const [shouldRender, setShouldRender] = React.useState(visible);
  const [panelWidth, setPanelWidth] = React.useState(0);
  const [sheetHeight, setSheetHeight] = React.useState(0);
  const [actionRowLayout, setActionRowLayout] = React.useState<LocalLayout | null>(null);
  const [pasteButtonLayout, setPasteButtonLayout] = React.useState<LocalLayout | null>(null);
  const [addButtonLayout, setAddButtonLayout] = React.useState<LocalLayout | null>(null);
  const slideX = React.useRef(new Animated.Value(0)).current;
  const entranceY = React.useRef(new Animated.Value(MODAL_ENTRY_TRANSLATE_Y)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;
  const keyboardLift = React.useRef(new Animated.Value(0)).current;
  const localTourProgress = React.useRef(new Animated.Value(0)).current;
  const currentOffsetRef = React.useRef(0);
  const textTabPanelHeight = TEXT_INPUT_BOX_HEIGHT + TEXT_TAB_EXTRA_HEIGHT;
  const panelHeight = addTab === 'image' ? IMAGE_TAB_PANEL_HEIGHT : textTabPanelHeight;
  const activeTourAction = tourPasteTextActive ? 'paste' : tourAddTextActive ? 'add' : null;
  const activeTourButtonLayout = activeTourAction === 'paste' ? pasteButtonLayout : activeTourAction === 'add' ? addButtonLayout : null;
  const activeTourTarget =
    actionRowLayout && activeTourButtonLayout
      ? {
          x: actionRowLayout.x + activeTourButtonLayout.x,
          y: actionRowLayout.y + activeTourButtonLayout.y,
          width: activeTourButtonLayout.width,
          height: activeTourButtonLayout.height,
        }
      : null;
  const activeTourTooltip = tourPasteTextActive ? tourPasteTextTooltip : tourAddTextActive ? tourAddTextTooltip : '';
  const activeTourPress = tourPasteTextActive ? onTourPasteTextPress || onPressPaste : tourAddTextActive ? onTourAddTextPress || onSubmitText : undefined;
  const isLocalTourActive = Boolean(activeTourTarget && activeTourPress);
  const shouldShowTourSampleSentences = tourPasteTextActive && tourSampleSentences.length > 0;
  const localTourSheetTop = Math.max(0, windowHeight - Math.max(sheetHeight, 0));
  const localTourFloatingTop = Math.min(-24, insets.top + 28 - localTourSheetTop);
  const localTourTooltipTop = shouldShowTourSampleSentences
    ? localTourFloatingTop + 164
    : localTourFloatingTop + 8;

  React.useEffect(() => {
    Animated.timing(localTourProgress, {
      toValue: isLocalTourActive ? 1 : 0,
      duration: isLocalTourActive ? TOUR_HIGHLIGHT_FADE_IN_MS : TOUR_HIGHLIGHT_FADE_OUT_MS,
      easing: isLocalTourActive ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [isLocalTourActive, localTourProgress]);

  const localTourContentOpacity = localTourProgress.interpolate({
    inputRange: [0, 0.28, 1],
    outputRange: [0, 0, 1],
  });

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
    if (suppressAnimation) {
      entranceY.setValue(MODAL_ENTRY_TRANSLATE_Y);
      backdropOpacity.setValue(0);
      keyboardLift.setValue(0);
      setShouldRender(false);
      onDismiss();
      return;
    }
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
      {isLocalTourActive && activeTourPress ? (
        <View style={styles.localTourBackdropMask}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: localTourProgress }]}>
            <BlurView tint="dark" intensity={58} style={StyleSheet.absoluteFill} />
            <View style={styles.localTourDim} />
          </Animated.View>
        </View>
      ) : null}
      <Animated.View
        style={[
          styles.modalSheet,
          {
            backgroundColor: isLight ? lightModalColors.sheetBg : palette.modalBg,
            borderColor: palette.modalOptionBorder,
            paddingBottom: addTab === 'image' ? 0 : 16,
            transform: [{ translateY: sheetTransform }],
          },
        ]}
        onLayout={(event) => {
          const nextHeight = Math.round(event.nativeEvent.layout.height);
          setSheetHeight((prev) => (prev === nextHeight ? prev : nextHeight));
        }}
      >
        <View style={[styles.sheetHandle, { backgroundColor: palette.secondaryText }]} />
        <Text style={[styles.eyebrow, { color: palette.secondaryText }]}>
          {tUI(uiLanguage, 'cache.addToCache').toUpperCase()}
        </Text>

        <View
          style={[
            styles.tabRow,
            {
              backgroundColor: isLight ? lightModalColors.tabShellBg : palette.containerBg,
              borderColor: isLight ? lightModalColors.tabShellBorder : palette.modalOptionBorder,
            },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.tabBtn,
              addTab === 'text' && styles.tabBtnActive,
              pressed ? styles.tabBtnPressed : null,
            ]}
            onPress={() => handleTabPress('text')}
          >
            <Text
              style={[
                styles.tabText,
                { color: isLight ? lightModalColors.tabText : palette.secondaryText },
                addTab === 'text'
                  ? [styles.tabTextActive, { color: isLight ? lightModalColors.tabTextActive : TEXT_ON_CTA }]
                  : isLight
                    ? { color: lightModalColors.tabText }
                    : null,
              ]}
            >
              {tUI(uiLanguage, 'cache.tabText')}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.tabBtn,
              addTab === 'image' && styles.tabBtnActive,
              pressed ? styles.tabBtnPressed : null,
            ]}
            onPress={() => handleTabPress('image')}
          >
            <Text
              style={[
                styles.tabText,
                { color: isLight ? lightModalColors.tabText : palette.secondaryText },
                addTab === 'image'
                  ? [styles.tabTextActive, { color: isLight ? lightModalColors.tabTextActive : TEXT_ON_CTA }]
                  : isLight
                    ? { color: lightModalColors.tabText }
                    : null,
              ]}
            >
              {tUI(uiLanguage, 'cache.tabImage')}
            </Text>
          </Pressable>
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
                uiLanguage={uiLanguage}
                inputHeight={TEXT_INPUT_BOX_HEIGHT}
                palette={palette}
              />
            </View>
            <View style={styles.panelPage}>
              <CacheImageInputPanelUI
                creatingImage={creatingImage}
                uploadPanelHeight={IMAGE_UPLOAD_PANEL_HEIGHT}
                onUploadImage={onUploadImage}
                onCaptureImage={onCaptureImage}
                palette={palette}
                uiLanguage={uiLanguage}
              />
            </View>
          </Animated.View>
        </View>

        {addTab === 'text' ? (
          <View
            style={styles.actionRow}
            onLayout={(event) => {
              const { x, y, width, height } = event.nativeEvent.layout;
              setActionRowLayout((prev) =>
                prev && prev.x === x && prev.y === y && prev.width === width && prev.height === height
                  ? prev
                  : { x, y, width, height }
              );
            }}
          >
            <Pressable
              onLayout={(event) => {
                const { x, y, width, height } = event.nativeEvent.layout;
                setPasteButtonLayout((prev) =>
                  prev && prev.x === x && prev.y === y && prev.width === width && prev.height === height
                    ? prev
                    : { x, y, width, height }
                );
              }}
              style={({ pressed }) => [
                styles.actionBtn,
                textPrimaryAction === 'clear'
                  ? [styles.clearBtn, { backgroundColor: palette.mutedSurface, borderColor: palette.modalOptionBorder }]
                  : [styles.pasteBtn, { backgroundColor: palette.containerBg, borderColor: palette.modalOptionBorder }],
                tourPasteTextActive ? styles.tourActionBtnActive : null,
                textPrimaryAction === 'paste' && !pasteEnabled && !tourPasteTextActive && styles.actionBtnDisabled,
                pressed && (textPrimaryAction === 'clear' || pasteEnabled || tourPasteTextActive) ? styles.actionBtnPressed : null,
              ]}
              disabled={textPrimaryAction === 'paste' ? !pasteEnabled && !tourPasteTextActive : false}
              onPress={tourPasteTextActive ? onTourPasteTextPress || onPressPaste : textPrimaryAction === 'clear' ? onPressClearText : onPressPaste}
            >
              <Text
                style={[
                  styles.actionBtnText,
                  textPrimaryAction === 'clear' ? styles.clearBtnText : styles.pasteBtnText,
                  { color: palette.textOnContainer },
                ]}
              >
                {tUI(
                  uiLanguage,
                  textPrimaryAction === 'clear' ? 'cache.clear' : 'cache.paste'
                )}
              </Text>
            </Pressable>
            <Pressable
              onLayout={(event) => {
                const { x, y, width, height } = event.nativeEvent.layout;
                setAddButtonLayout((prev) =>
                  prev && prev.x === x && prev.y === y && prev.width === width && prev.height === height
                    ? prev
                    : { x, y, width, height }
                );
              }}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.addBtn,
                tourAddTextActive ? styles.tourActionBtnActive : null,
                (!manualText.trim() || creatingText) && styles.actionBtnDisabled,
                pressed && Boolean(manualText.trim()) && !creatingText ? styles.actionBtnPressed : null,
              ]}
              disabled={!manualText.trim() || creatingText}
              onPress={tourAddTextActive ? onTourAddTextPress || onSubmitText : onSubmitText}
            >
              <Text style={[styles.actionBtnText, styles.addBtnText]}>
                {tUI(uiLanguage, creatingText ? 'cache.adding' : 'cache.add')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {activeTourTarget && activeTourPress ? (
          <View style={styles.localTourSheetOverlay}>
            {shouldShowTourSampleSentences ? (
              <Animated.View
                style={[
                  styles.sampleStickyNote,
                  !isLight ? styles.sampleStickyNoteDarkModeLightBox : null,
                  { opacity: localTourContentOpacity },
                  { top: localTourFloatingTop },
                ]}
              >
                <View style={styles.sampleCardAccent} />
                <Text style={[styles.sampleStickyTitle, !isLight ? styles.sampleStickyTitleDarkMode : null]}>
                  {tUI(uiLanguage, 'cache.copyAnySentence')}
                </Text>
                {tourSampleSentences.map((sentence, index) => (
                  <View
                    key={`${sentence}-${index}`}
                    style={[
                      styles.sampleSentenceRow,
                      !isLight ? styles.sampleSentenceRowDarkMode : null,
                      index === tourSampleSentences.length - 1 ? styles.sampleSentenceRowLast : null,
                    ]}
                  >
                    <Text style={[styles.sampleSentenceText, !isLight ? styles.sampleSentenceTextDarkMode : null]}>
                      {sentence}
                    </Text>
                    <Pressable
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.sampleCopyBtn,
                        pressed ? styles.sampleCopyBtnPressed : null,
                      ]}
                      onPress={() => onTourCopySampleText?.(sentence)}
                    >
                      <Text style={styles.sampleCopyText}>{tUI(uiLanguage, 'cache.copy')}</Text>
                    </Pressable>
                  </View>
                ))}
              </Animated.View>
            ) : null}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.localTourTooltip,
                !isLight ? styles.localTourTooltipDarkModeLightBox : null,
                { opacity: localTourContentOpacity },
                {
                  left: Math.max(12, Math.min(activeTourTarget.x, panelWidth - 260)),
                  top: localTourTooltipTop,
                },
              ]}
            >
              <Text style={[styles.localTourTooltipText, !isLight ? styles.localTourTooltipTextDarkModeLightBox : null]}>
                {activeTourTooltip}
              </Text>
            </Animated.View>
            <Pressable
              onPress={activeTourPress}
              style={[
                styles.localTourClone,
                activeTourAction === 'paste'
                  ? textPrimaryAction === 'clear'
                    ? [styles.clearBtn, { backgroundColor: palette.mutedSurface, borderColor: palette.modalOptionBorder }]
                    : [styles.pasteBtn, { backgroundColor: palette.containerBg, borderColor: palette.modalOptionBorder }]
                  : styles.addBtn,
                {
                  left: activeTourTarget.x,
                  top: activeTourTarget.y,
                  width: activeTourTarget.width,
                  height: activeTourTarget.height,
                },
              ]}
            >
              <Animated.View pointerEvents="none" style={[styles.localTourCloneContent, { opacity: localTourContentOpacity }]}>
                <Text
                  style={[
                    styles.actionBtnText,
                    activeTourAction === 'add'
                      ? styles.addBtnText
                      : textPrimaryAction === 'clear'
                        ? styles.clearBtnText
                        : styles.pasteBtnText,
                    { color: activeTourAction === 'add' ? TEXT_ON_CTA : palette.textOnContainer },
                  ]}
                >
                  {tUI(
                    uiLanguage,
                    activeTourAction === 'add'
                      ? 'cache.add'
                      : textPrimaryAction === 'clear'
                        ? 'cache.clear'
                        : 'cache.paste'
                  )}
                </Text>
              </Animated.View>
            </Pressable>
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
    zIndex: 60,
    elevation: 60,
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
  tabBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
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
  tourActionBtnActive: {
    borderColor: MODAL_CTA_COLOR_BORDER,
    shadowColor: MODAL_CTA_COLOR,
    shadowOpacity: 0.38,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  localTourBackdropMask: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  localTourSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  localTourDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  sampleStickyNote: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 14,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 15,
    paddingBottom: 11,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(2,33,61,0.14)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
    overflow: 'hidden',
  },
  sampleStickyNoteDarkModeLightBox: {
    backgroundColor: DARK_MODE_TOUR_TOOLTIP_BG,
    borderColor: 'rgba(137,206,255,0.34)',
    shadowColor: '#00111F',
    shadowOpacity: 0.34,
  },
  sampleCardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#4EAFF4',
  },
  sampleStickyTitle: {
    marginBottom: 6,
    color: '#1E293B',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900',
    letterSpacing: -0.1,
  },
  sampleStickyTitleDarkMode: {
    color: DARK_MODE_TOUR_TOOLTIP_TEXT,
  },
  sampleSentenceRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,41,59,0.10)',
    paddingVertical: 6,
  },
  sampleSentenceRowLast: {
    borderBottomWidth: 0,
  },
  sampleSentenceRowDarkMode: {
    borderBottomColor: 'rgba(191,231,255,0.14)',
  },
  sampleSentenceText: {
    flex: 1,
    color: '#1E293B',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
  },
  sampleSentenceTextDarkMode: {
    color: DARK_MODE_TOUR_TOOLTIP_TEXT,
  },
  sampleCopyBtn: {
    minWidth: 58,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
  },
  sampleCopyBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  sampleCopyText: {
    color: TEXT_ON_CTA,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '800',
  },
  localTourTooltip: {
    position: 'absolute',
    width: 260,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 15,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(2,33,61,0.14)',
    borderLeftWidth: 4,
    borderLeftColor: '#4EAFF4',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  localTourTooltipText: {
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    letterSpacing: -0.15,
  },
  localTourTooltipDarkModeLightBox: {
    backgroundColor: DARK_MODE_TOUR_TOOLTIP_BG,
    borderColor: 'rgba(137,206,255,0.34)',
    borderLeftColor: '#4EAFF4',
    shadowColor: '#00111F',
    shadowOpacity: 0.34,
  },
  localTourTooltipTextDarkModeLightBox: {
    color: DARK_MODE_TOUR_TOOLTIP_TEXT,
  },
  localTourClone: {
    position: 'absolute',
    borderRadius: BUTTON_TOKENS.radius.lg,
    borderWidth: 1,
    shadowColor: '#00E5FF',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    overflow: 'hidden',
  },
  localTourCloneContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  actionBtnPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
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
