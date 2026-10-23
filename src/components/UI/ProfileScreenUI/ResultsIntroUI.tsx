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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tUI, type UIStringKey } from '../../../i18n/uiLanguage';
import type { UILanguage } from '@services/settings/userSettings';
import {
  buildResultsIntroTimeline,
  resolveCarouselItemStyle,
  type IntroPronunciationSummary,
  type ResultsIntroCard,
  type ResultsIntroTimeline,
} from '../../../features/subscription/resultsIntro';

// 成果動畫的第 21 張就是 paywall 上那張卡本身（同一個元件）：它是輪播的最後一格，
// 停下來之後就不再移動、不會換臉。這個檔案提供：時間軸控制（useResultsIntro）、排在那張卡左邊的輪播、
// 卡片上下的文字，以及整個螢幕的背景與略過。

const ACCENT = '#4EAFF4';
const NAVY = '#02213D';
const CARD_WIDTH = 132;
const CARD_HEIGHT = 172;
const CARD_GAP = 14;
const STEP = CARD_WIDTH + CARD_GAP;
// paywall 第 21 張卡的外框尺寸（PaywallHeroUI 的 nextCardStage）。
const HERO_WIDTH = 136;
const HERO_HEIGHT = 174;
// 第 21 張卡上方的標題區塊佔多高：above 離卡片 18 + 標題 26 + 間距 6 + 提示 18。
// 捲動區會裁切時，卡片上方至少要留這麼多空間，標題才看得到。
export const INTRO_ABOVE_HERO_HEIGHT = 18 + 26 + 6 + 18;

type RowState = 'idle' | 'active' | 'done';
// 清單三列：單字收集、少切換 App、發音（S5，有發音紀錄才出現）。
type RowStates = [RowState, RowState, RowState];

export type ResultsIntroController = {
  active: boolean;
  cardCount: number;
  position: Animated.Value;
  trackOpacity: Animated.Value;
  titleOpacity: Animated.Value;
  // 動畫的文字、其他卡片和背景；結尾淡出。
  chromeOpacity: Animated.Value;
  backdropIn: Animated.Value;
  // paywall 其他部分；結尾淡入（和 chromeOpacity 交叉淡化）。
  reveal: Animated.Value;
  // 0 → 1：第 21 張被選中，原地往前放大、亮起光暈；交接前回到 0。
  lift: Animated.Value;
  // 0 → 1：金邊卡面疊到虛線剪影上。
  gold: Animated.Value;
  // 0 → 1：原地轉成 paywall 那張卡的 -4°。
  tilt: Animated.Value;
  titleKey: UIStringKey;
  hintKey: UIStringKey | null;
  collectDone: boolean;
  rowStates: RowStates;
  // 發音段正在閃過第幾個字（null＝沒有在閃）。
  pronFlashIndex: number | null;
  timeline: ResultsIntroTimeline;
  pronunciation: IntroPronunciationSummary | null;
  skip: () => void;
};

