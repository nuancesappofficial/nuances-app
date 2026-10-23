import React from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tUI } from '../../../i18n/uiLanguage';
import type { UILanguage } from '@services/settings/userSettings';
import {
  splitTemplateAroundToken,
  type PaywallHero,
} from '../../../features/subscription/paywallHero';
import type { ResultsIntroCard } from '../../../features/subscription/resultsIntro';
import {
  IntroCarousel,
  IntroCardUnderlay,
  IntroChrome,
  useIntroCardStyle,
  useIntroPickedStyle,
  type ResultsIntroController,
} from './ResultsIntroUI';

// 成果動畫：這張第 21 張卡就是輪播停下來的那一格（同一個元件，所以不會移動或換臉）。
export type PaywallHeroIntro = {
  controller: ResultsIntroController;
  cards: ResultsIntroCard[];
  createdCount: number;
};

type Props = {
  // null：會員狀態還沒讀到，先保留空間，避免付費用戶閃過免費版畫面。
  hero: PaywallHero | null;
  uiLanguage: UILanguage;
  // 只在成果動畫播放時傳入。
  intro?: PaywallHeroIntro | null;
  // 成果動畫的時間軸（一直存在；沒播時不會用到）。
  introController: ResultsIntroController;
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

const GOLD = '#F5B53F';
const CARD_WIDTH = 136;
// 卡片翻開時從中心往外散開的金色光點（位移同 v13 原型）。
const SPARKS: Array<{ dx: number; dy: number }> = [
  { dx: -92, dy: -46 },
  { dx: 90, dy: -52 },
  { dx: -104, dy: 18 },
  { dx: 102, dy: 22 },
  { dx: -60, dy: -78 },
  { dx: 64, dy: -80 },
  { dx: -70, dy: 70 },
  { dx: 74, dy: 66 },
  { dx: 0, dy: -92 },
  { dx: 4, dy: 88 },
];

function useLoopingSheen() {
  const sheen = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sheen, {
          toValue: 1,
          duration: 1260,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(2340),
        Animated.timing(sheen, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    const start = setTimeout(() => loop.start(), 1400);
    return () => {
      clearTimeout(start);
      loop.stop();
    };
  }, [sheen]);
  return sheen;
}

function SparkBurst() {
  const progress = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 1000,
      delay: 550,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  return (
    <>
      {SPARKS.map((spark) => (
        <Animated.View
          key={`${spark.dx},${spark.dy}`}
          pointerEvents="none"
          style={[
            styles.spark,
            {
              opacity: progress.interpolate({
                inputRange: [0, 0.25, 1],
                outputRange: [0, 1, 0],
              }),
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, spark.dx],
                  }),
                },
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, spark.dy],
                  }),
                },
                {
                  scale: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 1],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </>
  );
}

// 第 21 張卡的卡面（金邊 Cache 卡）。paywall 和成果動畫結尾共用，確保交接時長得一模一樣。
function TwentyFirstCardFace({
  word,
  sourceLabel,
  signature,
  children,
}: {
  word: string;
  sourceLabel: string;
  signature: string;
  children?: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={['#FDE68A', '#F59E0B', '#FDE68A', GOLD]}
      locations={[0, 0.45, 0.7, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.nextCardBorder}
    >
      <View style={styles.nextCardFace}>
        <View style={styles.nextCardTopRow}>
          <View style={styles.sourcePill}>
            <Text style={styles.sourcePillText} numberOfLines={1}>
              {sourceLabel}
            </Text>
          </View>
          <Text style={styles.nextCardNumber}>#21</Text>
        </View>
        <View style={styles.nextCardWordBox}>
          {/* 長字整體縮小，不在字中間斷行 */}
          <Text
            style={styles.nextCardWord}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.45}
            maxFontSizeMultiplier={1}
          >
            {word}
          </Text>
        </View>
        {/* AI 卡還沒產生：定義位置留虛線，不放假內容 */}
        <View style={styles.definitionLine} />
        <View style={[styles.definitionLine, styles.definitionLineShort]} />
        <Text style={styles.signature} numberOfLines={1} maxFontSizeMultiplier={1}>
          {signature}
        </Text>
        {children}
      </View>
    </LinearGradient>
  );
}

const STATIC_TILT = { transform: [{ rotate: '-4deg' }] };

