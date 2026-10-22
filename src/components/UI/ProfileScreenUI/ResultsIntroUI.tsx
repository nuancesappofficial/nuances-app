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
import {
  TwentyFirstCardFace,
  type CardScreenCenter,
} from './PaywallHeroUI';

type Props = {
  cards: ResultsIntroCard[];
  // 使用者正要建的那張卡（第 21 張）。
  nextWord: string;
  nextSourceLabel: string;
  signature: string;
  // 實際建過的卡數（入門額度），「少切換 App」用這個數字。
  createdCount: number;
  uiLanguage: UILanguage;
  // paywall 上第 21 張卡的中心；結尾把卡片移過去交接。還沒量到就原地交接。
  targetCenter: CardScreenCenter | null;
  // 卡片開始移動時通知 paywall 淡入。
  onReveal: (durationMs: number) => void;
  // completed：播完並交接給 paywall 的卡；false 表示使用者點了略過。
  onFinish: (completed: boolean) => void;
};

const ACCENT = '#4EAFF4';
const NAVY = '#02213D';
const CARD_WIDTH = 132;
const CARD_HEIGHT = 172;
const CARD_GAP = 14;
const STEP = CARD_WIDTH + CARD_GAP;

type RowState = 'idle' | 'active' | 'done';

// 輪播目前停在第幾張（1 起算）。數字只在這個小元件裡更新，不讓整個畫面跟著重畫。
function useFoundCount(position: Animated.Value, lastIndex: number) {
  const [found, setFound] = React.useState(1);
  React.useEffect(() => {
    let last = 1;
    const id = position.addListener(({ value }) => {
      const next = Math.max(0, Math.min(lastIndex, Math.round(value))) + 1;
      if (next !== last) {
        last = next;
        setFound(next);
      }
    });
    return () => position.removeListener(id);
  }, [lastIndex, position]);
  return found;
}

function FoundValue({
  position,
  lastIndex,
  done,
}: {
  position: Animated.Value;
  lastIndex: number;
  done: boolean;
}) {
  const found = useFoundCount(position, lastIndex);
  return <>{done ? lastIndex + 1 : found}</>;
}

function FoundCounter({
  position,
  lastIndex,
  done,
  uiLanguage,
}: {
  position: Animated.Value;
  lastIndex: number;
  done: boolean;
  uiLanguage: UILanguage;
}) {
  const found = useFoundCount(position, lastIndex);
  return (
    <Text style={styles.counter} maxFontSizeMultiplier={1.2}>
      {tUI(
        uiLanguage,
        done
          ? 'settings.membership.intro.foundDone'
          : 'settings.membership.intro.found'
      ).replace('{count}', String(done ? lastIndex + 1 : found))}
    </Text>
  );
}