// 成果動畫的時間軸。active 變成 true 時開始播；播完或略過時呼叫 onFinish。
export function useResultsIntro({
  active,
  cardCount,
  pronunciation,
  onFinish,
}: {
  active: boolean;
  cardCount: number;
  pronunciation: IntroPronunciationSummary | null;
  onFinish: () => void;
}): ResultsIntroController {
  const flashCount = pronunciation?.flashes.length ?? null;
  const timeline = React.useMemo(
    () =>
      buildResultsIntroTimeline(flashCount === null ? null : { flashCount }),
    [flashCount]
  );
  const position = React.useRef(new Animated.Value(0)).current;
  const trackOpacity = React.useRef(new Animated.Value(0)).current;
  const titleOpacity = React.useRef(new Animated.Value(0)).current;
  // 0 → 1：開始時背景淡入（從 paywall 的底色換成動畫的漸層）。
  const backdropIn = React.useRef(new Animated.Value(0)).current;
  const chromeOpacity = React.useRef(new Animated.Value(1)).current;
  const reveal = React.useRef(new Animated.Value(1)).current;
  const lift = React.useRef(new Animated.Value(0)).current;
  const gold = React.useRef(new Animated.Value(0)).current;
  const tilt = React.useRef(new Animated.Value(0)).current;
  const onFinishRef = React.useRef(onFinish);
  onFinishRef.current = onFinish;
  const finishedRef = React.useRef(false);
  const timersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  const [titleKey, setTitleKey] = React.useState<UIStringKey>(
    'settings.membership.intro.title'
  );
  const [hintKey, setHintKey] = React.useState<UIStringKey | null>(null);
  const [collectDone, setCollectDone] = React.useState(false);
  const [pronFlashIndex, setPronFlashIndex] = React.useState<number | null>(
    null
  );
  const [rowStates, setRowStates] = React.useState<RowStates>([
    'idle',
    'idle',
    'idle',
  ]);

  const finish = React.useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    timersRef.current.forEach(clearTimeout);
    onFinishRef.current();
  }, []);

  // 略過：所有東西直接跳到最後的樣子（第 21 張卡、完整的 paywall）。
  const skip = React.useCallback(() => {
    [
      position,
      trackOpacity,
      titleOpacity,
      backdropIn,
      chromeOpacity,
      reveal,
      lift,
      gold,
      tilt,
    ].forEach((value) => value.stopAnimation());
    position.setValue(cardCount);
    chromeOpacity.setValue(0);
    reveal.setValue(1);
    lift.setValue(0);
    gold.setValue(1);
    tilt.setValue(1);
    finish();
  }, [
    backdropIn,
    cardCount,
    chromeOpacity,
    finish,
    gold,
    lift,
    position,
    reveal,
    tilt,
    titleOpacity,
    trackOpacity,
  ]);

  // 開始前就把 paywall 其他部分藏起來，避免第一格畫面閃一下。
  React.useLayoutEffect(() => {
    if (active) reveal.setValue(0);
  }, [active, reveal]);

  React.useEffect(() => {
    if (!active) return undefined;
    // 每次開始播都重新來過（active 可能先變 false 再變回 true）。
    finishedRef.current = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timersRef.current = timers;
    [position, trackOpacity, titleOpacity, backdropIn, lift, gold, tilt].forEach(
      (value) => value.setValue(0)
    );
    chromeOpacity.setValue(1);
    reveal.setValue(0);
    setTitleKey('settings.membership.intro.title');
    setHintKey(null);
    setCollectDone(false);
    setRowStates(['idle', 'idle', 'idle']);
    setPronFlashIndex(null);
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const timing = (
      value: Animated.Value,
      toValue: number,
      duration: number,
      easing: (t: number) => number = Easing.inOut(Easing.quad)
    ) =>
      Animated.timing(value, {
        toValue,
        duration,
        easing,
        useNativeDriver: true,
      });
    const setRow = (index: 0 | 1 | 2, state: RowState) =>
      setRowStates((prev) => {
        const next: RowStates = [prev[0], prev[1], prev[2]];
        next[index] = state;
        return next;
      });

    timing(backdropIn, 1, 300).start();
    at(timeline.titleIn, () => timing(titleOpacity, 1, 600).start());
    at(timeline.collectStart, () => {
      setRow(0, 'active');
      setHintKey('settings.membership.intro.hintCollect');
      timing(trackOpacity, 1, timeline.carouselFadeIn).start();
      // 輪盤：一開始最快，一路減速，直接停在第 21 張（使用者要建的字）。
      Animated.timing(position, {
        toValue: cardCount,
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
    // 發音段：比對發音紀錄 → 揭曉。
    const pron = timeline.pronunciation;
    if (pron) {
      at(pron.start, () => {
        setRow(2, 'active');
        setHintKey('settings.membership.intro.hintPronunciation');
      });
      for (let i = 0; i < pron.flashCount; i += 1) {
        at(pron.flashStart + i * pron.flashEach, () => setPronFlashIndex(i));
      }
      at(pron.revealStart, () => {
        setPronFlashIndex(null);
        setRow(2, 'done');
      });
    }
    at(timeline.wrapUp, () => {
      setTitleKey('settings.membership.intro.titleDone');
      setHintKey('settings.membership.intro.hintDone');
    });
    // 選中第 21 張：位置不動，原地往前放大、亮起金色光暈，金邊卡面疊到剪影上。
    at(timeline.pickStart, () => {
      setHintKey('settings.membership.intro.hintNext');
      Animated.parallel([
        timing(lift, 1, timeline.pickDuration, Easing.out(Easing.back(1.4))),
        timing(gold, 1, timeline.pickDuration, Easing.out(Easing.quad)),
      ]).start();
    });
    // 卡片以外的東西交叉淡化：動畫的文字淡出、paywall 同時淡入。
    at(timeline.crossfadeStart, () =>
      Animated.parallel([
        timing(chromeOpacity, 0, timeline.crossfadeDuration),
        timing(reveal, 1, timeline.crossfadeDuration),
      ]).start()
    );
    // 原地放回原大小、轉成 paywall 那張卡的角度。
    at(timeline.settleStart, () =>
      Animated.parallel([
        timing(lift, 0, timeline.settleDuration),
        timing(tilt, 1, timeline.settleDuration),
      ]).start()
    );
    at(timeline.finish, finish);

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [
    active,
    backdropIn,
    cardCount,
    chromeOpacity,
    finish,
    gold,
    lift,
    position,
    reveal,
    tilt,
    timeline,
    titleOpacity,
    trackOpacity,
  ]);

  return {
    active,
    cardCount,
    position,
    trackOpacity,
    titleOpacity,
    chromeOpacity,
    backdropIn,
    reveal,
    lift,
    gold,
    tilt,
    titleKey,
    hintKey,
    collectDone,
    rowStates,
    pronFlashIndex,
    timeline,
    pronunciation,
    skip,
  };
}

// 第 21 張（paywall 那張卡）在輪播裡的樣式：它是輪播的最後一格，跟其他卡一起從右邊
// 滑進來；離中間越遠越小越暗。停下來時位移是 0，跟 paywall 的位置完全一樣。
export function useIntroCardStyle(intro: ResultsIntroController) {
  return React.useMemo(() => {
    const near = resolveCarouselItemStyle(0, true);
    const far = resolveCarouselItemStyle(1, true);
    const index = intro.cardCount;
    const range = {
      inputRange: [index - 1, index, index + 1],
      extrapolate: 'clamp' as const,
    };
    return {
      opacity: Animated.multiply(
        intro.position.interpolate({
          ...range,
          outputRange: [far.opacity, near.opacity, far.opacity],
        }),
        intro.trackOpacity
      ),
      transform: [
        {
          // 同輪播的公式：左邊 = paywall 卡的左邊 + (index - position) × STEP。
          translateX: intro.position.interpolate({
            inputRange: [index - 1, index],
            outputRange: [STEP, 0],
            extrapolateLeft: 'extend' as const,
            extrapolateRight: 'clamp' as const,
          }),
        },
        {
          scale: intro.position.interpolate({
            ...range,
            outputRange: [far.scale, near.scale, far.scale],
          }),
        },
      ],
    };
  }, [intro.cardCount, intro.position, intro.trackOpacity]);
}

// 被選中時：原地往前放大，最後轉成 -4°。
export function useIntroPickedStyle(intro: ResultsIntroController) {
  return React.useMemo(
    () => ({
      transform: [
        {
          rotate: intro.tilt.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '-4deg'],
          }),
        },
        {
          scale: intro.lift.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.12],
          }),
        },
      ],
    }),
    [intro.lift, intro.tilt]
  );
}

