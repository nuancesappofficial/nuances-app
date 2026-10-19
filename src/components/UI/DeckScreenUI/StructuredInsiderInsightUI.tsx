import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { tUI, type UILanguage } from '../../../i18n/uiLanguage';
import type { StructuredInsiderInsight } from '../../../features/cards/culturalBackgroundInsight';
import { DEMO_GHOST_TEXT_UPDATE_INTERVAL_MS } from '../../../features/createCard/ghostAnimationTiming';

export type StructuredInsiderInsightUIProps = {
  insight: StructuredInsiderInsight;
  isExpanded: boolean;
  onToggleExpand?: () => void;
  showToggle?: boolean;
  textColor: string;
  secondaryTextColor: string;
  uiLanguage: string;
  isLight?: boolean;
  contentScale?: number;
  collapsedLines?: number;
  // Typewriter animation props
  animate?: boolean;
  active?: boolean;
  isStreamComplete?: boolean;
  onComplete?: () => void;
};

type BentoTheme = 'blue' | 'rose';

function getBentoTheme(bullet: { label?: string; body: string }, index: number): BentoTheme {
  const label = (bullet.label || '').toLowerCase();
  if (
    label.includes('近義') ||
    label.includes('辨析') ||
    label.includes('對比') ||
    label.includes('synonym') ||
    label.includes('contrast') ||
    index === 1
  ) {
    return 'rose';
  }
  return 'blue';
}

