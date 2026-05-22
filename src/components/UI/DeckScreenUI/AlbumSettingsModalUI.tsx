import React from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import {
  MODAL_CTA_COLOR,
  MODAL_CTA_COLOR_BORDER,
  SCREEN_BG,
  TEXT_ON_CTA,
  resolveThemeColors,
} from '../../../theme/colors';

type Props = {
  visible: boolean;
  settingsName: string;
  settingsEmoji: string;
  settingsColor: string;
  hasCoverImage: boolean;
  coverImageUri?: string;
  onSelectCoverTab: (tab: 'classic' | 'image') => void;
  onChangeName: (name: string) => void;
  onChangeEmoji: (emoji: string) => void;
  onChangeColor: (color: string) => void;
  onPickCoverImage: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDidClose?: () => void;
  children?: React.ReactNode;
};

const EMOJI_OPTIONS = ['✨', '🔖', '❤️', '🕒', '📁', '💬', '🎬', '💼'];
const COVER_COLOR_OPTIONS = [
  { value: '#E45757' },
  { value: '#9A63CC' },
  { value: '#E8C24A' },
  { value: '#E39A34' },
  { value: '#D86A8A' },
  { value: '#4EAFF4' },
  { value: '#32B8A2' },
  { value: '#5BC0EB' },
  { value: '#F97316' },
  { value: '#1E293B' },
];

const MODAL_ENTRY_TRANSLATE_Y = 420;
const MODAL_ENTRY_DURATION_MS = 360;
const MODAL_BACKDROP_DURATION_MS = 240;
const MODAL_EXIT_DURATION_MS = 220;