// 卡片下方的影子、金色光暈和虛線剪影（金邊卡面疊在上面）。
export function IntroCardUnderlay({
  intro,
  word,
}: {
  intro: ResultsIntroController;
  word: string;
}) {
  const lastIndex = intro.cardCount - 1;
  const animated = React.useMemo(
    () => ({
      liftShadow: { opacity: intro.lift },
      auraGlow: {
        opacity: intro.lift,
        transform: [
          {
            scale: intro.lift.interpolate({
              inputRange: [0, 1],
              outputRange: [0.85, 1],
            }),
          },
        ],
      },
      // 剪影到中間時外框變藍（疊一層藍框的透明度，才能在原生端跑）。
      highlight: {
        opacity: intro.position.interpolate({
          inputRange: [lastIndex + 0.5, lastIndex + 1],
          outputRange: [0, 1],
          extrapolate: 'clamp' as const,
        }),
      },
    }),
    [intro.lift, intro.position, lastIndex]
  );
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.liftShadow, animated.liftShadow]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.auraGlow, animated.auraGlow]}
      />
      {/* 虛線剪影：跟著輪播滑進來，金邊卡面亮起時疊在它上面。 */}
      <View style={styles.silhouette} pointerEvents="none">
        <Animated.View
          style={[styles.silhouetteHighlight, animated.highlight]}
        />
        <Text
          style={styles.silhouetteWord}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.45}
          maxFontSizeMultiplier={1}
        >
          {word}
        </Text>
        <Text style={styles.silhouetteNumber}>#21</Text>
      </View>
    </>
  );
}

