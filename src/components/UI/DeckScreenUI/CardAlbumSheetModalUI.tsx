import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { tUI } from '../../../i18n/uiLanguage';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import FolderIcon from './FolderIcon';
import {
  MODAL_CTA_COLOR,
  MODAL_CTA_COLOR_BORDER,
  SCREEN_BG,
  TEXT_ON_CTA,
  TEXT_ON_CONTAINER,
  resolveThemeColors,
} from '../../../theme/colors';
import type { UILanguage } from '../../../services/settings/userSettings';
import { getDeckAlbumDisplayName } from '../../../features/deck/albums';

type AlbumOption = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  wordCount: number;
  latestCards?: Array<{
    imageUrl?: string;
    cardTypeText: string;
    previewText?: string;
  }>;
  coverImageUri?: string;
  isNameCustomized?: boolean;
};

type Props = {
  visible: boolean;
  selectedAlbums: string[];
  allAlbums: AlbumOption[];
  uiLanguage: UILanguage;
  onDone: () => void;
  onOpenCreateAlbum: () => void;
  onToggleAlbum: (albumId: string) => void;
  createAlbumVisible: boolean;
  createAlbumName: string;
  onChangeCreateAlbumName: (value: string) => void;
  onCancelCreateAlbum: () => void;
  onConfirmCreateAlbum: () => void;
};

const SHEET_ENTRY_Y = 520;
const SHEET_ENTRY_DURATION_MS = 300;
const SHEET_EXIT_DURATION_MS = 180;
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 1.1;
const MAX_VISIBLE_ALBUM_ROWS = 4;
const ALBUM_ROW_HEIGHT = 86;
const ALBUM_ROW_GAP = 8;
const ALBUM_LIST_TOP_PADDING = 4;

