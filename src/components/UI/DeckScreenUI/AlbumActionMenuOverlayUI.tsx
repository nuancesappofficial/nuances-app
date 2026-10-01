import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import Reanimated, { type SharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import FolderIcon from './FolderIcon';
import { MenuSymbol } from './AlbumIconItemUI';
import type { DeckAlbum } from './deckTypes';
import type { UILanguage } from '../../../services/settings/userSettings';
import { getDeckAlbumDisplayName } from '../../../features/deck/albums';

type Props = {
  isMenuVisible: SharedValue<boolean>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  hoveredAction: SharedValue<'none' | 'edit' | 'delete'>;
  activeAlbum: DeckAlbum | null;
  uiLanguage: UILanguage;
  activeLayout: { x: number; y: number; width: number; height: number } | null;
};

const ELEGANT_SPRING = { damping: 30, stiffness: 140, mass: 1 } as const;
const MENU_BUTTON_HALF_SIZE = 25;
const MENU_BUTTON_OFFSET_X = 45;

export default function AlbumActionMenuOverlayUI({
  isMenuVisible,
  startX,
  startY,
  hoveredAction,
  activeAlbum,
  uiLanguage,
  activeLayout,
}: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const AnimatedBlurView = React.useMemo(() => Reanimated.createAnimatedComponent(BlurView), []);

  const blurStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: -windowHeight,
    bottom: -windowHeight,
    left: -windowWidth,
    right: -windowWidth,
    opacity: withTiming(isMenuVisible.value ? 1 : 0, { duration: 160 }),
  }));

  const editButtonStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isMenuVisible.value ? 1 : 0, { duration: 120 }),
    transform: [{ scale: withSpring(hoveredAction.value === 'edit' ? 1.5 : 1, ELEGANT_SPRING) }],
    left: startX.value - MENU_BUTTON_OFFSET_X - MENU_BUTTON_HALF_SIZE,
    top: startY.value - MENU_BUTTON_HALF_SIZE,
  }));

  const deleteButtonStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isMenuVisible.value ? 1 : 0, { duration: 120 }),
    transform: [{ scale: withSpring(hoveredAction.value === 'delete' ? 1.5 : 1, ELEGANT_SPRING) }],
    left: startX.value + MENU_BUTTON_OFFSET_X - MENU_BUTTON_HALF_SIZE,
    top: startY.value - MENU_BUTTON_HALF_SIZE,
  }));

  const cloneStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isMenuVisible.value ? 1 : 0, { duration: 120 }),
    transform: [{ scale: withSpring(isMenuVisible.value ? 1.06 : 1, ELEGANT_SPRING) }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <AnimatedBlurView
        tint="dark"
        intensity={100}
        pointerEvents="none"
        style={[styles.menuBlurLayer, blurStyle]}
      />
      <Reanimated.View style={[styles.menuDimLayer, blurStyle]} />

      {activeAlbum && activeLayout ? (
        <Reanimated.View
          style={[
            styles.activeAlbumClone,
            cloneStyle,
            {
              top: activeLayout.y,
              left: activeLayout.x,
              width: activeLayout.width,
              height: activeLayout.height,
            },
          ]}
        >
          <FolderIcon
            title={getDeckAlbumDisplayName(activeAlbum, uiLanguage)}
            wordCount={activeAlbum.wordCount}
            latestCards={activeAlbum.latestCards}
            iconEmoji={activeAlbum.emoji}
            coverColor={activeAlbum.color}
            coverImageUri={activeAlbum.coverImageUri}
            style={styles.activeAlbumCloneInner}
          />
        </Reanimated.View>
      ) : null}

      <Reanimated.View style={[styles.floatingActionButton, styles.menuButtonLayer, editButtonStyle]}>
        <MenuSymbol name="square.and.pencil" color="#1C1C1E" fallback="✏️" />
      </Reanimated.View>

      <Reanimated.View style={[styles.floatingActionButton, styles.menuButtonLayer, deleteButtonStyle]}>
        <MenuSymbol name="trash.fill" color="#FF3B30" fallback="🗑️" />
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  menuBlurLayer: {
    zIndex: 10,
  },
  menuDimLayer: {
    zIndex: 11,
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  menuButtonLayer: {
    zIndex: 100,
  },
  activeAlbumClone: {
    position: 'absolute',
    zIndex: 60,
    overflow: 'visible',
  },
  activeAlbumCloneInner: {
    width: '100%',
    height: '100%',
  },
  floatingActionButton: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 10,
  },
});