// 排在第 21 張左邊的輪播（使用者自己的卡）。放在 paywall 那張卡的外框裡，
// 所以座標一定對齊；插值只建一次，整條在原生端跑。
export const IntroCarousel = React.memo(function IntroCarousel({
  intro,
  cards,
}: {
  intro: ResultsIntroController;
  cards: ResultsIntroCard[];
}) {
  const { position, trackOpacity, chromeOpacity } = intro;
  const animated = React.useMemo(() => {
    const near = resolveCarouselItemStyle(0, false);
    const far = resolveCarouselItemStyle(1, false);
    // 第 k 張的左邊 = 第 21 張的左邊 + (k - position) × STEP。
    const offset = (HERO_WIDTH - CARD_WIDTH) / 2;
    return {
      track: {
        opacity: trackOpacity,
        transform: [
          {
            translateX: position.interpolate({
              inputRange: [0, 1],
              outputRange: [offset, offset - STEP],
              extrapolate: 'extend' as const,
            }),
          },
        ],
      },
      cards: cards.map((_, index) => {
        const range = {
          inputRange: [index - 1, index, index + 1],
          extrapolate: 'clamp' as const,
        };
        return {
          // 結尾時跟著其他東西淡出。
          opacity: Animated.multiply(
            position.interpolate({
              ...range,
              outputRange: [far.opacity, near.opacity, far.opacity],
            }),
            chromeOpacity
          ),
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
      }),
    };
  }, [cards, chromeOpacity, position, trackOpacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.track, animated.track]}
    >
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
    </Animated.View>
  );
});

// 輪播目前停在第幾張（1 起算，最多到使用者的卡片數）。只在這個小元件裡更新。
function useFoundCount(position: Animated.Value, cardCount: number) {
  const [found, setFound] = React.useState(1);
  React.useEffect(() => {
    let last = 1;
    const id = position.addListener(({ value }) => {
      const next = Math.max(1, Math.min(cardCount, Math.round(value) + 1));
      if (next !== last) {
        last = next;
        setFound(next);
      }
    });
    return () => position.removeListener(id);
  }, [cardCount, position]);
  return found;
}

type UnitLabels = { one: string; other: string };

// 數字加單位；單位依數字選單數或複數（英文、西文、法文會不同）。
function CountWithUnit({ count, unit }: { count: number; unit: UnitLabels }) {
  return (
    <>
      {count}
      <Text style={styles.rowUnit}> {count === 1 ? unit.one : unit.other}</Text>
    </>
  );
}

function FoundValue({
  intro,
  unit,
}: {
  intro: ResultsIntroController;
  unit: UnitLabels;
}) {
  const found = useFoundCount(intro.position, intro.cardCount);
  return (
    <CountWithUnit
      count={intro.collectDone ? intro.cardCount : found}
      unit={unit}
    />
  );
}