function splitTextForHighlight(text: string): Array<{ text: string; isHighlighted: boolean }> {
  if (!text) return [];
  const hasCjk = /[\u4e00-\u9fff]/.test(text);
  const regex = hasCjk
    ? /[a-zA-Z][a-zA-Z0-9]*(?:(?:['-]|(?:\s+))[a-zA-Z0-9]+)*/g
    : /(?:`[^`]+`|"[^"]+"|\'[^\']+\'|\*\*[^*]+\*\*)/g;

  const parts: Array<{ text: string; isHighlighted: boolean }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, match.index),
        isHighlighted: false,
      });
    }
    const matchText = hasCjk
      ? match[0]
      : match[0].replace(/^[`"'*]+|[`"'*]+$/g, '');
    parts.push({
      text: matchText,
      isHighlighted: true,
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({
      text: text.slice(lastIndex),
      isHighlighted: false,
    });
  }
  return parts;
}

type BentoPalette = {
  icon: string;
  cardBg: string;
  cardBorder: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  termBg: string;
  termText: string;
};

const BentoCardItem: React.FC<{
  bullet: { label?: string; body: string };
  palette: BentoPalette;
  textColor: string;
  bodyFontSize: number;
  bodyLineHeight: number;
}> = React.memo(({
  bullet,
  palette,
  textColor,
  bodyFontSize,
  bodyLineHeight,
}) => {
  const segments = React.useMemo(() => splitTextForHighlight(bullet.body), [bullet.body]);

  return (
    <View
      style={[
        styles.bentoCard,
        {
          backgroundColor: palette.cardBg,
          borderColor: palette.cardBorder,
        },
      ]}
    >
      <View style={styles.badgeRow}>
        <View
          style={[
            styles.bentoBadge,
            {
              backgroundColor: palette.badgeBg,
              borderColor: palette.badgeBorder,
            },
          ]}
        >
          <Text style={[styles.bentoBadgeIcon, { color: palette.badgeText }]}>
            {palette.icon}
          </Text>
          {bullet.label ? (
            <Text style={[styles.bentoBadgeText, { color: palette.badgeText }]}>
              {bullet.label}
            </Text>
          ) : null}
        </View>
      </View>

      <Text
        style={[
          styles.bulletBody,
          {
            color: textColor,
            fontSize: bodyFontSize,
            lineHeight: bodyLineHeight,
          },
        ]}
      >
        {segments.map((seg, sIdx) =>
          seg.isHighlighted ? (
            <Text
              key={`seg-${sIdx}`}
              style={[
                styles.termHighlight,
                {
                  color: palette.termText,
                  backgroundColor: palette.termBg,
                },
              ]}
            >
              {seg.text}
            </Text>
          ) : (
            seg.text
          )
        )}
      </Text>
    </View>
  );
});

export const StructuredInsiderInsightUI: React.FC<StructuredInsiderInsightUIProps> = ({
  insight,
  isExpanded,
  onToggleExpand,
  showToggle = false,
  textColor,
  secondaryTextColor,
  uiLanguage,
  isLight = true,
  contentScale = 1,
  collapsedLines = 2,
  animate = false,
  active = true,
  isStreamComplete = true,
  onComplete,
}) => {
  const { hookText, detailBullets } = insight;
  const hasBullets = detailBullets.length > 0;
  const scale = contentScale || 1;

  const hookFontSize = Math.round(16 * scale);
  const hookLineHeight = Math.round(24 * scale);
  const bodyFontSize = Math.round(14.5 * scale);
  const bodyLineHeight = Math.round(22 * scale);

  const bentoColors: Record<BentoTheme, BentoPalette> = React.useMemo(
    () => ({
      blue: {
        icon: '✦',
        cardBg: isLight ? 'rgba(14, 165, 233, 0.025)' : 'rgba(56, 189, 248, 0.04)',
        cardBorder: isLight ? 'rgba(14, 165, 233, 0.14)' : 'rgba(56, 189, 248, 0.16)',
        badgeBg: isLight ? 'rgba(14, 165, 233, 0.08)' : 'rgba(56, 189, 248, 0.14)',
        badgeBorder: isLight ? 'rgba(14, 165, 233, 0.20)' : 'rgba(56, 189, 248, 0.26)',
        badgeText: isLight ? '#0369A1' : '#38BDF8',
        termBg: isLight ? 'rgba(14, 165, 233, 0.06)' : 'rgba(56, 189, 248, 0.12)',
        termText: isLight ? '#0369A1' : '#7DD3FC',
      },
      rose: {
        icon: '⇄',
        cardBg: isLight ? 'rgba(244, 63, 94, 0.025)' : 'rgba(251, 113, 133, 0.04)',
        cardBorder: isLight ? 'rgba(244, 63, 94, 0.14)' : 'rgba(251, 113, 133, 0.16)',
        badgeBg: isLight ? 'rgba(244, 63, 94, 0.08)' : 'rgba(251, 113, 133, 0.14)',
        badgeBorder: isLight ? 'rgba(244, 63, 94, 0.20)' : 'rgba(251, 113, 133, 0.26)',
        badgeText: isLight ? '#BE123C' : '#FB7185',
        termBg: isLight ? 'rgba(244, 63, 94, 0.06)' : 'rgba(251, 113, 133, 0.12)',
        termText: isLight ? '#BE123C' : '#FDA4AF',
      },
    }),
    [isLight]
  );

  const toggleLabel = isExpanded
    ? (uiLanguage.startsWith('zh') ? '收起完整內容' : tUI(uiLanguage as UILanguage, 'cardDetail.hideFullContent'))
    : (hasBullets
        ? (uiLanguage.startsWith('zh') ? '展開背景與辨析' : tUI(uiLanguage as UILanguage, 'cardDetail.showFullContent'))
        : tUI(uiLanguage as UILanguage, 'cardDetail.showFullContent'));

  // Character units breakdown for sequential typewriter (only active if animate === true)
  const hookUnits = React.useMemo(() => (animate ? Array.from(hookText || '') : []), [animate, hookText]);
  const bulletUnitsList = React.useMemo(
    () => (animate ? detailBullets.map((b) => Array.from(b.body || '')) : []),
    [animate, detailBullets]
  );
  const totalTargetUnits = React.useMemo(() => {
    if (!animate) return 0;
    return hookUnits.length + bulletUnitsList.reduce((acc, list) => acc + list.length, 0);
  }, [animate, hookUnits.length, bulletUnitsList]);

  const [visibleUnitsCount, setVisibleUnitsCount] = React.useState(
    animate && active ? 0 : totalTargetUnits
  );
  const visibleCountRef = React.useRef(visibleUnitsCount);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const targetUnitsRef = React.useRef(totalTargetUnits);
  targetUnitsRef.current = totalTargetUnits;

  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;
  const isStreamCompleteRef = React.useRef(isStreamComplete);
  isStreamCompleteRef.current = isStreamComplete;
  const hasTriggeredCompleteRef = React.useRef(false);

  const stopRevealTimer = React.useCallback(() => {
    if (!intervalRef.current) return;
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const checkAndTriggerCompletion = React.useCallback(() => {
    if (
      !hasTriggeredCompleteRef.current &&
      targetUnitsRef.current > 0 &&
      visibleCountRef.current >= targetUnitsRef.current &&
      isStreamCompleteRef.current
    ) {
      hasTriggeredCompleteRef.current = true;
      onCompleteRef.current?.();
    }
  }, []);

  const startRevealTimer = React.useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      const targetLength = targetUnitsRef.current;
      const current = visibleCountRef.current;
      if (current >= targetLength) {
        stopRevealTimer();
        checkAndTriggerCompletion();
        return;
      }
      const remaining = targetLength - current;
      const step = remaining > 80 ? 6 : remaining > 30 ? 3 : remaining > 10 ? 2 : 1;
      const next = Math.min(targetLength, current + step);
      visibleCountRef.current = next;
      setVisibleUnitsCount(next);
      if (next >= targetLength) {
        stopRevealTimer();
        checkAndTriggerCompletion();
      }
    }, DEMO_GHOST_TEXT_UPDATE_INTERVAL_MS);
  }, [checkAndTriggerCompletion, stopRevealTimer]);

  React.useEffect(() => {
    if (!animate) return;
    if (!active) {
      stopRevealTimer();
      visibleCountRef.current = 0;
      setVisibleUnitsCount(0);
      hasTriggeredCompleteRef.current = false;
      return;
    }

    if (totalTargetUnits > visibleCountRef.current) {
      hasTriggeredCompleteRef.current = false;
    }

    startRevealTimer();
  }, [active, animate, checkAndTriggerCompletion, startRevealTimer, stopRevealTimer, totalTargetUnits]);

  React.useEffect(() => {
    if (!animate) return;
    checkAndTriggerCompletion();
  }, [animate, checkAndTriggerCompletion, isStreamComplete]);

  React.useEffect(() => {
    if (!animate) return;
    return stopRevealTimer;
  }, [animate, stopRevealTimer]);

  // Compute partial texts according to visibleUnitsCount
  const visibleHookText = animate
    ? hookUnits.slice(0, Math.min(hookUnits.length, visibleUnitsCount)).join('')
    : hookText;

  const visibleBullets = React.useMemo(() => {
    if (!animate) return detailBullets;
    let unitsLeft = Math.max(0, visibleUnitsCount - hookUnits.length);
    return detailBullets
      .map((bullet, idx) => {
        const bodyUnits = bulletUnitsList[idx] || [];
        if (unitsLeft <= 0) return null;
        const sliceCount = Math.min(bodyUnits.length, unitsLeft);
        unitsLeft -= bodyUnits.length;
        return {
          ...bullet,
          body: bodyUnits.slice(0, sliceCount).join(''),
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }, [animate, visibleUnitsCount, detailBullets, hookUnits.length, bulletUnitsList]);

  return (
    <View style={styles.container}>
      {/* 1. Core Hook Text */}
      {visibleHookText ? (
        <Text
          style={[
            styles.hookText,
            {
              color: textColor,
              fontSize: hookFontSize,
              lineHeight: hookLineHeight,
              marginBottom: isExpanded && hasBullets && visibleBullets.length > 0 ? 10 : 0,
            },
          ]}
          numberOfLines={!isExpanded && hasBullets ? collapsedLines : undefined}
          ellipsizeMode="tail"
        >
          {visibleHookText}
        </Text>
      ) : null}

      {/* 2. Style B Bento Micro-Cards (Expanded View) */}
      {isExpanded && visibleBullets.length > 0 ? (
        <Reanimated.View entering={FadeIn.duration(260)} style={styles.bulletsList}>
          {visibleBullets.map((bullet, index) => {
            const themeKey = getBentoTheme(bullet, index);
            const palette = bentoColors[themeKey];

            return (
              <BentoCardItem
                key={`bullet-${index}-${bullet.label || ''}`}
                bullet={bullet}
                palette={palette}
                textColor={textColor}
                bodyFontSize={bodyFontSize}
                bodyLineHeight={bodyLineHeight}
              />
            );
          })}
        </Reanimated.View>
      ) : null}

      {/* 3. Collapse/Expand Toggle Switch */}
      {showToggle && hasBullets && onToggleExpand ? (
        <Pressable
          style={styles.toggleRow}
          onPress={onToggleExpand}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
        >
          <Text style={[styles.toggleText, { color: secondaryTextColor }]}>
            {toggleLabel}
          </Text>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={secondaryTextColor}
            style={styles.toggleIcon}
          />
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  hookText: {
    fontWeight: '500',
  },
  bulletsList: {
    marginTop: 2,
    gap: 9,
  },
  bentoCard: {
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  badgeRow: {
    marginBottom: 6,
  },
  bentoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  bentoBadgeIcon: {
    fontSize: 10.5,
    fontWeight: '800',
    marginRight: 4,
  },
  bentoBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  bulletBody: {
    fontWeight: '400',
  },
  termHighlight: {
    fontWeight: '600',
    borderRadius: 3,
    paddingHorizontal: 3,
    letterSpacing: 0.15,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '500',
    marginRight: 4,
  },
  toggleIcon: {
    marginTop: 1,
  },
});