export default function AlbumSettingsModalUI({
  visible,
  settingsName,
  settingsEmoji,
  settingsColor,
  hasCoverImage,
  coverImageUri,
  onSelectCoverTab,
  onChangeName,
  onChangeEmoji,
  onChangeColor,
  onPickCoverImage,
  onCancel,
  onSave,
  onDidClose,
  children,
}: Props) {
  const colorScheme = useColorScheme();
  const { width: screenWidth } = useWindowDimensions();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const isLight = colorScheme === 'light';
  const [shouldRender, setShouldRender] = React.useState(visible);
  const [coverTab, setCoverTab] = React.useState<'classic' | 'image'>(hasCoverImage ? 'image' : 'classic');
  const [tabContentWidth, setTabContentWidth] = React.useState(0);
  const entranceY = React.useRef(new Animated.Value(MODAL_ENTRY_TRANSLATE_Y)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;
  const tabSlideProgress = React.useRef(new Animated.Value(hasCoverImage ? 1 : 0)).current;
  const onDidCloseRef = React.useRef(onDidClose);

  React.useEffect(() => {
    if (!visible) return;
    const nextTab = hasCoverImage ? 'image' : 'classic';
    setCoverTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [hasCoverImage, visible]);

  React.useEffect(() => {
    onDidCloseRef.current = onDidClose;
  }, [onDidClose]);

  React.useEffect(() => {
    Animated.timing(tabSlideProgress, {
      toValue: coverTab === 'image' ? 1 : 0,
      duration: 260,
      easing: Easing.bezier(0.22, 0.86, 0.26, 1),
      useNativeDriver: true,
    }).start();
  }, [coverTab, tabSlideProgress]);

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
    ]).start(({ finished }) => {
      if (!finished) return;
      setShouldRender(false);
      onDidCloseRef.current?.();
    });
  }, [backdropOpacity, entranceY, shouldRender, visible]);

  const handleSelectTab = React.useCallback(
    (tab: 'classic' | 'image') => {
      setCoverTab((prev) => (prev === tab ? prev : tab));
      onSelectCoverTab(tab);
    },
    [onSelectCoverTab]
  );

  if (!shouldRender) return null;

  const panelWidth = Math.max(tabContentWidth, 1);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onCancel}>
      <Pressable style={styles.rootPressable} onPress={onCancel}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        <Animated.View style={[styles.sheetWrap, { transform: [{ translateY: entranceY }] }]}>
          <Pressable
            style={[styles.sheet, { backgroundColor: palette.modalBg, borderColor: palette.modalOptionBorder }]}
            onPress={() => undefined}
          >
            <View style={[styles.handle, { backgroundColor: palette.secondaryText }]} />
            <Text style={[styles.eyebrow, { color: palette.secondaryText }]}>ALBUM SETTINGS</Text>

            <View style={styles.settingsList}>
              <View style={styles.settingsRowBlock}>
                <Text style={[styles.sectionLabel, { color: palette.textOnContainer }]}>Album name</Text>
                <TextInput
                  value={settingsName}
                  onChangeText={onChangeName}
                  style={[
                    styles.input,
                    {
                      backgroundColor: palette.modalOptionBg,
                      borderColor: palette.modalOptionBorder,
                      color: palette.textOnContainer,
                    },
                  ]}
                  placeholder="Type album name"
                  placeholderTextColor={palette.secondaryText}
                />
              </View>

              <View style={[styles.settingsDivider, { backgroundColor: palette.modalOptionBorder }]} />

              <View style={styles.settingsRowBlock}>
                <View
                  style={[
                    styles.tabShell,
                    {
                      backgroundColor: isLight ? palette.containerBg : palette.modalOptionBg,
                      borderColor: palette.modalOptionBorder,
                    },
                  ]}
                >
                  {(['classic', 'image'] as const).map((tab) => {
                    const active = coverTab === tab;
                    return (
                      <Pressable
                        key={tab}
                        style={({ pressed }) => [
                          styles.tabButton,
                          active
                            ? styles.tabButtonActive
                            : {
                                backgroundColor: 'transparent',
                                borderColor: 'transparent',
                              },
                          pressed ? styles.pressableMediumPressed : null,
                        ]}
                        onPress={() => handleSelectTab(tab)}
                      >
                        <Text
                          style={[
                            styles.tabButtonText,
                            { color: active ? TEXT_ON_CTA : palette.textOnContainer },
                          ]}
                        >
                          {tab === 'classic' ? 'Classic' : 'Image'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.settingsDivider, { backgroundColor: palette.modalOptionBorder }]} />

              <View
                style={styles.tabContentViewport}
                onLayout={(event) => {
                  const nextWidth = event.nativeEvent.layout.width;
                  setTabContentWidth((prev) => (prev === nextWidth ? prev : nextWidth));
                }}
              >
                <Animated.View
                  style={[
                    styles.tabContentSlider,
                    {
                      width: Math.max(panelWidth * 2, screenWidth),
                      transform: [
                        {
                          translateX: tabSlideProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -panelWidth],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={[styles.tabPanel, { width: panelWidth }]}>
                    <View style={styles.settingsRowBlock}>
                      <Text style={[styles.sectionLabel, { color: palette.textOnContainer }]}>Icon</Text>
                      <View style={styles.optionRow}>
                        {EMOJI_OPTIONS.map((emoji) => (
                          <Pressable
                            key={emoji}
                            style={({ pressed }) => [
                              styles.emojiOption,
                              { backgroundColor: palette.modalOptionBg, borderColor: palette.modalOptionBorder },
                              settingsEmoji === emoji && styles.emojiOptionActive,
                              pressed ? styles.pressableIconPressed : null,
                            ]}
                            onPress={() => onChangeEmoji(emoji)}
                          >
                            <Text style={styles.emojiOptionText}>{emoji}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    <View style={[styles.settingsDivider, { backgroundColor: palette.modalOptionBorder }]} />

                    <View style={styles.settingsRowBlock}>
                      <Text style={[styles.sectionLabel, { color: palette.textOnContainer }]}>Cover color</Text>
                      <View style={styles.colorGrid}>
                        {COVER_COLOR_OPTIONS.map((option) => {
                          const active = settingsColor === option.value;
                          return (
                            <Pressable
                              key={option.value}
                              style={({ pressed }) => [
                                styles.colorOptionRow,
                                active ? styles.colorOptionRowActive : null,
                                pressed ? styles.pressableIconPressed : null,
                              ]}
                              onPress={() => onChangeColor(option.value)}
                            >
                              <View
                                style={[
                                  styles.colorSwatch,
                                  { backgroundColor: option.value },
                                  active ? styles.colorSwatchActive : null,
                                ]}
                              />
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>

                  <View style={[styles.tabPanel, styles.imagePanel, { width: panelWidth }]}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.coverUploadTile,
                        { backgroundColor: palette.modalOptionBg, borderColor: palette.modalOptionBorder },
                        pressed ? styles.coverUploadTilePressed : null,
                      ]}
                      onPress={onPickCoverImage}
                    >
                      {coverImageUri ? (
                        <>
                          <View pointerEvents="none" style={styles.coverPreviewImageWrap}>
                            <Image
                              key={coverImageUri}
                              source={{ uri: coverImageUri }}
                              style={styles.coverPreviewImage}
                              resizeMode="cover"
                            />
                          </View>
                          <View pointerEvents="none" style={styles.coverEditOverlay}>
                            <View style={[styles.coverPlusCircle, styles.coverEditCircle, { backgroundColor: MODAL_CTA_COLOR }]}>
                              <Text style={styles.coverEditText}>+</Text>
                            </View>
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={[styles.coverBlurLine, styles.coverBlurLineOne]} />
                          <View style={[styles.coverBlurLine, styles.coverBlurLineTwo]} />
                          <View style={[styles.coverBlurLine, styles.coverBlurLineThree]} />
                          <View style={[styles.coverPlusCircle, { backgroundColor: MODAL_CTA_COLOR }]}>
                            <Text style={styles.coverPlusText}>+</Text>
                          </View>
                        </>
                      )}
                    </Pressable>
                  </View>
                </Animated.View>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.cancelButton,
                  { backgroundColor: palette.modalOptionBg, borderColor: palette.modalOptionBorder },
                  pressed ? styles.pressablePrimaryPressed : null,
                ]}
                onPress={onCancel}
              >
                <Text style={[styles.cancelText, { color: palette.textOnContainer }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.saveButton, pressed ? styles.pressablePrimaryPressed : null]}
                onPress={onSave}
              >
                <Text style={styles.saveText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
        {children}
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
  settingsList: {
    gap: 0,
  },
  settingsRowBlock: {
    paddingHorizontal: 4,
    paddingVertical: 14,
    gap: 10,
  },
  tabShell: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
    gap: 6,
  },
  tabButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  settingsDivider: {
    height: 1,
    marginHorizontal: 4,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  tabContentViewport: {
    height: 250,
    overflow: 'hidden',
  },
  tabContentSlider: {
    height: '100%',
    flexDirection: 'row',
  },
  tabPanel: {
    height: '100%',
  },
  imagePanel: {
    paddingHorizontal: 4,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  emojiOption: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(15,23,42,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiOptionActive: {
    borderColor: MODAL_CTA_COLOR_BORDER,
    backgroundColor: 'rgba(78,175,244,0.16)',
  },
  emojiOptionText: {
    fontSize: 19,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    columnGap: 0,
  },
  colorOptionRow: {
    width: '20%',
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOptionRowActive: {
    transform: [{ scale: 1.08 }],
  },
  colorSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  colorSwatchActive: {
    borderWidth: 2,
    borderColor: MODAL_CTA_COLOR_BORDER,
  },
  coverUploadTile: {
    width: 196,
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverUploadTilePressed: {
    opacity: 0.96,
    transform: [{ scale: 0.99 }],
  },
  coverPreviewImage: {
    width: '100%',
    height: '100%',
  },
  coverPreviewImageWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  coverEditOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.18)',
  },
  coverBlurLine: {
    position: 'absolute',
    left: 30,
    right: 30,
    height: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(78,175,244,0.16)',
  },
  coverBlurLineOne: {
    top: 62,
    opacity: 0.52,
  },
  coverBlurLineTwo: {
    top: 92,
    opacity: 0.34,
  },
  coverBlurLineThree: {
    top: 122,
    opacity: 0.22,
  },
  coverPlusCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: MODAL_CTA_COLOR,
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  coverEditCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  coverPlusText: {
    color: TEXT_ON_CTA,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    marginTop: -2,
  },
  coverEditText: {
    color: TEXT_ON_CTA,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '700',
    marginTop: -2,
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
    minHeight: BUTTON_TOKENS.height.prominent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
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
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  saveText: {
    color: TEXT_ON_CTA,
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  pressablePrimaryPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  pressableMediumPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  pressableIconPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
});
