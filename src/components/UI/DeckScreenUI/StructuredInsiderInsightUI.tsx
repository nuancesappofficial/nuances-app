import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { FadeWhen } from '../shared/FadeWhen';
import { Ionicons } from '@expo/vector-icons';
import { tUI, type UILanguage } from '../../../i18n/uiLanguage';
import type { StructuredInsiderInsight } from '../../../features/cards/culturalBackgroundInsight';
import { colorWithAlpha, countRevealTokens, splitRevealBands } from '../../../features/createCard/steadyReveal';
import { useSteadyReveal } from '../../../features/createCard/useSteadyReveal';
import { renderRevealRuns } from '../shared/revealRuns';

export type StructuredInsiderInsightUIProps = {
  insight: StructuredInsiderInsight;
  isExpanded: boolean;
  onToggleExpand?: () => void;
  showToggle?: boolean;
  /** Keep the toggle row's space from the start (invisible until showToggle) so it never pushes content down. */
  reserveToggleSpace?: boolean;
  textColor: string;
  secondaryTextColor: string;
  /** Colour for the core hook line and highlighted English terms (defaults to textColor). */
  emphasisTextColor?: string;
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

// Text exactly as BentoCardItem lays it out (highlighted terms are trimmed).
function bulletDisplaySegments(body: string): Array<{ text: string; isBold: boolean }> {
  return splitTextForHighlight(body).map((seg) => ({
    text: seg.isHighlighted ? seg.text.trim() : seg.text,
    isBold: seg.isHighlighted,
  }));
}

type BentoPalette = {
  icon: string;
  surface: string;
  labelText: string;
  emphasisText: string;
};

// Neutral section (direction A): one soft grey box per section, grey label,
// plain body, English terms in bold ink. No coloured boxes or chips.
const BentoCardItem: React.FC<{
  bullet: { label?: string; body: string };
  palette: BentoPalette;
  textColor: string;
  bodyFontSize: number;
  bodyLineHeight: number;
  /** Reveal position in characters; undefined shows everything. Unrevealed text stays laid out, transparent. */
  revealPos?: number;
  fadeChars?: number;
}> = React.memo(({
  bullet,
  palette,
  textColor,
  bodyFontSize,
  bodyLineHeight,
  revealPos,
  fadeChars = 1,
}) => {
  const displaySegments = React.useMemo(() => bulletDisplaySegments(bullet.body), [bullet.body]);
  const runs = React.useMemo(
    () =>
      renderRevealRuns(splitRevealBands(displaySegments, revealPos ?? Number.MAX_SAFE_INTEGER, fadeChars), {
        color: textColor,
        boldStyle: (alpha) => ({
          ...styles.termHighlight,
          color: colorWithAlpha(palette.emphasisText, alpha),
        }),
        keyPrefix: 'seg',
      }),
    [displaySegments, fadeChars, palette.emphasisText, revealPos, textColor]
  );

  return (
    <View
      style={[styles.bentoCard, { backgroundColor: palette.surface }]}
    >
      <View style={styles.badgeRow}>
        <Text style={[styles.bentoBadgeIcon, { color: palette.labelText }]}>
          {palette.icon}
        </Text>
        {bullet.label ? (
          <Text style={[styles.bentoBadgeText, { color: palette.labelText }]}>
            {bullet.label}
          </Text>
        ) : null}
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
        {runs}
      </Text>
    </View>
  );
});

export const StructuredInsiderInsightUI: React.FC<StructuredInsiderInsightUIProps> = ({
  insight,
  isExpanded,
  onToggleExpand,
  showToggle = false,
  reserveToggleSpace = false,
  textColor,
  secondaryTextColor,
  emphasisTextColor,
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

  const emphasisColor = emphasisTextColor || textColor;
  const bentoColors: Record<BentoTheme, BentoPalette> = React.useMemo(() => {
    const neutral = {
      surface: isLight ? '#F4F5F7' : '#1F2834',
      labelText: secondaryTextColor,
      emphasisText: emphasisColor,
    };
    return {
      blue: { icon: '✦', ...neutral },
      rose: { icon: '⇄', ...neutral },
    };
  }, [emphasisColor, isLight, secondaryTextColor]);

  const toggleLabel = isExpanded
    ? (uiLanguage.startsWith('zh') ? '收起完整內容' : tUI(uiLanguage as UILanguage, 'cardDetail.hideFullContent'))
    : (hasBullets
        ? (uiLanguage.startsWith('zh') ? '展開背景與辨析' : tUI(uiLanguage as UILanguage, 'cardDetail.showFullContent'))
        : tUI(uiLanguage as UILanguage, 'cardDetail.showFullContent'));

  // Web-LLM style reveal across hook + bullets: one steady pace, a soft fading
  // edge, and everything laid out at full size from the start (unrevealed text
  // is transparent), so this section never changes height while it reveals.
  const bulletTexts = React.useMemo(
    () => detailBullets.map((b) => bulletDisplaySegments(b.body || '').map((seg) => seg.text).join('')),
    [detailBullets]
  );
  const revealText = React.useMemo(() => (hookText || '') + bulletTexts.join(''), [bulletTexts, hookText]);
  const { pos, fadeChars } = useSteadyReveal({
    text: revealText,
    active,
    animate,
    isStreamComplete,
    onComplete,
  });
  const revealPos = animate ? (active ? pos : 0) : Number.MAX_SAFE_INTEGER;
  // Reveal positions are in tokens (words / CJK characters): each bullet starts
  // after the tokens of the hook and the bullets before it.
  const bulletOffsets = React.useMemo(() => {
    let prefix = hookText || '';
    return bulletTexts.map((t) => {
      const start = countRevealTokens(prefix);
      prefix += t;
      return start;
    });
  }, [bulletTexts, hookText]);
  const hookRuns = React.useMemo(
    () =>
      renderRevealRuns(splitRevealBands([{ text: hookText || '', isBold: false }], revealPos, fadeChars), {
        color: emphasisColor,
        boldStyle: () => ({}),
        keyPrefix: 'hook',
      }),
    [emphasisColor, fadeChars, hookText, revealPos]
  );
  const showToggleRow = Boolean(hasBullets && onToggleExpand && (showToggle || reserveToggleSpace));

  return (
    <View style={styles.container}>
      {/* 1. Core Hook Text */}
      {hookText ? (
        <Text
          style={[
            styles.hookText,
            {
              color: emphasisColor,
              fontSize: hookFontSize,
              lineHeight: hookLineHeight,
              marginBottom: isExpanded && hasBullets ? 10 : 0,
            },
          ]}
          numberOfLines={!isExpanded && hasBullets ? collapsedLines : undefined}
          ellipsizeMode="tail"
        >
          {hookRuns}
        </Text>
      ) : null}

      {/* 2. Style B Bento Micro-Cards (Expanded View) */}
      {isExpanded && hasBullets ? (
        <Reanimated.View entering={animate ? undefined : FadeIn.duration(260)} style={styles.bulletsList}>
          {detailBullets.map((bullet, index) => {
            const themeKey = getBentoTheme(bullet, index);
            const palette = bentoColors[themeKey];
            const bulletPos = revealPos - (bulletOffsets[index] ?? 0);

            return (
              <FadeWhen key={`bullet-${index}-${bullet.label || ''}`} visible={!animate || bulletPos > 0}>
                <BentoCardItem
                  bullet={bullet}
                  palette={palette}
                  textColor={textColor}
                  bodyFontSize={bodyFontSize}
                  bodyLineHeight={bodyLineHeight}
                  revealPos={animate ? bulletPos : undefined}
                  fadeChars={fadeChars}
                />
              </FadeWhen>
            );
          })}
        </Reanimated.View>
      ) : null}

      {/* 3. Collapse/Expand Toggle Switch (space kept from the start when reserveToggleSpace) */}
      {showToggleRow ? (
        <Pressable
          style={[styles.toggleRow, !showToggle ? styles.toggleRowReserved : null]}
          onPress={onToggleExpand}
          disabled={!showToggle}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
          accessibilityElementsHidden={!showToggle}
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
  hiddenText: {
    color: 'transparent',
    backgroundColor: 'transparent',
    textDecorationLine: 'none',
  },
  toggleRowReserved: {
    opacity: 0,
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
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
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
