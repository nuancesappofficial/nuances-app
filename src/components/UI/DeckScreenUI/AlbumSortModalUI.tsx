import React from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, useColorScheme } from 'react-native';
import { tUI } from '../../../i18n/uiLanguage';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import { TEXT_ON_CTA, CTA_COLOR, CTA_COLOR_BORDER, resolveThemeColors } from '../../../theme/colors';
import type { UILanguage } from '../../../services/settings/userSettings';
import type { AlbumSortMode } from '../../../features/deck/albumSortPreferences';

type Props = {
  visible: boolean;
  sortMode: AlbumSortMode;
  uiLanguage: UILanguage;
  onClose: () => void;
  onChangeSortMode: (mode: AlbumSortMode) => void;
};

const MODAL_ENTRY_TRANSLATE_Y = 420;
const MODAL_ENTRY_DURATION_MS = 360;
const MODAL_BACKDROP_DURATION_MS = 240;
const MODAL_EXIT_DURATION_MS = 220;

export default function AlbumSortModalUI({
  visible,
  sortMode,
  uiLanguage,
  onClose,
  onChangeSortMode,
}: Props) {
  const colorScheme = useColorScheme();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const [shouldRender, setShouldRender] = React.useState(visible);
  const entranceY = React.useRef(new Animated.Value(MODAL_ENTRY_TRANSLATE_Y)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;

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
    });
  }, [backdropOpacity, entranceY, shouldRender, visible]);

  if (!shouldRender) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.rootPressable} onPress={onClose}>
        <Animated.View style={[styles.sortModalOverlay, { opacity: backdropOpacity }]} />
        <Animated.View style={[styles.sheetWrap, { transform: [{ translateY: entranceY }] }]}>
          <Pressable style={[styles.sortModalCard, { backgroundColor: palette.modalBg }]} onPress={() => undefined}>
          <Text style={[styles.sortModalTitle, { color: palette.textOnContainer }]}>{tUI(uiLanguage, 'sort.title')}</Text>

          <Pressable
            style={({ pressed }) => [
              styles.sortOptionBtn,
              { backgroundColor: palette.modalOptionBg, borderColor: palette.modalOptionBorder },
              sortMode === 'recently_added' && styles.sortOptionBtnActive,
              pressed ? styles.sortOptionBtnPressed : null,
            ]}
            onPress={() => onChangeSortMode('recently_added')}
            accessibilityRole="radio"
            accessibilityState={{ selected: sortMode === 'recently_added' }}
          >
              <Text style={[styles.sortOptionText, { color: palette.textOnContainer }, sortMode === 'recently_added' && styles.sortOptionTextActive]}>
              {tUI(uiLanguage, 'sort.recentlyAdded')}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.sortOptionBtn,
              { backgroundColor: palette.modalOptionBg, borderColor: palette.modalOptionBorder },
              sortMode === 'recently_reviewed' && styles.sortOptionBtnActive,
              pressed ? styles.sortOptionBtnPressed : null,
            ]}
            onPress={() => onChangeSortMode('recently_reviewed')}
            accessibilityRole="radio"
            accessibilityState={{ selected: sortMode === 'recently_reviewed' }}
          >
              <Text style={[styles.sortOptionText, { color: palette.textOnContainer }, sortMode === 'recently_reviewed' && styles.sortOptionTextActive]}>
              {tUI(uiLanguage, 'sort.recentlyReviewed')}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.sortOptionBtn,
              { backgroundColor: palette.modalOptionBg, borderColor: palette.modalOptionBorder },
              sortMode === 'alphabetical' && styles.sortOptionBtnActive,
              pressed ? styles.sortOptionBtnPressed : null,
            ]}
            onPress={() => onChangeSortMode('alphabetical')}
            accessibilityRole="radio"
            accessibilityState={{ selected: sortMode === 'alphabetical' }}
          >
              <Text style={[styles.sortOptionText, { color: palette.textOnContainer }, sortMode === 'alphabetical' && styles.sortOptionTextActive]}>
              {tUI(uiLanguage, 'sort.alphabetical')}
            </Text>
          </Pressable>

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
  sortModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sortModalCard: {
    backgroundColor: '#02213D',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    gap: 12,
  },
  sortModalTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 2,
  },
  sortOptionBtn: {
    borderRadius: BUTTON_TOKENS.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    minHeight: BUTTON_TOKENS.height.regular,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
  },
  sortOptionBtnActive: {
    borderColor: CTA_COLOR_BORDER,
    backgroundColor: CTA_COLOR,
  },
  sortOptionBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  sortOptionText: {
    color: '#FFFFFF',
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
  },
  sortOptionTextActive: {
    color: TEXT_ON_CTA,
  },
});