function FoundCounter({
  intro,
  uiLanguage,
}: {
  intro: ResultsIntroController;
  uiLanguage: UILanguage;
}) {
  const found = useFoundCount(intro.position, intro.cardCount);
  return (
    <Text style={styles.counter} maxFontSizeMultiplier={1.2}>
      {tUI(
        uiLanguage,
        intro.collectDone
          ? 'settings.membership.intro.foundDone'
          : 'settings.membership.intro.found'
      ).replace(
        '{count}',
        String(intro.collectDone ? intro.cardCount : found)
      )}
    </Text>
  );
}

// 從 0 數到 to（先快後慢）。只有這個數字會重畫。
function CountUpValue({
  to,
  durationMs,
  unit,
  prefix = '',
}: {
  to: number;
  durationMs: number;
  unit: UnitLabels;
  prefix?: string;
}) {
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
  return (
    <>
      {prefix}
      <CountWithUnit count={value} unit={unit} />
    </>
  );
}

function RowIcon({ state }: { state: RowState }) {
  const spin = React.useRef(new Animated.Value(0)).current;
  const spinStyle = React.useMemo(
    () => ({
      transform: [
        {
          rotate: spin.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg'],
          }),
        },
      ],
    }),
    [spin]
  );
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
        state === 'active' ? spinStyle : null,
      ]}
    />
  );
}

function IntroRow({
  state,
  label,
  value,
}: {
  state: RowState;
  label: string;
  value: React.ReactNode;
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
        </Text>
      ) : null}
    </View>
  );
}

// 第 21 張卡上方的標題、下方的計數和清單。以那張卡為基準排版，所以不會壓到卡片。
export function IntroChrome({
  intro,
  createdCount,
  uiLanguage,
}: {
  intro: ResultsIntroController;
  createdCount: number;
  uiLanguage: UILanguage;
}) {
  const { width } = useWindowDimensions();
  // 文字區塊跟螢幕一樣寬，置中在卡片上。
  const span = { left: -(width - HERO_WIDTH) / 2, width };
  const { rowStates, timeline, pronunciation } = intro;
  const pointsUnit = {
    one: tUI(uiLanguage, 'settings.membership.intro.unitPointsOne'),
    other: tUI(uiLanguage, 'settings.membership.intro.unitPoints'),
  };
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.above, span, { opacity: intro.chromeOpacity }]}
      >
        <Animated.Text
          style={[styles.title, { opacity: intro.titleOpacity }]}
          maxFontSizeMultiplier={1.2}
        >
          {tUI(uiLanguage, intro.titleKey)}
        </Animated.Text>
        <Text style={styles.hint} maxFontSizeMultiplier={1.2}>
          {intro.hintKey ? tUI(uiLanguage, intro.hintKey) : ''}
        </Text>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.below, span, { opacity: intro.chromeOpacity }]}
      >
        {/* 發音段開始後，「已找到 N 張卡」這一行讓給發音段：閃過練過的字，揭曉時顯示平均。 */}
        {rowStates[2] !== 'idle' && pronunciation ? (
          <Text style={styles.counter} maxFontSizeMultiplier={1.2}>
            {rowStates[2] === 'done'
              ? pronunciation.mode === 'gain'
                ? tUI(uiLanguage, 'settings.membership.intro.pronRevealAvg')
                    .replace('{first}', String(pronunciation.firstAvg))
                    .replace('{best}', String(pronunciation.bestAvg))
                : ''
              : intro.pronFlashIndex !== null &&
                  pronunciation.flashes[intro.pronFlashIndex]
                ? tUI(uiLanguage, 'settings.membership.intro.pronFlash')
                    .replace('{word}', pronunciation.flashes[intro.pronFlashIndex].word)
                    .replace(
                      '{first}',
                      String(pronunciation.flashes[intro.pronFlashIndex].first)
                    )
                    .replace(
                      '{best}',
                      String(pronunciation.flashes[intro.pronFlashIndex].best)
                    )
                : ''}
          </Text>
        ) : rowStates[0] === 'idle' ? (
          <Text style={styles.counter} />
        ) : (
          <FoundCounter intro={intro} uiLanguage={uiLanguage} />
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
                intro={intro}
                unit={{
                  one: tUI(uiLanguage, 'settings.membership.intro.unitWordsOne'),
                  other: tUI(uiLanguage, 'settings.membership.intro.unitWords'),
                }}
              />
            }
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
                unit={{
                  one: tUI(uiLanguage, 'settings.membership.intro.unitTimesOne'),
                  other: tUI(uiLanguage, 'settings.membership.intro.unitTimes'),
                }}
              />
            }
          />
          {pronunciation && timeline.pronunciation ? (
            <IntroRow
              state={rowStates[2]}
              label={
                rowStates[2] === 'done'
                  ? tUI(
                      uiLanguage,
                      pronunciation.mode === 'gain'
                        ? 'settings.membership.intro.pronDoneGain'
                        : 'settings.membership.intro.pronDoneLevel'
                    )
                  : rowStates[2] === 'active'
                    ? tUI(
                        uiLanguage,
                        'settings.membership.intro.pronDoing'
                      ).replace('{count}', String(pronunciation.comparedCount))
                    : tUI(uiLanguage, 'settings.membership.intro.pronIdle')
              }
              value={
                rowStates[2] === 'done' ? (
                  <CountUpValue
                    to={
                      pronunciation.mode === 'gain'
                        ? (pronunciation.gain ?? 0)
                        : pronunciation.level
                    }
                    prefix={pronunciation.mode === 'gain' ? '+' : ''}
                    durationMs={timeline.pronunciation.revealDuration}
                    unit={pointsUnit}
                  />
                ) : null
              }
            />
          ) : null}
        </View>
      </Animated.View>
    </>
  );
}

