import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import type { UILanguage } from '../../../services/settings/userSettings';
import { resolveFeedbackColors } from '../../../theme/colors';
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
  /** When true, chips float in one by one (used by the result reveal). */
  staggerIn?: boolean;
  /** Delay before the first chip floats in, in ms. */
  staggerBaseDelayMs?: number;
  onPressItem: (item: PronunciationPhonemeSectionItem) => void;
};

const STAGGER_STEP_MS = 45;

// Accuracy bands: 85+ fine (neutral), 60–84 needs work (amber), <60 redo (red).
export type PhonemeAccuracyLevel = 'ok' | 'warn' | 'bad';
export function getPhonemeAccuracyLevel(
  accuracy?: number | null
): PhonemeAccuracyLevel {
  if (typeof accuracy !== 'number') return 'ok';
  if (accuracy < 60) return 'bad';
  if (accuracy < 85) return 'warn';
  return 'ok';
}

export default function PronunciationPhonemeSectionUI({
  items,
  primaryTextColor,
  secondaryTextColor,
  surfaceColor,
  borderColor,
  accentColor = '#2997FF',
  staggerIn = false,
  staggerBaseDelayMs = 0,
  onPressItem,
}: Props) {
  const colorScheme = useColorScheme();
  const feedback = resolveFeedbackColors(colorScheme);

  return (
    <View style={styles.section}>
      <View style={styles.grid}>
        {items.map((item, index) => {
          const level = getPhonemeAccuracyLevel(item.accuracy);
          const levelBorder =
            level === 'bad' ? feedback.bad : level === 'warn' ? feedback.warn : borderColor;
          const levelSurface =
            level === 'bad' ? feedback.badSoft : level === 'warn' ? feedback.warnSoft : surfaceColor;
          const scoreColor =
            level === 'bad' ? feedback.bad : level === 'warn' ? feedback.warn : secondaryTextColor;

          return (
            <Reanimated.View
              key={item.id}
              style={styles.chipSlot}
              entering={
                staggerIn
                  ? FadeInDown.duration(320).delay(staggerBaseDelayMs + index * STAGGER_STEP_MS)
                  : undefined
              }
            >
              <AnimatedGlowPressable
                accessibilityRole="button"
                active={Boolean(item.active || item.loading)}
                style={[styles.chip, level !== 'ok' ? styles.chipFlagged : null]}
                pressedStyle={styles.chipPressed}
                idleBackgroundColor={levelSurface}
                activeBackgroundColor={levelSurface}
                idleBorderColor={levelBorder}
                activeBorderColor={levelBorder}
                glowColor={accentColor}
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
                  >
                    {item.label}
                  </Text>
                )}
                <Text style={[styles.scoreText, { color: scoreColor }]}>
                  {typeof item.accuracy === 'number'
                    ? `${Math.round(item.accuracy)}`
                    : '—'}
                </Text>
              </AnimatedGlowPressable>
            </Reanimated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    flexShrink: 1,
  },
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipSlot: {
    flexGrow: 1,
    flexBasis: '22%',
    maxWidth: '24%',
    minWidth: 62,
  },
  chip: {
    width: '100%',
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  chipFlagged: {
    borderWidth: 1.5,
  },
  chipPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.94 }],
  },
  phonemeText: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  scoreText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