// 從 0 數到 to（先快後慢）。只有這個數字會重畫。
function CountUpValue({ to, durationMs }: { to: number; durationMs: number }) {
  const [value, setValue] = React.useState(0);
  React.useEffect(() => {
    const startedAt = Date.now();
    let frame: number | null = null;
    const step = () => {
      const k = Math.min(1, (Date.now() - startedAt) / durationMs);
      setValue(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [durationMs, to]);
  return <>{value}</>;
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
  value: React.ReactNode;
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

// 輪播軌道：插值只建一次，整條在原生端跑；父元件重畫時這裡不會跟著重畫。
const CarouselTrack = React.memo(function CarouselTrack({
  cards,
  nextWord,
  nextSourceLabel,
  signature,
  position,
  trackOpacity,
  othersOpacity,
  aura,
  handoff,
  handoffOffset,
  nextCardRef,
  width,
}: {
  cards: ResultsIntroCard[];
  nextWord: string;
  nextSourceLabel: string;
  signature: string;
  position: Animated.Value;
  trackOpacity: Animated.Value;
  // 結尾時其他卡片淡出，只留第 21 張。
  othersOpacity: Animated.Value;
  // 0 → 1：虛線卡亮起金色光暈並變成金邊卡。
  aura: Animated.Value;
  // 0 → 1：卡片移到 paywall 的位置並轉成同樣的角度。
  handoff: Animated.Value;
  handoffOffset: Animated.ValueXY;
  nextCardRef: React.RefObject<View | null>;
  width: number;
}) {
  const lastIndex = cards.length - 1;
  const animated = React.useMemo(() => {
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
    const firstX = width / 2 - CARD_WIDTH / 2;
    return {
      track: {
        opacity: trackOpacity,
        transform: [
          {
            translateX: position.interpolate({
              inputRange: [0, 1],
              outputRange: [firstX, firstX - STEP],
              extrapolate: 'extend' as const,
            }),
          },
        ],
      },
      // 結尾時其他卡片跟著淡出（亮度乘上 othersOpacity）。
      cards: cards.map((_, index) => {
        const style = itemStyle(index, false);
        return {
          ...style,
          opacity: Animated.multiply(style.opacity, othersOpacity),
        };
      }),
      nextCard: itemStyle(cards.length, true),
      dashedFace: {
        opacity: aura.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
      },
      goldFace: { opacity: aura },
      auraGlow: {
        opacity: aura,
        transform: [
          {
            scale: aura.interpolate({
              inputRange: [0, 1],
              outputRange: [0.85, 1],
            }),
          },
        ],
      },
      handoff: {
        transform: [
          { translateX: handoffOffset.x },
          { translateY: handoffOffset.y },
          {
            rotate: handoff.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '-4deg'],
            }),
          },
        ],
      },
      // 虛線第 21 張到中間時，外框換成藍色（用疊一層藍框的透明度做，才能在原生端跑）。
      nextCardHighlight: {
        opacity: position.interpolate({
          inputRange: [lastIndex + 0.5, lastIndex + 1],
          outputRange: [0, 1],
          extrapolate: 'clamp' as const,
        }),
      },
    };
  }, [
    aura,
    cards,
    handoff,
    handoffOffset,
    lastIndex,
    othersOpacity,
    position,
    trackOpacity,
    width,
  ]);

  return (
    <Animated.View style={[styles.track, animated.track]}>
      {cards.map((card, index) => (
        <Animated.View
          key={`${card.createdAt}-${index}`}
          style={[styles.card, animated.cards[index]]}
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
      <Animated.View style={[styles.nextSlot, animated.nextCard]}>
        <Animated.View
          ref={nextCardRef}
          collapsable={false}
          style={[styles.nextSlotInner, animated.handoff]}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.auraGlow, animated.auraGlow]}
          />
          <Animated.View style={[styles.nextCard, animated.dashedFace]}>
            <Animated.View
              pointerEvents="none"
              style={[styles.nextCardHighlight, animated.nextCardHighlight]}
            />
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
          <Animated.View
            pointerEvents="none"
            style={[styles.goldFace, animated.goldFace]}
          >
            <TwentyFirstCardFace
              word={nextWord}
              sourceLabel={nextSourceLabel}
              signature={signature}
            />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
});

export default function ResultsIntroUI({
  cards,
  nextWord,
  nextSourceLabel,
  signature,
  createdCount,
  uiLanguage,
  targetCenter,
  onReveal,
  onFinish,
}: Props) {
  const { width } = useWindowDimensions();
  const timeline = React.useMemo(() => buildResultsIntroTimeline(), []);
  const lastIndex = cards.length - 1;
  const position = React.useRef(new Animated.Value(0)).current;
  const trackOpacity = React.useRef(new Animated.Value(0)).current;
  const titleOpacity = React.useRef(new Animated.Value(0)).current;
  const chromeOpacity = React.useRef(new Animated.Value(1)).current;
  const aura = React.useRef(new Animated.Value(0)).current;
  const handoff = React.useRef(new Animated.Value(0)).current;
  const handoffOffset = React.useRef(new Animated.ValueXY({ x: 0, y: 0 }))
    .current;
  const nextCardRef = React.useRef<View | null>(null);
  // 計時器讀最新的值，不讓它們重設時間軸。
  const targetCenterRef = React.useRef(targetCenter);
  targetCenterRef.current = targetCenter;
  const onRevealRef = React.useRef(onReveal);
  onRevealRef.current = onReveal;
  const onFinishRef = React.useRef(onFinish);
  onFinishRef.current = onFinish;
  const finishedRef = React.useRef(false);

  const [titleKey, setTitleKey] = React.useState<UIStringKey>(
    'settings.membership.intro.title'
  );
  const [hintKey, setHintKey] = React.useState<UIStringKey | null>(null);
  const [collectDone, setCollectDone] = React.useState(false);
  const [rowStates, setRowStates] = React.useState<[RowState, RowState]>([
    'idle',
    'idle',
  ]);

  // 不依賴父元件每次重畫都會換新的 onFinish，避免時間軸被重設。
  const finish = React.useCallback((completed: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinishRef.current(completed);
  }, []);

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
        useNativeDriver: true,
      }).start();
      // 輪盤：一開始最快，一路減速，自然停在最近建的那張。
      Animated.timing(position, {
        toValue: lastIndex,
        duration: timeline.carouselSpin,
        delay: timeline.carouselSpinDelay,
        easing: Easing.bezier(0.18, 0.45, 0.1, 1),
        useNativeDriver: true,
      }).start();
    });
    at(timeline.collectDone, () => {
      setRow(0, 'done');
      setCollectDone(true);
    });
    at(timeline.switchStart, () => {
      setRow(1, 'active');
      setHintKey('settings.membership.intro.hintSwitch');
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
        useNativeDriver: true,
      }).start();
    });
    // 停在第 21 張：亮起金色光暈，變成金邊卡。
    at(timeline.auraStart, () =>
      Animated.timing(aura, {
        toValue: 1,
        duration: timeline.auraDuration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start()
    );
    // 卡片留著，其他東西淡出。
    at(timeline.chromeFadeStart, () =>
      Animated.timing(chromeOpacity, {
        toValue: 0,
        duration: timeline.chromeFadeDuration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start()
    );
    // 卡片移到 paywall 上那張卡的位置、轉成同樣角度，paywall 同時淡入。
    at(timeline.handoffStart, () => {
      onRevealRef.current(timeline.handoffDuration);
      const move = (dx: number, dy: number) =>
        Animated.parallel([
          Animated.timing(handoffOffset, {
            toValue: { x: dx, y: dy },
            duration: timeline.handoffDuration,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            useNativeDriver: true,
          }),
          Animated.timing(handoff, {
            toValue: 1,
            duration: timeline.handoffDuration,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            useNativeDriver: true,
          }),
        ]).start();
      const target = targetCenterRef.current;
      if (!target || !nextCardRef.current) {
        move(0, 0);
        return;
      }
      nextCardRef.current.measureInWindow((x, y, w, h) => {
        move(target.x - (x + w / 2), target.y - (y + h / 2));
      });
    });
    at(timeline.finish, () => finish(true));

    return () => {
      timers.forEach(clearTimeout);
      position.stopAnimation();
    };
  }, [
    aura,
    chromeOpacity,
    finish,
    handoff,
    handoffOffset,
    lastIndex,
    position,
    timeline,
    titleOpacity,
    trackOpacity,
  ]);

  return (
    <Pressable
      style={styles.container}
      onPress={() => finish(false)}
      accessibilityRole="button"
      accessibilityLabel={tUI(uiLanguage, 'settings.membership.intro.skip')}
    >
      {/* 背景和文字在結尾淡出，露出底下已經排好的 paywall。 */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: chromeOpacity }]}
      >
        <LinearGradient
          colors={['#0B3A63', NAVY]}
          locations={[0, 0.7]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[styles.chrome, { opacity: chromeOpacity }]}>
        <Animated.Text
          style={[styles.title, { opacity: titleOpacity }]}
          maxFontSizeMultiplier={1.2}
        >
          {tUI(uiLanguage, titleKey)}
        </Animated.Text>
        <Text style={styles.hint} maxFontSizeMultiplier={1.2}>
          {hintKey ? tUI(uiLanguage, hintKey) : ''}
        </Text>
      </Animated.View>

      <View style={styles.stage}>
        <CarouselTrack
          cards={cards}
          nextWord={nextWord}
          nextSourceLabel={nextSourceLabel}
          signature={signature}
          position={position}
          trackOpacity={trackOpacity}
          othersOpacity={chromeOpacity}
          aura={aura}
          handoff={handoff}
          handoffOffset={handoffOffset}
          nextCardRef={nextCardRef}
          width={width}
        />
      </View>

      <Animated.View style={[styles.chrome, { opacity: chromeOpacity }]}>

      {rowStates[0] === 'idle' ? (
        <Text style={styles.counter} />
      ) : (
        <FoundCounter
          position={position}
          lastIndex={lastIndex}
          done={collectDone}
          uiLanguage={uiLanguage}
        />
      )}

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
          value={
            <FoundValue
              position={position}
              lastIndex={lastIndex}
              done={collectDone}
            />
          }
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
          value={
            <CountUpValue
              to={createdCount}
              durationMs={timeline.switchDuration}
            />
          }
          unit={tUI(uiLanguage, 'settings.membership.intro.unitTimes')}
        />
      </View>
      </Animated.View>

      <Animated.Text
        style={[styles.skip, { opacity: chromeOpacity }]}
        maxFontSizeMultiplier={1.2}
      >
        {tUI(uiLanguage, 'settings.membership.intro.skip')}
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 22,
  },
  chrome: {
    alignSelf: 'stretch',
    alignItems: 'center',
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
    // 不裁切：結尾第 21 張卡會移出輪播區、疊在其他東西上面。
    zIndex: 2,
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
  nextSlot: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  nextSlotInner: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 停在第 21 張時的金色光暈。
  auraGlow: {
    position: 'absolute',
    top: -16,
    left: -16,
    right: -16,
    bottom: -16,
    borderRadius: 30,
    backgroundColor: 'rgba(245,181,63,0.22)',
    shadowColor: '#F5B53F',
    shadowOpacity: 0.9,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  // 和 paywall 第 21 張卡同尺寸（136×174），交接時看不出接縫。
  goldFace: {
    position: 'absolute',
    width: 136,
    height: 174,
  },
  nextCard: {
    ...StyleSheet.absoluteFillObject,
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
  nextCardHighlight: {
    position: 'absolute',
    top: -1.5,
    left: -1.5,
    right: -1.5,
    bottom: -1.5,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
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