// 整個螢幕（含狀態列）的背景；開始時淡入，結尾淡出露出 paywall。
export function IntroBackdrop({ intro }: { intro: ResultsIntroController }) {
  const { backdropIn, chromeOpacity } = intro;
  const opacity = React.useMemo(
    () => Animated.multiply(backdropIn, chromeOpacity),
    [backdropIn, chromeOpacity]
  );
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      <LinearGradient
        colors={['#0B3A63', NAVY]}
        locations={[0, 0.7]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

// 蓋在最上層：點任何地方略過，底部顯示「點一下略過」。
export function IntroSkipLayer({
  intro,
  uiLanguage,
}: {
  intro: ResultsIntroController;
  uiLanguage: UILanguage;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={intro.skip}
      accessibilityRole="button"
      accessibilityLabel={tUI(uiLanguage, 'settings.membership.intro.skip')}
    >
      <Animated.Text
        style={[
          styles.skip,
          { bottom: insets.bottom + 22, opacity: intro.chromeOpacity },
        ]}
        maxFontSizeMultiplier={1.2}
      >
        {tUI(uiLanguage, 'settings.membership.intro.skip')}
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  above: {
    position: 'absolute',
    bottom: HERO_HEIGHT + 18,
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  below: {
    position: 'absolute',
    top: HERO_HEIGHT + 22,
    alignItems: 'center',
    paddingHorizontal: 22,
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
  track: {
    position: 'absolute',
    left: 0,
    top: (HERO_HEIGHT - CARD_HEIGHT) / 2,
    flexDirection: 'row',
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
  // 第 21 張的虛線剪影（同 v13 原型），置中在 paywall 那張卡的外框裡。
  silhouette: {
    position: 'absolute',
    top: (HERO_HEIGHT - CARD_HEIGHT) / 2,
    left: (HERO_WIDTH - CARD_WIDTH) / 2,
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
  silhouetteHighlight: {
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
  silhouetteWord: {
    alignSelf: 'stretch',
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  silhouetteNumber: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10.5,
    fontWeight: '700',
  },
  // 第 21 張被選中時，下方變深的影子。
  liftShadow: {
    position: 'absolute',
    top: 24,
    left: 10,
    right: 10,
    bottom: -6,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  // 選中第 21 張時的金色光暈。
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
  counter: {
    minHeight: 18,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  rows: {
    alignSelf: 'stretch',
    marginTop: 18,
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
    left: 0,
    right: 0,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
  },
});
