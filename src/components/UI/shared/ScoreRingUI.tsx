import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

export const SCORE_RING_SIZE = 88;
const RING_STROKE = 8;
const RING_RADIUS = (SCORE_RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
export const SCORE_RING_DRAW_MS = 850;

// Ring + count-up run on the UI thread (Reanimated), so a busy JS thread
// during a result reveal can't make them stutter.
const RingCircle = Reanimated.createAnimatedComponent(Circle);
const RingNumber = Reanimated.createAnimatedComponent(TextInput);

type Props = {
  score: number;
  /** Increment to (re)play the draw animation; 0 = show the final state. */
  playId: number;
  delayMs?: number;
  color: string;
  trackColor: string;
  textColor: string;
};

export default function ScoreRingUI({
  score,
  playId,
  delayMs = 0,
  color,
  trackColor,
  textColor,
}: Props) {
  const progress = useSharedValue(1);

  React.useEffect(() => {
    if (!playId) return;
    progress.value = 0;
    progress.value = withDelay(
      delayMs,
      withTiming(1, {
        duration: SCORE_RING_DRAW_MS,
        easing: Easing.bezier(0.3, 0.7, 0.2, 1),
      })
    );
    return () => cancelAnimation(progress);
  }, [playId, delayMs, progress]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - (score / 100) * progress.value),
  }));
  const numberProps = useAnimatedProps(
    () =>
      ({
        text: String(Math.round(score * progress.value)),
      }) as any
  );

  return (
    <View style={styles.ring}>
      <View style={styles.svg}>
        <Svg width={SCORE_RING_SIZE} height={SCORE_RING_SIZE}>
          <Circle
            cx={SCORE_RING_SIZE / 2}
            cy={SCORE_RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={trackColor}
            strokeWidth={RING_STROKE}
            fill="none"
          />
          <RingCircle
            cx={SCORE_RING_SIZE / 2}
            cy={SCORE_RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={color}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            animatedProps={ringProps}
          />
        </Svg>
      </View>
      <RingNumber
        editable={false}
        pointerEvents="none"
        underlineColorAndroid="transparent"
        defaultValue={String(score)}
        animatedProps={numberProps}
        style={[styles.number, { color: textColor }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: SCORE_RING_SIZE,
    height: SCORE_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ rotate: '-90deg' }],
  },
  number: {
    width: SCORE_RING_SIZE,
    padding: 0,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
