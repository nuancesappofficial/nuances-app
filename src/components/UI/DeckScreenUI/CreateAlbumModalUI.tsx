import React from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
  type EmitterSubscription,
} from 'react-native';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import {
  CONTAINER_BG,
  MODAL_CTA_COLOR,
  MODAL_CTA_COLOR_BORDER,
  SCREEN_BG,
  TEXT_ON_BG,
  TEXT_ON_CONTAINER,
  TEXT_ON_CTA,
  resolveThemeColors,
} from '../../../theme/colors';

type Props = {
  visible: boolean;
  albumName: string;
  onChangeAlbumName: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const MODAL_ENTRY_TRANSLATE_Y = 420;
const MODAL_ENTRY_DURATION_MS = 360;
const MODAL_BACKDROP_DURATION_MS = 240;
const MODAL_EXIT_DURATION_MS = 220;
const SHEET_TOP_SAFE_MARGIN = 72;
const KEYBOARD_EXTRA_GAP = 8;

export default function CreateAlbumModalUI({
  visible,
  albumName,
  onChangeAlbumName,
  onCancel,
  onConfirm,
}: Props) {
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const { height: windowHeight } = useWindowDimensions();
  const [shouldRender, setShouldRender] = React.useState(visible);
  const [sheetHeight, setSheetHeight] = React.useState(0);
  const entranceY = React.useRef(new Animated.Value(MODAL_ENTRY_TRANSLATE_Y)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;
  const keyboardLift = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      setShouldRender(true);
      entranceY.setValue(MODAL_ENTRY_TRANSLATE_Y);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(entranceY, {
          toValue: 0,
          duration: MODAL_ENTRY_DURATION_MS,
          easing: Easing.bezier(0.3, 0.2, 0.4, 1),
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
    });
  }, [backdropOpacity, entranceY, keyboardLift, shouldRender, visible]);

  React.useEffect(() => {
    if (!visible) return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: any) => {
      const kbHeight = Math.max(0, event?.endCoordinates?.height ?? 0);
      const requestedLift = kbHeight + KEYBOARD_EXTRA_GAP;
      const maxAllowedLift = Math.max(0, windowHeight - Math.max(sheetHeight, 320) - SHEET_TOP_SAFE_MARGIN);
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
    <Modal visible transparent animationType="none" onRequestClose={onCancel}>
      <Pressable style={styles.rootPressable} onPress={onCancel}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        <Animated.View style={[styles.sheetWrap, { transform: [{ translateY: sheetTransform }] }]}>
          <Pressable
            style={[styles.sheet, { backgroundColor: palette.modalBg, borderColor: palette.modalOptionBorder }]}
            onLayout={(event) => {
              const nextHeight = Math.round(event.nativeEvent.layout.height);
              setSheetHeight((prev) => (prev === nextHeight ? prev : nextHeight));
            }}
            onPress={() => undefined}
          >
            <View style={[styles.handle, { backgroundColor: palette.secondaryText }]} />

            <Text style={[styles.eyebrow, { color: palette.secondaryText }]}>NEW ALBUM</Text>
            <Text style={[styles.title, { color: palette.textOnContainer }]}>Album name</Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: palette.modalOptionBorder,
                  color: palette.textOnContainer,
                },
              ]}
              value={albumName}
              onChangeText={onChangeAlbumName}
              autoFocus
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[
                  styles.cancelButton,
                  { backgroundColor: palette.containerBg, borderColor: palette.modalOptionBorder },
                ]}
                onPress={onCancel}
                activeOpacity={0.9}
              >
                <Text style={[styles.cancelText, { color: palette.textOnContainer }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.confirmButton} onPress={onConfirm} activeOpacity={0.9}>
                <Text style={styles.confirmText}>Create</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rootPressable: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: SCREEN_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 22,
    gap: 14,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#4B5563',
    alignSelf: 'center',
    marginBottom: 4,
  },
  eyebrow: {
    color: '#8D93A1',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  title: {
    color: TEXT_ON_BG,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#B4BBC8',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: CONTAINER_BG,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: TEXT_ON_CONTAINER,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    borderRadius: BUTTON_TOKENS.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: CONTAINER_BG,
    minHeight: BUTTON_TOKENS.height.prominent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    flex: 1,
    borderRadius: BUTTON_TOKENS.radius.lg,
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
    minHeight: BUTTON_TOKENS.height.prominent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: TEXT_ON_BG,
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  confirmText: {
    color: TEXT_ON_CTA,
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
});
