import React from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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
const COLLAPSED_HEIGHT = 64;

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
  const [fullMeasuredHeight, setFullMeasuredHeight] = React.useState(0);
  const reduceMotion = useReducedMotion();
  const heightAnim = useSharedValue(COLLAPSED_HEIGHT);
  const chevronRotation = useSharedValue(0);

  const itemSignature = items.map((item) => item.id).join('|');

  const estimatedRows = Math.ceil(items.length / 4);
  const estimatedHeight = Math.max(
    COLLAPSED_HEIGHT,
    estimatedRows * 64 + (estimatedRows - 1) * 8
  );
  const targetFullHeight =
    fullMeasuredHeight > 0 ? fullMeasuredHeight : estimatedHeight;

  React.useEffect(() => {
    setExpanded(false);
    heightAnim.value = COLLAPSED_HEIGHT;
    chevronRotation.value = 0;
  }, [heightAnim, chevronRotation, itemSignature]);

  React.useEffect(() => {
    if (items.length <= COLLAPSED_ITEM_COUNT) {
      heightAnim.value = COLLAPSED_HEIGHT;
      chevronRotation.value = 0;
      return;
    }
    const target = expanded ? targetFullHeight : COLLAPSED_HEIGHT;
    if (reduceMotion) {
      heightAnim.value = target;
      chevronRotation.value = expanded ? 180 : 0;
    } else {
      heightAnim.value = withTiming(target, {
        duration: 280,
        easing: Easing.bezier(0.2, 0, 0, 1),
      });
      chevronRotation.value = withTiming(expanded ? 180 : 0, {
        duration: 240,
        easing: Easing.bezier(0.2, 0, 0, 1),
      });
    }
  }, [
    chevronRotation,
    expanded,
    heightAnim,
    items.length,
    reduceMotion,
    targetFullHeight,
  ]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    height: items.length <= COLLAPSED_ITEM_COUNT ? 'auto' : heightAnim.value,
    overflow: 'hidden',
  }));

  const animatedChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  const handleGridLayout = React.useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (height > 0) {
      setFullMeasuredHeight((current) => (current !== height ? height : current));
    }
  }, []);

  const grid = (
    <View style={styles.grid} onLayout={handleGridLayout}>
      {items.map((item) => (
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
      <Reanimated.View style={animatedContainerStyle}>
        {grid}
      </Reanimated.View>

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
          <Reanimated.View style={animatedChevronStyle}>
            <Ionicons
              name="chevron-down"
              size={15}
              color={secondaryTextColor}
            />
          </Reanimated.View>
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
