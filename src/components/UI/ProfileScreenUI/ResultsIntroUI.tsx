import React from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tUI, type UIStringKey } from '../../../i18n/uiLanguage';
import type { UILanguage } from '@services/settings/userSettings';
import {
  buildResultsIntroTimeline,
  resolveCarouselItemStyle,
  type ResultsIntroCard,
} from '../../../features/subscription/resultsIntro';

type Props = {
  cards: ResultsIntroCard[];
  // 使用者正要建的字（虛線的第 21 張）。
  nextWord: string;
  // 實際建過的卡數（入門額度），「少切換 App」用這個數字。
  createdCount: number;
  uiLanguage: UILanguage;
  // fromNextCard：播完並停在第 21 張（接翻面）；false 表示使用者點了略過。
  onFinish: (fromNextCard: boolean) => void;
};

const ACCENT = '#4EAFF4';
const NAVY = '#02213D';
const CARD_WIDTH = 132;
const CARD_HEIGHT = 172;
const CARD_GAP = 14;
const STEP = CARD_WIDTH + CARD_GAP;

type RowState = 'idle' | 'active' | 'done';

function useCountUp() {
  const [value, setValue] = React.useState(0);
  const frameRef = React.useRef<number | null>(null);
  const start = React.useCallback((to: number, durationMs: number) => {
    const startedAt = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - startedAt) / durationMs);
      setValue(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
  }, []);
  React.useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    },
    []
  );
  return [value, start] as const;
}

