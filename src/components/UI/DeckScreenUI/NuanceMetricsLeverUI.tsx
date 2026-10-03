import React from 'react';
import { View, Text, StyleSheet, type DimensionValue } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  FadeInDown,
  runOnJS,
  interpolateColor,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const COLOR_STOPS = [0, 0.5, 1];
const COLOR_OUTPUT_RANGE = ['#4EAFF4', '#FB923C', '#FF6B6B'];

type LeverColorToken = {
  main: string;
  bg: string;
};

const LEVER_LOW_COLOR: LeverColorToken = {
  main: '#4EAFF4',
  bg: 'rgba(78, 175, 244, 0.12)',
};

const LEVER_MID_COLOR: LeverColorToken = {
  main: '#FB923C',
  bg: 'rgba(251, 146, 60, 0.12)',
};

const LEVER_HIGH_COLOR: LeverColorToken = {
  main: '#FF6B6B',
  bg: 'rgba(255, 107, 107, 0.12)',
};

export function getLeverColorToken(score: number | null): LeverColorToken {
  if (typeof score !== 'number' || Number.isNaN(score) || score <= 3) {
    return LEVER_LOW_COLOR;
  }
  if (score <= 6) {
    return LEVER_MID_COLOR;
  }
  return LEVER_HIGH_COLOR;
}

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
  animate?: boolean;
  onTextLayout?: (event: any) => void;
};

