import React from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tUI, type UIStringKey } from '../../../i18n/uiLanguage';
import type { UILanguage } from '@services/settings/userSettings';
import type { PaywallExitRow } from '../../../features/subscription/paywallExit';
import { splitTemplateAroundToken } from '../../../features/subscription/paywallHero';

export type PaywallDeclineReason =
  | 'too_expensive'
  | 'trying_first'
  | 'not_enough_use';

type Props = {
  word: string;
  sourceLabel: string;
  rows: PaywallExitRow[];
  uiLanguage: UILanguage;
  bottomInset: number;
  onReview: () => void;
  onCache: () => void;
  onStartReview: () => void;
  onReason: (reason: PaywallDeclineReason) => void;
};

const ACCENT = '#4EAFF4';
const GOLD = '#F5B53F';
const MUTED = '#94A3B8';
const NAVY = '#02213D';
const SECTION_COUNT = 5;

const REASONS: Array<{ key: PaywallDeclineReason; label: UIStringKey }> = [
  { key: 'too_expensive', label: 'settings.membership.exit.reason.tooExpensive' },
  { key: 'trying_first', label: 'settings.membership.exit.reason.tryingFirst' },
  { key: 'not_enough_use', label: 'settings.membership.exit.reason.notEnoughUse' },
];

// 各區塊依序淡入上移（同原型的 rise）。
function useStaggeredRise() {
  const values = React.useRef(
    Array.from({ length: SECTION_COUNT }, () => new Animated.Value(0))
  ).current;
  React.useEffect(() => {
    Animated.stagger(
      90,
      values.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 550,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        })
      )
    ).start();
  }, [values]);
  return (index: number) => ({
    opacity: values[index],
    transform: [
      {
        translateY: values[index].interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  });
}

function CachePile({ word, sourceLabel }: { word: string; sourceLabel: string }) {
  return (
    <View style={styles.pile}>
      <View style={[styles.pileCard, styles.pileCardBackLeft]} />
      <View style={[styles.pileCard, styles.pileCardBackRight]} />
      <View style={[styles.pileCard, styles.pileCardTop]}>
        <View style={styles.sourcePill}>
          <Text style={styles.sourcePillText} numberOfLines={1}>
            {sourceLabel}
          </Text>
        </View>
        <View style={styles.pileWordBox}>
          <Text
            style={styles.pileWord}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.45}
            maxFontSizeMultiplier={1}
          >
            {word}
          </Text>
        </View>
      </View>
      <View style={styles.cacheBadge}>
        <Text style={styles.cacheBadgeText}>Cache</Text>
      </View>
    </View>
  );
}