function RowIcon({ state }: { state: RowState }) {
  const spin = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (state !== 'active') return undefined;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin, state]);

  if (state === 'done') {
    return (
      <View style={[styles.rowIcon, styles.rowIconDone]}>
        <Text style={styles.rowIconCheck}>✓</Text>
      </View>
    );
  }
  return (
    <Animated.View
      style={[
        styles.rowIcon,
        state === 'active' ? styles.rowIconActive : null,
        state === 'active'
          ? {
              transform: [
                {
                  rotate: spin.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            }
          : null,
      ]}
    />
  );
}

function IntroRow({
  state,
  label,
  value,
  unit,
}: {
  state: RowState;
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <View style={[styles.row, state === 'idle' ? styles.rowIdle : null]}>
      <RowIcon state={state} />
      <Text
        style={[styles.rowText, state === 'active' ? styles.rowTextActive : null]}
        maxFontSizeMultiplier={1.2}
      >
        {label}
      </Text>
      {state !== 'idle' ? (
        <Text
          style={[
            styles.rowValue,
            state === 'active' ? styles.rowValueActive : null,
          ]}
          maxFontSizeMultiplier={1.2}
        >
          {value}
          <Text style={styles.rowUnit}> {unit}</Text>
        </Text>
      ) : null}
    </View>
  );
}

export default function ResultsIntroUI({
  cards,
  nextWord,
  createdCount,
  uiLanguage,
  onFinish,
}: Props) {
  const { width } = useWindowDimensions();
  const timeline = React.useMemo(() => buildResultsIntroTimeline(), []);
  const lastIndex = cards.length - 1;
  const position = React.useRef(new Animated.Value(0)).current;
  const trackOpacity = React.useRef(new Animated.Value(0)).current;
  const titleOpacity = React.useRef(new Animated.Value(0)).current;
  const finishedRef = React.useRef(false);

  const [titleKey, setTitleKey] = React.useState<UIStringKey>(
    'settings.membership.intro.title'
  );
  const [hintKey, setHintKey] = React.useState<UIStringKey | null>(null);
  const [foundCount, setFoundCount] = React.useState(0);
  const [collectDone, setCollectDone] = React.useState(false);
  const [rowStates, setRowStates] = React.useState<[RowState, RowState]>([
    'idle',
    'idle',
  ]);
  const [switchCount, startSwitchCount] = useCountUp();
  const [nextCentered, setNextCentered] = React.useState(false);

  const finish = React.useCallback(
    (fromNextCard: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinish(fromNextCard);
    },
    [onFinish]
  );

  React.useEffect(() => {
    // 「已找到 N 張卡」跟著輪播目前停在哪一張跳動；值有變才更新。
    let lastFound = 0;
    let lastCentered = false;
    const id = position.addListener(({ value }) => {
      const found =
        Math.max(0, Math.min(lastIndex, Math.round(value))) + 1;
      const centered = value > lastIndex + 0.5;
      if (found !== lastFound) {
        lastFound = found;
        setFoundCount(found);
      }
      if (centered !== lastCentered) {
        lastCentered = centered;
        setNextCentered(centered);
      }
    });
    return () => position.removeListener(id);
  }, [lastIndex, position]);

  React.useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const setRow = (index: 0 | 1, state: RowState) =>
      setRowStates((prev) => {
        const next: [RowState, RowState] = [prev[0], prev[1]];
        next[index] = state;
        return next;
      });

    at(timeline.titleIn, () =>
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start()
    );
    at(timeline.collectStart, () => {
      setRow(0, 'active');
      setHintKey('settings.membership.intro.hintCollect');
      Animated.timing(trackOpacity, {
        toValue: 1,
        duration: timeline.carouselFadeIn,
        useNativeDriver: false,
      }).start();
      // 輪盤：一開始最快，一路減速，自然停在最近建的那張。
      Animated.timing(position, {
        toValue: lastIndex,
        duration: timeline.carouselSpin,
        delay: timeline.carouselSpinDelay,
        easing: Easing.bezier(0.18, 0.45, 0.1, 1),
        useNativeDriver: false,
      }).start();
    });
    at(timeline.collectDone, () => {
      setRow(0, 'done');
      setCollectDone(true);
    });
    at(timeline.switchStart, () => {
      setRow(1, 'active');
      setHintKey('settings.membership.intro.hintSwitch');
      startSwitchCount(createdCount, timeline.switchDuration);
    });
    at(timeline.switchDone, () => setRow(1, 'done'));
    at(timeline.wrapUp, () => {
      setTitleKey('settings.membership.intro.titleDone');
      setHintKey('settings.membership.intro.hintDone');
    });
    at(timeline.slideToNext, () => {
      setHintKey('settings.membership.intro.hintNext');
      Animated.timing(position, {
        toValue: lastIndex + 1,
        duration: timeline.slideToNextDuration,
        easing: Easing.bezier(0.25, 0.6, 0.2, 1),
        useNativeDriver: false,
      }).start();
    });
    at(timeline.finish, () => finish(true));

    return () => {
      timers.forEach(clearTimeout);
      position.stopAnimation();
    };
  }, [
    createdCount,
    finish,
    lastIndex,
    position,
    startSwitchCount,
    timeline,
    titleOpacity,
    trackOpacity,
  ]);

  const translateX = position.interpolate({
    inputRange: [0, 1],
    outputRange: [width / 2 - CARD_WIDTH / 2, width / 2 - CARD_WIDTH / 2 - STEP],
    extrapolate: 'extend',
  });

  const itemStyle = (index: number, isNextCard: boolean) => {
    const near = resolveCarouselItemStyle(0, isNextCard);
    const far = resolveCarouselItemStyle(1, isNextCard);
    const range = {
      inputRange: [index - 1, index, index + 1],
      extrapolate: 'clamp' as const,
    };
    return {
      opacity: position.interpolate({
        ...range,
        outputRange: [far.opacity, near.opacity, far.opacity],
      }),
      transform: [
        {
          translateY: position.interpolate({
            ...range,
            outputRange: [far.translateY, near.translateY, far.translateY],
          }),
        },
        {
          scale: position.interpolate({
            ...range,
            outputRange: [far.scale, near.scale, far.scale],
          }),
        },
      ],
    };
  };

  return (
    <Pressable
      style={styles.container}
      onPress={() => finish(false)}
      accessibilityRole="button"
      accessibilityLabel={tUI(uiLanguage, 'settings.membership.intro.skip')}
    >
      <LinearGradient
        pointerEvents="none"
        colors={['#0B3A63', NAVY]}
        locations={[0, 0.7]}
        style={StyleSheet.absoluteFill}
      />
      <Animated.Text
        style={[styles.title, { opacity: titleOpacity }]}
        maxFontSizeMultiplier={1.2}
      >
        {tUI(uiLanguage, titleKey)}
      </Animated.Text>
      <Text style={styles.hint} maxFontSizeMultiplier={1.2}>
        {hintKey ? tUI(uiLanguage, hintKey) : ''}
      </Text>

      <View style={styles.stage}>
        <Animated.View
          style={[
            styles.track,
            { opacity: trackOpacity, transform: [{ translateX }] },
          ]}
        >
          {cards.map((card, index) => (
            <Animated.View
              key={`${card.createdAt}-${index}`}
              style={[styles.card, itemStyle(index, false)]}
            >
              <View style={styles.sourcePill}>
                <Text style={styles.sourcePillText} numberOfLines={1}>
                  {card.sourceLabel}
                </Text>
              </View>
              <View style={styles.cardWordBox}>
                <Text
                  style={styles.cardWord}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.45}
                  maxFontSizeMultiplier={1}
                >
                  {card.word}
                </Text>
              </View>
              <View style={styles.cardLine} />
              <View style={[styles.cardLine, styles.cardLineShort]} />
            </Animated.View>
          ))}
          <Animated.View
            style={[
              styles.nextCard,
              nextCentered ? styles.nextCardCentered : null,
              itemStyle(cards.length, true),
            ]}
          >
            <Text
              style={styles.nextWord}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.45}
              maxFontSizeMultiplier={1}
            >
              {nextWord}
            </Text>
            <Text style={styles.nextNumber}>#21</Text>
          </Animated.View>
        </Animated.View>
      </View>

      <Text style={styles.counter} maxFontSizeMultiplier={1.2}>
        {rowStates[0] === 'idle'
          ? ''
          : tUI(
              uiLanguage,
              collectDone
                ? 'settings.membership.intro.foundDone'
                : 'settings.membership.intro.found'
            ).replace('{count}', String(collectDone ? cards.length : foundCount))}
      </Text>

      <View style={styles.rows}>
        <IntroRow
          state={rowStates[0]}
          label={tUI(
            uiLanguage,
            rowStates[0] === 'done'
              ? 'settings.membership.intro.collectDone'
              : rowStates[0] === 'active'
                ? 'settings.membership.intro.collectDoing'
                : 'settings.membership.intro.collectIdle'
          )}
          value={collectDone ? cards.length : foundCount}
          unit={tUI(uiLanguage, 'settings.membership.intro.unitWords')}
        />
        <IntroRow
          state={rowStates[1]}
          label={tUI(
            uiLanguage,
            rowStates[1] === 'done'
              ? 'settings.membership.intro.switchDone'
              : rowStates[1] === 'active'
                ? 'settings.membership.intro.switchDoing'
                : 'settings.membership.intro.switchIdle'
          )}
          value={switchCount}
          unit={tUI(uiLanguage, 'settings.membership.intro.unitTimes')}
        />
      </View>

      <Text style={styles.skip} maxFontSizeMultiplier={1.2}>
        {tUI(uiLanguage, 'settings.membership.intro.skip')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 22,
    backgroundColor: NAVY,
  },
  title: {
    minHeight: 26,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  hint: {
    minHeight: 18,
    marginTop: 6,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    textAlign: 'center',
  },
  stage: {
    alignSelf: 'stretch',
    height: 220,
    marginTop: 22,
    marginHorizontal: -22,
    overflow: 'hidden',
  },
  track: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 18,
    padding: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
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
    fontSize: 9,
    fontWeight: '700',
  },
  cardWordBox: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cardWord: {
    color: '#1C2530',
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '800',
    textAlign: 'center',
  },
  cardLine: {
    height: 5,
    marginTop: 5,
    borderRadius: 3,
    backgroundColor: '#EDF0F4',
  },
  cardLineShort: {
    width: '60%',
  },
  nextCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  nextCardCentered: {
    borderColor: 'rgba(78,175,244,0.7)',
  },
  nextWord: {
    alignSelf: 'stretch',
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  nextNumber: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10.5,
    fontWeight: '700',
  },
  counter: {
    minHeight: 18,
    marginTop: 2,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  rows: {
    alignSelf: 'stretch',
    marginTop: 22,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  rowIdle: {
    opacity: 0.3,
  },
  rowIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconActive: {
    borderColor: 'rgba(78,175,244,0.25)',
    borderTopColor: ACCENT,
  },
  rowIconDone: {
    borderColor: ACCENT,
    backgroundColor: ACCENT,
  },
  rowIconCheck: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  rowText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  rowTextActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  rowValue: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  rowValueActive: {
    color: 'rgba(255,255,255,0.55)',
  },
  rowUnit: {
    fontSize: 12,
    fontWeight: '800',
  },
  skip: {
    position: 'absolute',
    bottom: 22,
    left: 0,
    right: 0,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
  },
});
