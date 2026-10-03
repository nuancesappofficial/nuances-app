import React from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  MODAL_CTA_COLOR,
  MODAL_CTA_COLOR_BORDER,
  UPLOAD_CACHE_CTA_COLOR,
  UPLOAD_CACHE_CTA_COLOR_BORDER,
} from '../../../theme/colors';
import type { UILanguage } from '../../../services/settings/userSettings';
import { tUI } from '../../../i18n/uiLanguage';

type Props = {
  visible: boolean;
  selectedCount: number;
  uiLanguage: UILanguage;
  onPressMove: () => void;
  onPressDelete: () => void;
};

export default function BatchActionDockUI({
  visible,
  selectedCount,
  uiLanguage,
  onPressMove,
  onPressDelete,
}: Props) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isLight = colorScheme === 'light';
  const hasSelection = selectedCount > 0;

  const countLabel = tUI(uiLanguage, 'deck.batchSelectedCount');

  const translateY = React.useRef(new Animated.Value(visible ? 0 : 140)).current;
  const [shouldRender, setShouldRender] = React.useState(visible);

  React.useEffect(() => {
    if (visible) {
      setShouldRender(true);
      Animated.spring(translateY, {
        toValue: 0,
        damping: 22,
        stiffness: 240,
        mass: 0.85,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: 140,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setShouldRender(false);
      });
    }
  }, [translateY, visible]);

  const handlePressMove = React.useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPressMove();
  }, [onPressMove]);

  const handlePressDelete = React.useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPressDelete();
  }, [onPressDelete]);

  if (!shouldRender) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.dockContainer,
        {
          bottom: Math.max(12, insets.bottom > 0 ? insets.bottom - 12 : 12),
          transform: [{ translateY }],
        },
      ]}
    >
      {/* 左側圓角方塊：書籤／移動至單詞本按鈕 */}
      <Pressable
        style={({ pressed }) => [
          styles.squareButton,
          {
            backgroundColor: MODAL_CTA_COLOR,
            borderColor: MODAL_CTA_COLOR_BORDER,
            opacity: hasSelection ? (pressed ? 0.92 : 1) : 0.38,
            transform: [{ scale: pressed && hasSelection ? 0.94 : 1 }],
          },
        ]}
        disabled={!hasSelection}
        onPress={handlePressMove}
        hitSlop={6}
        accessibilityLabel={tUI(uiLanguage, 'deck.batchMoveToAlbum')}
      >
        <Ionicons name="bookmark-outline" size={24} color="#FFFFFF" />
      </Pressable>

      {/* 中間膠囊：已選取項目計數 (未選取時同步淡化至 opacity 0.38) */}
      <View
        style={[
          styles.centerCapsule,
          {
            backgroundColor: isLight ? '#FFFFFF' : '#080F1D',
            borderColor: isLight ? '#94A3B8' : 'rgba(255, 255, 255, 0.14)',
            borderWidth: isLight ? 1.5 : 1,
            shadowOpacity: isLight ? 0.16 : 0.35,
            opacity: hasSelection ? 1 : 0.38,
          },
        ]}
      >
        <Text
          style={[
            styles.centerCapsuleText,
            { color: isLight ? '#0F172A' : '#FFFFFF' },
          ]}
          numberOfLines={1}
        >
          {`${selectedCount} ${countLabel}`}
        </Text>
      </View>

      {/* 右側圓角方塊：批次刪除按鈕 */}
      <Pressable
        style={({ pressed }) => [
          styles.squareButton,
          {
            backgroundColor: UPLOAD_CACHE_CTA_COLOR,
            borderColor: UPLOAD_CACHE_CTA_COLOR_BORDER,
            opacity: hasSelection ? (pressed ? 0.92 : 1) : 0.38,
            transform: [{ scale: pressed && hasSelection ? 0.94 : 1 }],
          },
        ]}
        disabled={!hasSelection}
        onPress={handlePressDelete}
        hitSlop={6}
        accessibilityLabel={tUI(uiLanguage, 'deck.batchDelete')}
      >
        <Ionicons name="trash-outline" size={24} color="#FFFFFF" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dockContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    borderWidth: 0,
    zIndex: 999,
  },
  squareButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  centerCapsule: {
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 4,
    maxWidth: '60%',
  },
  centerCapsuleText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
});
