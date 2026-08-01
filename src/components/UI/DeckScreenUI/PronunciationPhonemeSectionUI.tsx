import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { UILanguage } from '../../../services/settings/userSettings';
import { tUI } from '../../../i18n/uiLanguage';
import AnimatedGlowPressable from '../shared/AnimatedGlowPressable';

export type PronunciationPhonemeSectionItem = {
  id: string;
  value: string;
  label: string;
  accuracy?: number | null;
  active?: boolean;
  loading?: boolean;
};

type Props = {
  items: PronunciationPhonemeSectionItem[];
  uiLanguage: UILanguage;
  primaryTextColor: string;
  secondaryTextColor: string;
  surfaceColor: string;
  borderColor: string;
  accentColor?: string;
  onPressItem: (item: PronunciationPhonemeSectionItem) => void;
};

const COLLAPSED_ITEM_COUNT = 4;

export default function PronunciationPhonemeSectionUI({
  items,
  uiLanguage,
  primaryTextColor,
  secondaryTextColor,
  surfaceColor,
  borderColor,
  accentColor = '#4EAFF4',
  onPressItem,
}: Props) {
  const [expanded, setExpanded] = React.useState(false);
  const itemSignature = items.map((item) => item.id).join('|');

  React.useEffect(() => {
    setExpanded(false);
  }, [itemSignature]);

  const visibleItems = expanded ? items : items.slice(0, COLLAPSED_ITEM_COUNT);
  const grid = (
    <View style={styles.grid}>
      {visibleItems.map((item) => (
        <AnimatedGlowPressable
          key={item.id}
          accessibilityRole="button"
          active={Boolean(item.active || item.loading)}
          style={styles.chip}
          pressedStyle={styles.chipPressed}
          idleBackgroundColor={surfaceColor}
          idleBorderColor={borderColor}
          disabled={item.loading}
          onPress={() => onPressItem(item)}
        >
          {item.loading ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : (
            <Text
              style={[
                styles.phonemeText,
                { color: item.active ? accentColor : primaryTextColor },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.58}
            >
              {item.label}
            </Text>
          )}
          <Text style={[styles.scoreText, { color: secondaryTextColor }]}>
            {typeof item.accuracy === 'number'
              ? `${Math.round(item.accuracy)}%`
              : '—'}
          </Text>
        </AnimatedGlowPressable>
      ))}
    </View>
  );

  return (
    <View style={styles.section}>
      {expanded ? (
        <ScrollView
          style={styles.expandedScroll}
          contentContainerStyle={styles.expandedContent}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          bounces={false}
        >
          {grid}
        </ScrollView>
      ) : (
        grid
      )}

      {items.length > COLLAPSED_ITEM_COUNT ? (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.toggle,
            pressed ? styles.togglePressed : null,
          ]}
          onPress={() => setExpanded((current) => !current)}
        >
          <Text style={[styles.toggleText, { color: secondaryTextColor }]}>
            {tUI(
              uiLanguage,
              expanded
                ? 'pronunciation.showFewerSounds'
                : 'pronunciation.showAllSounds'
            )}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={15}
            color={secondaryTextColor}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    flexShrink: 1,
    gap: 8,
  },
  expandedScroll: {
    maxHeight: 176,
    minHeight: 0,
    flexShrink: 1,
  },
  expandedContent: {
    paddingBottom: 2,
  },
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexGrow: 1,
    flexBasis: '22%',
    maxWidth: '24%',
    minWidth: 62,
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  chipPressed: {
    opacity: 0.82,
  },
  phonemeText: {
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  scoreText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
  toggle: {
    minHeight: 32,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
  },
  togglePressed: {
    opacity: 0.62,
  },
  toggleText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
});
