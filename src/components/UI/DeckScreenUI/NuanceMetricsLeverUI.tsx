import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type NuanceMetricsLeverUIProps = {
  formality: number | null; // 1-10 or null
  intensity: number | null; // 1-10 or null
  insiderInsight?: string;
  ui: {
    primaryText?: string;
    secondaryText: string;
    noteText: string;
    divider: string;
    paperBorder?: string;
    paperBg?: string;
  };
  fontScale?: number;
  textWrapGuard?: number;
  onTextLayout?: (event: any) => void;
};

export const NuanceMetricsLeverUI: React.FC<NuanceMetricsLeverUIProps> = ({
  formality,
  intensity,
  insiderInsight,
  ui,
  fontScale = 1,
  textWrapGuard = 0,
  onTextLayout,
}) => {
  const hasFormality = typeof formality === 'number' && !Number.isNaN(formality);
  const hasIntensity = typeof intensity === 'number' && !Number.isNaN(intensity);
  const hasLevers = hasFormality || hasIntensity;

  if (!hasLevers && !insiderInsight) {
    return null;
  }

  const clampedFormality = hasFormality
    ? Math.max(1, Math.min(10, Math.round(formality!)))
    : null;
  const clampedIntensity = hasIntensity
    ? Math.max(1, Math.min(10, Math.round(intensity!)))
    : null;

  const formalityPercent =
    clampedFormality !== null
      ? `${Math.round(((clampedFormality - 1) / 9) * 100)}%`
      : '0%';
  const intensityPercent =
    clampedIntensity !== null
      ? `${Math.round(((clampedIntensity - 1) / 9) * 100)}%`
      : '0%';

  return (
    <View style={styles.container}>
      {/* 雙軸量表控制條 (Dual-axis Lever / Slider) */}
      {hasLevers ? (
        <View
          style={[
            styles.leversCard,
            {
              borderColor: ui.paperBorder || ui.divider,
              backgroundColor: ui.paperBg ? 'rgba(0,0,0,0.02)' : 'transparent',
            },
          ]}
        >
          {/* 正式度 (Formality): 隨意 <-> 正式 */}
          {hasFormality ? (
            <View style={styles.meterRow}>
              <Text style={[styles.axisLabel, { color: ui.secondaryText }]}>隨意</Text>
              <View style={[styles.track, { backgroundColor: ui.divider }]}>
                <View
                  style={[
                    styles.activeTrack,
                    { width: formalityPercent as any, backgroundColor: '#3B82F6' },
                  ]}
                />
                <View
                  style={[
                    styles.thumb,
                    { left: formalityPercent as any, borderColor: '#3B82F6' },
                  ]}
                />
              </View>
              <Text style={[styles.axisLabel, { color: ui.secondaryText }]}>正式</Text>
              <View style={[styles.badgeContainer, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                <Text style={[styles.scoreBadge, { color: '#3B82F6' }]}>{clampedFormality}</Text>
              </View>
            </View>
          ) : null}

          {/* 強烈度 (Intensity): 微妙 <-> 強烈 */}
          {hasIntensity ? (
            <View style={[styles.meterRow, hasFormality ? { marginTop: 10 } : null]}>
              <Text style={[styles.axisLabel, { color: ui.secondaryText }]}>微妙</Text>
              <View style={[styles.track, { backgroundColor: ui.divider }]}>
                <View
                  style={[
                    styles.activeTrack,
                    { width: intensityPercent as any, backgroundColor: '#F59E0B' },
                  ]}
                />
                <View
                  style={[
                    styles.thumb,
                    { left: intensityPercent as any, borderColor: '#F59E0B' },
                  ]}
                />
              </View>
              <Text style={[styles.axisLabel, { color: ui.secondaryText }]}>強烈</Text>
              <View style={[styles.badgeContainer, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                <Text style={[styles.scoreBadge, { color: '#F59E0B' }]}>{clampedIntensity}</Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Insider Insight 語感解析 */}
      {insiderInsight ? (
        <View style={[styles.insightContainer, !hasLevers && { marginTop: 0 }]}>
          <Text
            style={[
              styles.insightText,
              {
                color: ui.noteText,
                fontSize: Math.round(16 * fontScale),
                lineHeight: Math.round(24 * fontScale),
                paddingRight: textWrapGuard,
              },
            ]}
            onTextLayout={onTextLayout}
          >
            {insiderInsight}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  leversCard: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  axisLabel: {
    fontSize: 12,
    fontWeight: '600',
    width: 32,
    textAlign: 'center',
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 8,
    position: 'relative',
    justifyContent: 'center',
  },
  activeTrack: {
    height: 4,
    borderRadius: 2,
    position: 'absolute',
    left: 0,
  },
  thumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    marginLeft: -6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1.5,
    elevation: 2,
  },
  badgeContainer: {
    width: 24,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  scoreBadge: {
    fontSize: 11,
    fontWeight: '700',
  },
  insightContainer: {
    marginTop: 2,
  },
  insightText: {
    letterSpacing: -0.2,
  },
});