export default function CardAlbumSheetModalUI({
  visible,
  selectedAlbums,
  allAlbums,
  uiLanguage,
  onDone,
  onOpenCreateAlbum,
  onToggleAlbum,
  createAlbumVisible,
  createAlbumName,
  onChangeCreateAlbumName,
  onCancelCreateAlbum,
  onConfirmCreateAlbum,
}: Props) {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const palette = React.useMemo(
    () => resolveThemeColors(colorScheme),
    [colorScheme]
  );
  const [shouldRender, setShouldRender] = React.useState(visible);
  const entranceY = React.useRef(new Animated.Value(SHEET_ENTRY_Y)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;
  const dismissalRequestedRef = React.useRef(false);
  const visibleAlbumRowCount = Math.min(
    allAlbums.length,
    MAX_VISIBLE_ALBUM_ROWS
  );
  const albumListHeight =
    visibleAlbumRowCount * ALBUM_ROW_HEIGHT +
    Math.max(0, visibleAlbumRowCount - 1) * ALBUM_ROW_GAP +
    ALBUM_LIST_TOP_PADDING;

  const requestComplete = React.useCallback(() => {
    if (dismissalRequestedRef.current) return;
    dismissalRequestedRef.current = true;
    onDone();
  }, [onDone]);

  const handleRequestClose = React.useCallback(() => {
    if (createAlbumVisible) {
      onCancelCreateAlbum();
      return;
    }
    requestComplete();
  }, [createAlbumVisible, onCancelCreateAlbum, requestComplete]);

  React.useEffect(() => {
    if (visible) {
      dismissalRequestedRef.current = false;
      setShouldRender(true);
      entranceY.setValue(SHEET_ENTRY_Y);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(entranceY, {
          toValue: 0,
          duration: SHEET_ENTRY_DURATION_MS,
          easing: Easing.bezier(0.3, 0.2, 0.4, 1),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!shouldRender) return;
    Animated.parallel([
      Animated.timing(entranceY, {
        toValue: SHEET_ENTRY_Y,
        duration: SHEET_EXIT_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: SHEET_EXIT_DURATION_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setShouldRender(false);
    });
  }, [backdropOpacity, entranceY, shouldRender, visible]);

  const dragResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          const nextY = Math.max(0, gesture.dy);
          entranceY.setValue(nextY);
          backdropOpacity.setValue(Math.max(0.18, 1 - nextY / SHEET_ENTRY_Y));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (
            gesture.dy >= DISMISS_DISTANCE ||
            gesture.vy >= DISMISS_VELOCITY
          ) {
            requestComplete();
            return;
          }
          Animated.parallel([
            Animated.spring(entranceY, {
              toValue: 0,
              damping: 22,
              stiffness: 240,
              mass: 0.9,
              useNativeDriver: true,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 1,
              duration: 180,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]).start();
        },
        onPanResponderTerminate: () => {
          Animated.parallel([
            Animated.spring(entranceY, {
              toValue: 0,
              damping: 22,
              stiffness: 240,
              mass: 0.9,
              useNativeDriver: true,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 1,
              duration: 180,
              useNativeDriver: true,
            }),
          ]).start();
        },
      }),
    [backdropOpacity, entranceY, requestComplete]
  );

  return (
    <Modal
      visible={shouldRender}
      transparent
      animationType="none"
      onRequestClose={handleRequestClose}
    >
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={requestComplete}
          accessibilityRole="button"
          accessibilityLabel={tUI(uiLanguage, 'albumSheet.done')}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.backdrop, { opacity: backdropOpacity }]}
          />
        </Pressable>

        <Animated.View
          style={[
            styles.sheetWrap,
            {
              transform: [{ translateY: entranceY }],
            },
          ]}
        >
          <View
            style={[
              styles.sheetContainer,
              {
                backgroundColor: isDarkMode ? palette.modalBg : '#F3EFE9',
                borderColor: isDarkMode
                  ? palette.modalOptionBorder
                  : '#E2DDD6',
                maxHeight: Math.round(windowHeight * 0.84),
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <View
              style={styles.dragArea}
              {...dragResponder.panHandlers}
              accessibilityRole="adjustable"
            >
              <View
                style={[
                      styles.sheetHandle,
                      {
                        backgroundColor: isDarkMode
                          ? palette.secondaryText
                          : '#9AA7B8',
                      },
                ]}
              />
              <View style={styles.sheetHeader}>
                <Text
                  style={[
                    styles.sheetTitle,
                    { color: palette.textOnContainer },
                  ]}
                >
                  {tUI(uiLanguage, 'albumSheet.addToAlbum')}
                </Text>
                <Pressable
                  onPress={onOpenCreateAlbum}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.createAlbumBtn,
                    pressed ? styles.createAlbumBtnPressed : null,
                  ]}
                >
                  <Text style={styles.createAlbumText}>
                    {tUI(uiLanguage, 'albumSheet.createNewAlbum')}
                  </Text>
                </Pressable>
              </View>
            </View>

            <ScrollView
              style={[
                styles.sheetScroll,
                { height: albumListHeight },
              ]}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
              scrollEnabled
              alwaysBounceVertical
              bounces
            >
              {allAlbums.map((album) => {
                const isSelected = selectedAlbums.includes(album.id);
                const displayAlbumName = getDeckAlbumDisplayName(
                  album,
                  uiLanguage
                );
                return (
                  <Pressable
                    key={album.id}
                    style={({ pressed }) => [
                      styles.albumRow,
                      {
                        backgroundColor: isDarkMode
                          ? palette.containerBg
                          : '#FFFFFF',
                        borderColor: isDarkMode
                          ? palette.modalOptionBorder
                          : '#E2DDD6',
                      },
                      isSelected && [
                        styles.albumRowSelected,
                        !isDarkMode && styles.albumRowSelectedLight,
                      ],
                      pressed ? styles.albumRowPressed : null,
                    ]}
                    onPress={() => onToggleAlbum(album.id)}
                  >
                    <View
                      style={[
                        styles.albumFolderPreview,
                        {
                          backgroundColor: isDarkMode
                            ? palette.modalOptionBg
                            : '#F7F4F0',
                        },
                      ]}
                    >
                      <FolderIcon
                        title={displayAlbumName}
                        wordCount={album.wordCount}
                        latestCards={album.latestCards || []}
                        iconEmoji={album.emoji}
                        coverColor={album.color}
                        coverImageUri={album.coverImageUri}
                        compact
                        thumbnail
                        style={styles.albumFolderIcon}
                      />
                    </View>
                    <View style={styles.albumTextWrap}>
                      <Text
                        style={[
                          styles.albumNameText,
                          { color: palette.textOnContainer },
                        ]}
                        numberOfLines={1}
                      >
                        {displayAlbumName}
                      </Text>
                      <Text
                        style={[
                          styles.albumCountText,
                          { color: palette.secondaryText },
                        ]}
                      >
                        {album.wordCount}{' '}
                        {tUI(uiLanguage, 'albumSheet.cardCountSuffix')}
                      </Text>
                    </View>
                    {isSelected ? (
                      <View style={styles.albumCheckWrap}>
                        <Text style={styles.albumCheckText}>✓</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Animated.View>

        {createAlbumVisible ? (
          <KeyboardAvoidingView
            style={styles.createOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={onCancelCreateAlbum}
            >
              <View style={styles.createOverlayBackdrop} />
            </Pressable>
            <View
              style={[
              styles.createSheet,
              {
                  backgroundColor: isDarkMode
                    ? palette.modalBg
                    : '#F3EFE9',
                  borderColor: isDarkMode
                    ? palette.modalOptionBorder
                    : '#E2DDD6',
                },
              ]}
            >
              <View
                style={[
                styles.createHandle,
                  {
                    backgroundColor: isDarkMode
                      ? palette.secondaryText
                      : '#9AA7B8',
                  },
                ]}
              />
              <Text
                style={[
                  styles.createEyebrow,
                  { color: palette.secondaryText },
                ]}
              >
                {tUI(uiLanguage, 'create.albumSettingsTitle')}
              </Text>
              <Text
                style={[
                  styles.createTitle,
                  { color: palette.textOnContainer },
                ]}
              >
                {tUI(uiLanguage, 'create.albumNameTitle')}
              </Text>
              <TextInput
                style={[
                  styles.createInput,
                  {
                    backgroundColor: isDarkMode
                      ? palette.containerBg
                      : '#FFFFFF',
                    borderColor: isDarkMode
                      ? palette.modalOptionBorder
                      : '#E2DDD6',
                    color: palette.textOnContainer,
                  },
                ]}
                value={createAlbumName}
                onChangeText={onChangeCreateAlbumName}
                autoFocus
              />
              <View style={styles.createButtonRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.createCancelButton,
                    {
                      backgroundColor: isDarkMode
                        ? palette.containerBg
                        : '#FFFFFF',
                      borderColor: isDarkMode
                        ? palette.modalOptionBorder
                        : '#E2DDD6',
                    },
                    pressed ? styles.createActionPressed : null,
                  ]}
                  onPress={onCancelCreateAlbum}
                >
                  <Text
                    style={[
                      styles.createCancelText,
                      { color: palette.textOnContainer },
                    ]}
                  >
                    {tUI(uiLanguage, 'create.albumCancel')}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.createConfirmButton,
                    pressed ? styles.createActionPressed : null,
                  ]}
                  onPress={onConfirmCreateAlbum}
                >
                  <Text style={styles.createConfirmText}>
                    {tUI(uiLanguage, 'create.albumCreate')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetWrap: {
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: SCREEN_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 0,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 18,
  },
  dragArea: {
    paddingTop: 10,
    paddingBottom: 8,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
  },
  createAlbumBtn: {
    minHeight: 34,
    maxWidth: '44%',
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createAlbumBtnPressed: {
    opacity: 0.62,
  },
  createAlbumText: {
    color: MODAL_CTA_COLOR,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: BUTTON_TOKENS.weight.regular,
    textAlign: 'right',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    paddingTop: 4,
    paddingBottom: 0,
    gap: 8,
  },
  albumRow: {
    borderRadius: BUTTON_TOKENS.radius.md,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    height: ALBUM_ROW_HEIGHT,
  },
  albumRowSelected: {
    borderColor: MODAL_CTA_COLOR_BORDER,
    backgroundColor: 'rgba(78,175,244,0.16)',
  },
  albumRowSelectedLight: {
    borderColor: '#85C7EF',
    backgroundColor: '#EAF5FC',
  },
  albumRowPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  albumFolderPreview: {
    width: 52,
    height: 52,
    marginRight: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  albumFolderIcon: {
    width: 42,
  },
  albumTextWrap: {
    flex: 1,
  },
  albumNameText: {
    fontSize: 16,
    color: TEXT_ON_CONTAINER,
    fontWeight: '600',
  },
  albumCountText: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
  },
  albumCheckWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumCheckText: {
    color: TEXT_ON_CTA,
    fontSize: 16,
    fontWeight: '800',
  },
  createOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    justifyContent: 'flex-end',
  },
  createOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  createSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 22,
    gap: 14,
  },
  createHandle: {
    width: 40,
    height: 5,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 4,
  },
  createEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  createTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  createInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  createButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  createCancelButton: {
    flex: 1,
    borderRadius: BUTTON_TOKENS.radius.lg,
    borderWidth: 1,
    minHeight: BUTTON_TOKENS.height.prominent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createConfirmButton: {
    flex: 1,
    borderRadius: BUTTON_TOKENS.radius.lg,
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
    minHeight: BUTTON_TOKENS.height.prominent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createCancelText: {
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  createConfirmText: {
    color: TEXT_ON_CTA,
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  createActionPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
});
