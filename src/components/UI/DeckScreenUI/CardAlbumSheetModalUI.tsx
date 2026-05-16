import React from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import {
  CONTAINER_BG,
  MODAL_CTA_COLOR,
  MODAL_CTA_COLOR_BORDER,
  SCREEN_BG,
  TEXT_ON_BG,
  TEXT_ON_CTA,
  TEXT_ON_CONTAINER,
  resolveThemeColors,
} from '../../../theme/colors';

type AlbumOption = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  wordCount: number;
};

type Props = {
  visible: boolean;
  displayWord: string;
  partOfSpeech?: string;
  selectedAlbums: string[];
  allAlbums: AlbumOption[];
  onClose: () => void;
  onDone: () => void;
  onOpenCreateAlbum: () => void;
  onToggleAlbum: (albumId: string) => void;
};

export default function CardAlbumSheetModalUI({
  visible,
  displayWord,
  partOfSpeech,
  selectedAlbums,
  allAlbums,
  onClose,
  onDone,
  onOpenCreateAlbum,
  onToggleAlbum,
}: Props) {
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const sheetAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!visible) return;
    sheetAnim.setValue(0);
    Animated.spring(sheetAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 240,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [sheetAnim, visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: palette.screenBg,
              borderColor: palette.modalOptionBorder,
              opacity: sheetAnim,
              transform: [
                {
                  scale: sheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable onPress={() => {}}>
        <View style={[styles.sheetHandle, { backgroundColor: palette.secondaryText }]} />

        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: palette.textOnBg }]}>Add to Album</Text>
          <Pressable
            onPress={onDone}
            style={({ pressed }) => (pressed ? styles.headerTextBtnPressed : null)}
          >
            <Text style={[styles.sheetDone, { color: palette.textOnBg }]}>Done</Text>
          </Pressable>
        </View>

        <View style={[styles.sheetCardPreview, { backgroundColor: palette.containerBg, borderColor: palette.modalOptionBorder }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sheetCardWord, { color: palette.textOnContainer }]}>{displayWord}</Text>
            <Text style={[styles.sheetCardPos, { color: palette.secondaryText }]}>{partOfSpeech || 'unknown'}</Text>
          </View>
          {selectedAlbums.length > 0 ? (
            <View style={styles.sheetCountBadge}>
              <Text style={styles.sheetCountText}>
                {selectedAlbums.length} album{selectedAlbums.length > 1 ? 's' : ''}
              </Text>
            </View>
          ) : null}
        </View>

        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.sheetScrollContent}>
          <Pressable
            style={({ pressed }) => [styles.createAlbumBtn, pressed ? styles.primaryBtnPressed : null]}
            onPress={onOpenCreateAlbum}
          >
            <Text style={styles.createAlbumIcon}>➕</Text>
            <Text style={styles.createAlbumText}>Create New Album</Text>
          </Pressable>

          {allAlbums.map((album) => {
            const isSelected = selectedAlbums.includes(album.id);
            return (
              <Pressable
                key={album.id}
                style={({ pressed }) => [
                  styles.albumRow,
                  { backgroundColor: palette.containerBg, borderColor: palette.modalOptionBorder },
                  isSelected && styles.albumRowSelected,
                  pressed ? styles.albumRowPressed : null,
                ]}
                onPress={() => onToggleAlbum(album.id)}
              >
                <View style={[styles.albumEmojiWrap, { backgroundColor: palette.mutedSurface }]}>
                  <Text style={styles.albumEmoji}>{album.emoji}</Text>
                </View>
                <View style={styles.albumTextWrap}>
                  <Text style={[styles.albumNameText, { color: palette.textOnContainer }]}>{album.name}</Text>
                  <Text style={[styles.albumCountText, { color: palette.secondaryText }]}>{album.wordCount} cards</Text>
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
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheetContainer: {
    backgroundColor: SCREEN_BG,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#4B5563',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 24, fontWeight: '800', color: TEXT_ON_BG },
  sheetDone: { color: TEXT_ON_BG, fontSize: BUTTON_TOKENS.text.strong, fontWeight: BUTTON_TOKENS.weight.regular },
  headerTextBtnPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  sheetCardPreview: {
    backgroundColor: CONTAINER_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetCardWord: { fontSize: 17, fontWeight: '700', color: TEXT_ON_CONTAINER },
  sheetCardPos: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  sheetCountBadge: {
    backgroundColor: MODAL_CTA_COLOR,
    borderColor: MODAL_CTA_COLOR_BORDER,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sheetCountText: { color: TEXT_ON_CTA, fontSize: 12, fontWeight: '700' },
  sheetScrollContent: { paddingBottom: 10, gap: 8 },
  createAlbumBtn: {
    borderRadius: BUTTON_TOKENS.radius.md,
    minHeight: BUTTON_TOKENS.height.regular,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: MODAL_CTA_COLOR,
    borderWidth: 1,
    borderColor: MODAL_CTA_COLOR_BORDER,
  },
  createAlbumIcon: { color: TEXT_ON_CTA, fontSize: 18 },
  createAlbumText: { color: TEXT_ON_CTA, fontSize: BUTTON_TOKENS.text.strong, fontWeight: BUTTON_TOKENS.weight.regular },
  primaryBtnPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  albumRow: {
    borderRadius: BUTTON_TOKENS.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: CONTAINER_BG,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  albumRowSelected: {
    borderColor: MODAL_CTA_COLOR_BORDER,
    backgroundColor: 'rgba(78,175,244,0.16)',
  },
  albumRowPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  albumEmojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  albumEmoji: { fontSize: 24 },
  albumTextWrap: { flex: 1 },
  albumNameText: { fontSize: 16, color: TEXT_ON_CONTAINER, fontWeight: '600' },
  albumCountText: { marginTop: 2, fontSize: 12, color: '#94A3B8', fontWeight: '500' },
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
  albumCheckText: { color: TEXT_ON_CTA, fontSize: 16, fontWeight: '800' },
});
