import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  measure,
  runOnJS,
  type SharedValue,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import FolderIcon from './FolderIcon';
import type { DeckAlbum } from './deckTypes';

type Props = {
  item: DeckAlbum;
  onPress: (album: DeckAlbum) => void;
  isMenuVisible: SharedValue<boolean>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  hoveredAction: SharedValue<'none' | 'edit' | 'delete' | 'sort'>;
  activeAlbumId: string | null;
  onMenuStart: (album: DeckAlbum, layout: { x: number; y: number; width: number; height: number }) => void;
  onMenuFinish: () => void;
  onActionEnd: (album: DeckAlbum, action: 'none' | 'edit' | 'delete' | 'sort' ) => void;
};

const ELEGANT_SPRING = { damping: 30, stiffness: 140, mass: 1 } as const;
const MENU_BUTTON_HALF_SIZE = 25;
const MENU_BUTTON_OFFSET_X = 45;
const MENU_MIN_TOP = 72;
const WINDOW_WIDTH = 390;

function triggerSelectionHaptic() {
  void Haptics.selectionAsync();
}

export default function AlbumIconItemUI({
  item,
  onPress,
  isMenuVisible,
  startX,
  startY,
  hoveredAction,
  activeAlbumId,
  onMenuStart,
  onMenuFinish,
  onActionEnd,
}: Props) {
  const cardRef = useAnimatedRef<Reanimated.View>();
  const isActive = useSharedValue(0);
  const liftScale = useSharedValue(1);
  const suppressPressRef = React.useRef(false);

  const markLongPressStarted = React.useCallback(() => {
    suppressPressRef.current = true;
  }, []);

  const releaseLongPressSuppression = React.useCallback(() => {
    setTimeout(() => {
      suppressPressRef.current = false;
    }, 220);
  }, []);

  const albumContainerStyle = useAnimatedStyle(() => ({
    zIndex: isActive.value ? 50 : 1,
    transform: [{ scale: withSpring(isActive.value ? 1.05 : 1, ELEGANT_SPRING) }, { scale: liftScale.value }],
  }));

  const gesture = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart((e) => {
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Heavy);
      runOnJS(markLongPressStarted)();
      isActive.value = 1;
      liftScale.value = withSpring(1.02, ELEGANT_SPRING);
      isMenuVisible.value = true;
      hoveredAction.value = 'none';

      const measured = measure(cardRef);
      if (measured) {
        const anchorX = Math.min(
          WINDOW_WIDTH - (MENU_BUTTON_HALF_SIZE + MENU_BUTTON_OFFSET_X + 8),
          Math.max(MENU_BUTTON_HALF_SIZE + MENU_BUTTON_OFFSET_X + 8, measured.pageX + measured.width / 2)
        );
        const anchorY = Math.max(MENU_MIN_TOP, measured.pageY - 16);
        startX.value = anchorX;
        startY.value = anchorY;

        runOnJS(onMenuStart)(item, {
          x: measured.pageX,
          y: measured.pageY,
          width: measured.width,
          height: measured.height,
        });
      } else {
        startX.value = e.absoluteX;
        startY.value = Math.max(MENU_MIN_TOP, e.absoluteY - 16);
      }
    })
    .onUpdate((e) => {
      const editX = startX.value - MENU_BUTTON_OFFSET_X;
      const editY = startY.value;
      const deleteX = startX.value + MENU_BUTTON_OFFSET_X;
      const deleteY = startY.value;
      // 新增：第三個按鈕的座標（置於 Edit 與 Delete 的中央上方）
      const sortX = startX.value;
      const sortY = startY.value - MENU_BUTTON_OFFSET_X;
      const radius = 40;

      const editDistance = Math.hypot(e.absoluteX - editX, e.absoluteY - editY);
      const deleteDistance = Math.hypot(e.absoluteX - deleteX, e.absoluteY - deleteY);
      const sortDistance = Math.hypot(e.absoluteX - sortX, e.absoluteY - sortY);

      let nextAction: 'none' | 'edit' | 'delete' | 'sort' = 'none';
      if (editDistance <= radius) nextAction = 'edit';
      if (deleteDistance <= radius) nextAction = 'delete';
      if (sortDistance <= radius) nextAction = 'sort'; // 判定 sort

      if (nextAction !== hoveredAction.value) {
        hoveredAction.value = nextAction;
        if (nextAction === 'edit' || nextAction === 'delete'|| nextAction === 'sort') {
          runOnJS(triggerSelectionHaptic)();
        }
      }
    })
    .onEnd(() => {
      const action = hoveredAction.value;
      isMenuVisible.value = false;
      hoveredAction.value = 'none';
      isActive.value = 0;
      liftScale.value = withSpring(1, ELEGANT_SPRING);
      runOnJS(onMenuFinish)();
      runOnJS(onActionEnd)(item, action);
      runOnJS(releaseLongPressSuppression)();
    })
    .onFinalize(() => {
      isMenuVisible.value = false;
      hoveredAction.value = 'none';
      isActive.value = 0;
      liftScale.value = withSpring(1, ELEGANT_SPRING);
      runOnJS(onMenuFinish)();
      runOnJS(releaseLongPressSuppression)();
    });

  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View
        ref={cardRef}
        style={[styles.albumItem, albumContainerStyle, activeAlbumId === item.id ? styles.activeAlbumHidden : null]}
      >
        <TouchableOpacity
          style={styles.albumPressArea}
          activeOpacity={0.92}
          onPress={() => {
            if (suppressPressRef.current) return;
            onPress(item);
          }}
        >
          <FolderIcon
            title={item.name}
            wordCount={item.wordCount}
            latestCards={item.latestCards}
            iconEmoji={item.emoji}
            coverColor={item.color}
            compact
            style={styles.folderIcon}
          />
        </TouchableOpacity>
      </Reanimated.View>
    </GestureDetector>
  );
}

function canUseSFSymbolsOnDevice() {
  if (Platform.OS !== 'ios') return false;
  const version =
    typeof Platform.Version === 'string'
      ? parseInt(Platform.Version.split('.')[0] || '0', 10)
      : Platform.Version;
  return Number.isFinite(version) && version >= 17;
}

export function MenuSymbol({
  name,
  color,
  fallback,
}: {
  name: 'square.and.pencil' | 'trash.fill' | 'arrow.up.arrow.down';
  color: string;
  fallback: string;
}) {
  if (!canUseSFSymbolsOnDevice()) {
    return <Text style={{ fontSize: 22 }}>{fallback}</Text>;
  }

  return (
    <SymbolView
      name={name}
      size={22}
      tintColor={color}
      type="hierarchical"
      style={{ width: 22, height: 22 }}
      fallback={<Text style={{ fontSize: 22 }}>{fallback}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  albumItem: {
    width: '100%',
    overflow: 'visible',
  },
  albumPressArea: {
    width: '100%',
    overflow: 'visible',
  },
  folderIcon: {
    width: '100%',
  },
  activeAlbumHidden: {
    opacity: 0,
  },
});