function NextCard({
  word,
  sourceLabel,
  signature,
  uiLanguage,
  intro,
  introController,
}: {
  word: string;
  sourceLabel: string;
  signature: string;
  uiLanguage: UILanguage;
  intro: PaywallHeroIntro | null;
  introController: ResultsIntroController;
}) {
  const sheen = useLoopingSheen();
  // 插值只建一次：成果動畫播放時這個元件會一直重畫。
  const sheenStyle = React.useMemo(
    () => ({
      transform: [
        { rotate: '25deg' },
        {
          translateX: sheen.interpolate({
            inputRange: [0, 1],
            outputRange: [-CARD_WIDTH * 1.4, CARD_WIDTH * 1.4],
          }),
        },
      ],
    }),
    [sheen]
  );
  const controller = introController;
  // 只有播放時才套用這些樣式。
  const introCardStyle = useIntroCardStyle(controller);
  const pickedStyle = useIntroPickedStyle(controller);
  const playing = intro != null;

  return (
    <View style={styles.nextCardStage}>
      {playing ? <IntroCarousel intro={controller} cards={intro.cards} /> : null}
      {/* 播放時：依輪播位置縮放、變暗；停下來時跟平常完全一樣。 */}
      <Animated.View style={[styles.nextCardFill, playing ? introCardStyle : null]}>
        <Animated.View
          style={[styles.nextCardFill, playing ? pickedStyle : STATIC_TILT]}
        >
          {playing ? (
            <IntroCardUnderlay intro={controller} word={word} />
          ) : null}
          <Animated.View
            style={[
              styles.nextCardFill,
              playing ? { opacity: controller.gold } : null,
            ]}
          >
            <TwentyFirstCardFace
              word={word}
              sourceLabel={sourceLabel}
              signature={signature}
            >
              <Animated.View
                pointerEvents="none"
                style={[styles.sheen, sheenStyle]}
              >
                <LinearGradient
                  colors={[
                    'rgba(255,255,255,0)',
                    'rgba(255,255,255,0.7)',
                    'rgba(255,255,255,0)',
                  ]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </TwentyFirstCardFace>
          </Animated.View>
        </Animated.View>
      </Animated.View>
      {playing ? (
        <IntroChrome
          intro={controller}
          createdCount={intro.createdCount}
          uiLanguage={uiLanguage}
        />
      ) : null}
      {/* 動畫播完（或沒有動畫）時才散出金色光點 */}
      {playing ? null : <SparkBurst />}
    </View>
  );
}

export default function PaywallHeroUI({
  hero,
  uiLanguage,
  intro = null,
  introController,
}: Props) {
  if (!hero) return <View style={styles.container} />;

  if (hero.kind === 'next') {
    const title = splitTemplateAroundToken(
      tUI(uiLanguage, 'settings.membership.next21.title'),
      '{word}'
    );
    return (
      <View style={styles.container}>
        <NextCard
          word={hero.word}
          sourceLabel={hero.sourceLabel}
          signature={tUI(uiLanguage, 'settings.membership.next21.signature')}
          uiLanguage={uiLanguage}
          intro={intro}
          introController={introController}
        />
        {/* paywall 的標題：成果動畫結尾和其他部分一起淡入。 */}
        <Animated.Text
          style={[
            styles.title,
            intro ? { opacity: introController.reveal } : null,
          ]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          maxFontSizeMultiplier={1.2}
        >
          {title.before}
          <Text style={styles.titleWord}>{hero.word}</Text>
          {title.after}
        </Animated.Text>
      </View>
    );
  }

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
    // flexGrow（不是 flex: 1）：高度至少是自己的內容，小螢幕上卡片才不會被壓扁。
    flexGrow: 1,
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
  nextCardStage: {
    width: CARD_WIDTH,
    height: 174,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextCardBorder: {
    width: CARD_WIDTH,
    height: 174,
    borderRadius: 18,
    padding: 3,

    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  nextCardFill: {
    ...StyleSheet.absoluteFillObject,
  },
  nextCardFace: {
    flex: 1,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    padding: 7,
    overflow: 'hidden',
  },
  nextCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  sourcePill: {
    flexShrink: 1,
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
  nextCardNumber: {
    color: '#C99A2E',
    fontSize: 9.5,
    fontWeight: '800',
  },
  nextCardWordBox: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  nextCardWord: {
    color: '#1C2530',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  definitionLine: {
    height: 6,
    marginTop: 6,
    borderRadius: 3,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D9DEE6',
  },
  definitionLineShort: {
    width: '62%',
  },
  signature: {
    marginTop: 7,
    color: '#A0A6B1',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'right',
  },
  sheen: {
    position: 'absolute',
    top: -60,
    bottom: -60,
    left: CARD_WIDTH / 2 - 30,
    width: 60,
  },
  spark: {
    position: 'absolute',
    left: CARD_WIDTH / 2 - 3.5,
    top: 174 / 2 - 3.5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FDE68A',
  },
  titleWord: {
    color: GOLD,
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