export const NuanceMetricsLeverUI: React.FC<NuanceMetricsLeverUIProps> = ({
  formality,
  intensity,
  insiderInsight,
  ui,
  fontScale = 1,
  textWrapGuard = 0,
  animate = false,
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

  const formalityColor = React.useMemo(
    () => getLeverColorToken(clampedFormality),
    [clampedFormality]
  );
  const intensityColor = React.useMemo(
    () => getLeverColorToken(clampedIntensity),
    [clampedIntensity]
  );

  const targetFormalityRatio =
    clampedFormality !== null ? (clampedFormality - 1) / 9 : 0;
  const targetIntensityRatio =
    clampedIntensity !== null ? (clampedIntensity - 1) / 9 : 0;

  const formalityProgress = useSharedValue(animate ? 0 : targetFormalityRatio);
  const intensityProgress = useSharedValue(animate ? 0 : targetIntensityRatio);
  const badgeProgress = useSharedValue(animate ? 0 : 1);

  const triggerHaptic = React.useCallback(() => {
    void Haptics.selectionAsync();
  }, []);

  React.useEffect(() => {
    if (animate) {
      formalityProgress.value = 0;
      intensityProgress.value = 0;
      badgeProgress.value = 0;

      const onFinished = (finished?: boolean) => {
        'worklet';
        if (finished) {
          runOnJS(triggerHaptic)();
        }
      };

      if (hasIntensity) {
        formalityProgress.value = withTiming(targetFormalityRatio, {
          duration: 520,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        });
        intensityProgress.value = withDelay(
          80,
          withTiming(
            targetIntensityRatio,
            {
              duration: 520,
              easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            },
            onFinished
          )
        );
      } else {
        formalityProgress.value = withTiming(
          targetFormalityRatio,
          {
            duration: 520,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          },
          onFinished
        );
      }

      badgeProgress.value = withDelay(
        240,
        withTiming(1, {
          duration: 320,
          easing: Easing.out(Easing.ease),
        })
      );
    } else {
      formalityProgress.value = targetFormalityRatio;
      intensityProgress.value = targetIntensityRatio;
      badgeProgress.value = 1;
    }
  }, [animate, targetFormalityRatio, targetIntensityRatio, hasIntensity, triggerHaptic]);

  const animatedFormalityTrackStyle = useAnimatedStyle(() => {
    const widthPercent = `${Math.max(0, Math.min(100, formalityProgress.value * 100))}%` as DimensionValue;
    if (!animate) {
      return {
        width: widthPercent,
        backgroundColor: formalityColor.main,
      };
    }
    const currentColor = interpolateColor(
      formalityProgress.value,
      COLOR_STOPS,
      COLOR_OUTPUT_RANGE
    );
    return {
      width: widthPercent,
      backgroundColor: currentColor,
    };
  });

  const animatedFormalityThumbStyle = useAnimatedStyle(() => {
    const leftPercent = `${Math.max(0, Math.min(100, formalityProgress.value * 100))}%` as DimensionValue;
    if (!animate) {
      return {
        left: leftPercent,
        borderColor: formalityColor.main,
      };
    }
    const currentColor = interpolateColor(
      formalityProgress.value,
      COLOR_STOPS,
      COLOR_OUTPUT_RANGE
    );
    return {
      left: leftPercent,
      borderColor: currentColor,
    };
  });

  const animatedIntensityTrackStyle = useAnimatedStyle(() => {
    const widthPercent = `${Math.max(0, Math.min(100, intensityProgress.value * 100))}%` as DimensionValue;
    if (!animate) {
      return {
        width: widthPercent,
        backgroundColor: intensityColor.main,
      };
    }
    const currentColor = interpolateColor(
      intensityProgress.value,
      COLOR_STOPS,
      COLOR_OUTPUT_RANGE
    );
    return {
      width: widthPercent,
      backgroundColor: currentColor,
    };
  });

  const animatedIntensityThumbStyle = useAnimatedStyle(() => {
    const leftPercent = `${Math.max(0, Math.min(100, intensityProgress.value * 100))}%` as DimensionValue;
    if (!animate) {
      return {
        left: leftPercent,
        borderColor: intensityColor.main,
      };
    }
    const currentColor = interpolateColor(
      intensityProgress.value,
      COLOR_STOPS,
      COLOR_OUTPUT_RANGE
    );
    return {
      left: leftPercent,
      borderColor: currentColor,
    };
  });

  const animatedBadgeStyle = useAnimatedStyle(() => ({
    opacity: badgeProgress.value,
    transform: [{ scale: 0.8 + 0.2 * badgeProgress.value }],
  }));

  return (
    <View style={styles.container}>
      {/* 雙軸量表控制條 (Dual-axis Lever / Slider) */}
      {hasLevers ? (
        <Reanimated.View
          {...(animate ? { entering: FadeInDown.duration(280) } : {})}
          style={styles.leversContainer}
        >
          {/* 正式度 (Formality): 隨意 <-> 正式 */}
          {hasFormality ? (
            <View style={styles.meterRow}>
              <Text style={[styles.axisLabel, { color: ui.secondaryText }]}>隨意</Text>
              <View style={[styles.track, { backgroundColor: ui.divider }]}>
                <Reanimated.View
                  style={[
                    styles.activeTrack,
                    animatedFormalityTrackStyle,
                  ]}
                />
                <Reanimated.View
                  style={[
                    styles.thumb,
                    animatedFormalityThumbStyle,
                  ]}
                />
              </View>
              <Text style={[styles.axisLabel, { color: ui.secondaryText }]}>正式</Text>
              <Reanimated.View
                style={[
                  styles.badgeContainer,
                  { backgroundColor: formalityColor.bg },
                  animatedBadgeStyle,
                ]}
              >
                <Text style={[styles.scoreBadge, { color: formalityColor.main }]}>
                  {clampedFormality}
                </Text>
              </Reanimated.View>
            </View>
          ) : null}

          {/* 強烈度 (Intensity): 微妙 <-> 強烈 */}
          {hasIntensity ? (
            <View style={[styles.meterRow, hasFormality ? { marginTop: 10 } : null]}>
              <Text style={[styles.axisLabel, { color: ui.secondaryText }]}>微妙</Text>
              <View style={[styles.track, { backgroundColor: ui.divider }]}>
                <Reanimated.View
                  style={[
                    styles.activeTrack,
                    animatedIntensityTrackStyle,
                  ]}
                />
                <Reanimated.View
                  style={[
                    styles.thumb,
                    animatedIntensityThumbStyle,
                  ]}
                />
              </View>
              <Text style={[styles.axisLabel, { color: ui.secondaryText }]}>強烈</Text>
              <Reanimated.View
                style={[
                  styles.badgeContainer,
                  { backgroundColor: intensityColor.bg },
                  animatedBadgeStyle,
                ]}
              >
                <Text style={[styles.scoreBadge, { color: intensityColor.main }]}>
                  {clampedIntensity}
                </Text>
              </Reanimated.View>
            </View>
          ) : null}
        </Reanimated.View>
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
  leversContainer: {
    paddingVertical: 6,
    marginBottom: 6,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  axisLabel: {
    fontSize: 11,
    fontWeight: '500',
    width: 30,
    textAlign: 'center',
    opacity: 0.72,
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

