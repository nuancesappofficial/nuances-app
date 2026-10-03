import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { resolveThemeColors } from '../../../theme/colors';
import type { UILanguage } from '../../../services/settings/userSettings';
import { tUI } from '../../../i18n/uiLanguage';

type Props = {
  selectedCount: number;
  uiLanguage: UILanguage;
  onPressMove: () => void;
  onPressDelete: () => void;
};

export default function BatchActionDockUI({
  selectedCount,
  uiLanguage,
  onPressMove,
  onPressDelete,
}: Props) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const palette = resolveThemeColors(colorScheme);
  const isLight = colorScheme === 'light';
  const hasSelection = selectedCount > 0;

  const countText = `${selectedCount} ${tUI(uiLanguage, 'deck.batchSelectedCount')}`;
  const moveText = tUI(uiLanguage, 'deck.batchMoveToAlbum');
  const deleteText = tUI(uiLanguage, 'deck.batchDelete');

  return (
    <View
      style={[
        styles.dockContainer,
        {
          bottom: Math.max(16, insets.bottom + 8),
          backgroundColor: isLight ? '#FFFFFF' : '#1E293B',
          borderColor: isLight ? 'rgba(0,0,0,0.08)' : '#334155',
          shadowColor: isLight ? '#000000' : '#000000',
        },
      ]}
    >
      <View style={styles.countBadge}>
        <Text
          style={[
            styles.countText,
            { color: isLight ? '#475569' : '#CBD5E1' },
          ]}
        >
          {countText}
        </Text>
      </View>

      <View style={styles.actionsWrap}>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: isLight ? '#F1F5F9' : '#334155',
              opacity: hasSelection ? (pressed ? 0.96 : 1) : 0.45,
              transform: [{ scale: pressed && hasSelection ? 0.99 : 1 }],
            },
          ]}
          disabled={!hasSelection}
          onPress={onPressMove}
          hitSlop={6}
        >
          <Ionicons
            name="folder-outline"
            size={16}
            color={isLight ? '#334155' : '#F1F5F9'}
          />
          <Text
            style={[
              styles.actionLabel,
              { color: isLight ? '#334155' : '#F1F5F9' },
            ]}
          >
            {moveText}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.deleteButton,
            {
              backgroundColor: isLight ? '#FEE2E2' : 'rgba(239, 68, 68, 0.2)',
              opacity: hasSelection ? (pressed ? 0.96 : 1) : 0.45,
              transform: [{ scale: pressed && hasSelection ? 0.99 : 1 }],
            },
          ]}
          disabled={!hasSelection}
          onPress={onPressDelete}
          hitSlop={6}
        >
          <Ionicons name="trash-outline" size={16} color="#EF4444" />
          <Text style={[styles.actionLabel, styles.deleteLabel]}>
            {deleteText}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dockContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    zIndex: 999,
  },
  countBadge: {
    flexShrink: 1,
    paddingRight: 8,
  },
  countText: {
    fontSize: 14,
    fontWeight: '700',
  },
  actionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  deleteButton: {},
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  deleteLabel: {
    color: '#EF4444',
  },
});