export default function PaywallExitUI({
  word,
  sourceLabel,
  rows,
  uiLanguage,
  bottomInset,
  onReview,
  onCache,
  onStartReview,
  onReason,
}: Props) {
  const rise = useStaggeredRise();
  const [selectedReason, setSelectedReason] =
    React.useState<PaywallDeclineReason | null>(null);
  const title = splitTemplateAroundToken(
    tUI(uiLanguage, 'settings.membership.exit.title'),
    '{word}'
  );

  const renderRow = (row: PaywallExitRow, index: number) => {
    const content =
      row.key === 'review'
        ? {
            icon: 'albums-outline' as const,
            title: tUI(uiLanguage, 'settings.membership.exit.review').replace(
              '{count}',
              String(row.count)
            ),
            meta: tUI(uiLanguage, 'settings.membership.exit.reviewMeta'),
            onPress: onReview,
          }
        : row.key === 'cache'
          ? {
              icon: 'add' as const,
              title: tUI(uiLanguage, 'settings.membership.exit.cache'),
              meta: tUI(uiLanguage, 'settings.membership.exit.cacheMeta'),
              onPress: onCache,
            }
          : {
              icon: 'mic-outline' as const,
              title: tUI(uiLanguage, 'settings.membership.exit.pronunciation'),
              meta:
                row.remaining == null
                  ? null
                  : tUI(
                      uiLanguage,
                      'settings.membership.exit.pronunciationMeta'
                    ).replace('{count}', String(row.remaining)),
              onPress: null,
            };
    const body = (
      <>
        <View style={styles.rowIcon}>
          <Ionicons name={content.icon} size={16} color={ACCENT} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} maxFontSizeMultiplier={1.2}>
            {content.title}
          </Text>
          {content.meta ? (
            <Text style={styles.rowMeta} maxFontSizeMultiplier={1.2}>
              {content.meta}
            </Text>
          ) : null}
        </View>
        {content.onPress ? (
          <Ionicons name="chevron-forward" size={14} color={MUTED} />
        ) : null}
      </>
    );
    const rowStyle = [styles.row, index > 0 ? styles.rowDivider : null];
    // 發音評分那列是純文字，不能點。
    if (!content.onPress) {
      return (
        <View key={row.key} style={rowStyle}>
          {body}
        </View>
      );
    }
    return (
      <Pressable
        key={row.key}
        accessibilityRole="button"
        style={({ pressed }) => [rowStyle, pressed ? styles.pressed : null]}
        onPress={content.onPress}
      >
        {body}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: bottomInset + 18 }]}>
      <Animated.View style={[styles.hero, rise(0)]}>
        <CachePile word={word} sourceLabel={sourceLabel} />
      </Animated.View>
      <Animated.View style={rise(1)}>
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>
          {title.before}
          <Text style={styles.titleWord}>{word}</Text>
          {title.after}
        </Text>
      </Animated.View>
      <Animated.View style={[styles.list, rise(2)]}>
        {rows.map(renderRow)}
      </Animated.View>
      <Animated.View style={[styles.ask, rise(3)]}>
        <Text style={styles.askQuestion} maxFontSizeMultiplier={1.2}>
          {tUI(uiLanguage, 'settings.membership.exit.reasonQuestion')}
        </Text>
        <View style={styles.chips}>
          {REASONS.map((reason) => {
            const selected = selectedReason === reason.key;
            return (
              <Pressable
                key={reason.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.chip,
                  selected ? styles.chipSelected : null,
                  pressed ? styles.pressed : null,
                ]}
                onPress={() => {
                  if (selected) return;
                  setSelectedReason(reason.key);
                  onReason(reason.key);
                }}
              >
                <Text style={styles.chipText} maxFontSizeMultiplier={1.2}>
                  {tUI(uiLanguage, reason.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.thanks} maxFontSizeMultiplier={1.2}>
          {selectedReason
            ? tUI(uiLanguage, 'settings.membership.exit.thanks')
            : ''}
        </Text>
      </Animated.View>
      <View style={styles.spacer} />
      <Animated.View style={rise(4)}>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.startButton,
            pressed ? styles.pressed : null,
          ]}
          onPress={onStartReview}
        >
          <Text style={styles.startButtonText} maxFontSizeMultiplier={1.2}>
            {tUI(uiLanguage, 'settings.membership.exit.startReview')}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 36,
    paddingHorizontal: 20,
  },
  hero: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pile: {
    width: 118,
    height: 136,
  },
  pileCard: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  pileCardBackLeft: {
    opacity: 0.7,
    transform: [{ translateX: -10 }, { translateY: 6 }, { rotate: '-8deg' }],
  },
  pileCardBackRight: {
    opacity: 0.85,
    transform: [{ translateX: 9 }, { translateY: 4 }, { rotate: '6deg' }],
  },
  pileCardTop: {
    padding: 9,
    transform: [{ rotate: '-1.5deg' }],
  },
  sourcePill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: 8,
    backgroundColor: '#EFEFF3',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sourcePillText: {
    color: '#858895',
    fontSize: 8.5,
    fontWeight: '700',
  },
  pileWordBox: {
    flex: 1,
    justifyContent: 'center',
  },
  pileWord: {
    color: '#1C2530',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  cacheBadge: {
    position: 'absolute',
    top: -8,
    right: -10,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: '#F0506E',
    borderWidth: 2,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cacheBadgeText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  title: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  titleWord: {
    color: GOLD,
  },
  list: {
    marginTop: 20,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(78,175,244,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  rowMeta: {
    marginTop: 1,
    color: MUTED,
    fontSize: 11.5,
    fontWeight: '600',
  },
  ask: {
    marginTop: 18,
  },
  askQuestion: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipSelected: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(78,175,244,0.16)',
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  thanks: {
    minHeight: 18,
    marginTop: 10,
    color: '#3DD68C',
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  spacer: {
    flex: 1,
  },
  startButton: {
    height: 50,
    borderRadius: 18,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    color: '#0D1117',
    fontSize: 15.5,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.85,
  },
});
