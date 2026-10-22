import React from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { tUI } from '../../../i18n/uiLanguage';
import type { UILanguage } from '@services/settings/userSettings';
import type { PaywallHero } from '../../../features/subscription/paywallHero';

type Props = {
  // null：會員狀態還沒讀到，先保留空間，避免付費用戶閃過免費版畫面。
  hero: PaywallHero | null;
  uiLanguage: UILanguage;
};

const ACCENT = '#4EAFF4';
const MUTED = '#94A3B8';
const PROGRESS_TRACK_WIDTH = 150;

function StarterProgressBar({ progress }: { progress: number }) {
  const width = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(width, {
      toValue: progress * PROGRESS_TRACK_WIDTH,
      duration: 900,
      delay: 400,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start();
  }, [progress, width]);

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, { width }]} />
    </View>
  );
}

export default function PaywallHeroUI({ hero, uiLanguage }: Props) {
  if (!hero) return <View style={styles.container} />;

  if (hero.kind === 'plan') {
    const tierLabel = hero.tier === 'lite' ? 'LITE' : 'PRO';
    return (
      <View style={styles.container}>
        <View style={styles.planChip}>
          <Text style={styles.planChipText}>{tierLabel}</Text>
        </View>
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>
          {tUI(uiLanguage, 'settings.membership.currentTier').replace(
            '{tier}',
            tierLabel
          )}
        </Text>
      </View>
    );
  }

  const { usage } = hero;
  const formatUsage = (
    key:
      | 'settings.membership.starter.cards'
      | 'settings.membership.starter.pronunciation',
    used: number,
    limit: number
  ) =>
    tUI(uiLanguage, key)
      .replace('{used}', String(used))
      .replace('{limit}', String(limit));

  return (
    <View style={styles.container}>
      <View style={styles.coveredCard}>
        <Text style={styles.coveredMark}>?</Text>
        <Text style={styles.coveredNumber}>#21</Text>
      </View>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        {tUI(uiLanguage, 'settings.membership.locked21.title')}
      </Text>
      {usage ? (
        <>
          <StarterProgressBar progress={usage.progress} />
          {usage.cardsLeft > 0 ? (
            <Text style={styles.remainingHint} maxFontSizeMultiplier={1.2}>
              {tUI(uiLanguage, 'settings.membership.locked21.remaining').replace(
                '{count}',
                String(usage.cardsLeft)
              )}
            </Text>
          ) : null}
          <View style={styles.usageRow}>
            <Text style={styles.usageText} maxFontSizeMultiplier={1.2}>
              {formatUsage(
                'settings.membership.starter.cards',
                usage.cardsUsed,
                usage.limit
              )}
            </Text>
            <Text style={styles.usageText} maxFontSizeMultiplier={1.2}>
              {formatUsage(
                'settings.membership.starter.pronunciation',
                usage.pronunciationUsed,
                usage.limit
              )}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  coveredCard: {
    width: 132,
    height: 172,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    transform: [{ rotate: '-4deg' }],
  },
  coveredMark: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '900',
  },
  coveredNumber: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
  },
  planChip: {
    borderWidth: 2,
    borderColor: ACCENT,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  planChipText: {
    color: ACCENT,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 22,
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  progressTrack: {
    width: PROGRESS_TRACK_WIDTH,
    height: 6,
    marginTop: 12,
    borderRadius: 3,
    backgroundColor: '#334155',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  remainingHint: {
    marginTop: 8,
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginTop: 10,
  },
  usageText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
