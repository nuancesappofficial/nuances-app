// 免費入門額度（同 paywallHero 的 FREE_STARTER_LIMIT；node 測試不能跨檔 import）。
export const RESULTS_INTRO_CARD_LIMIT = 20;

export type ResultsIntroCard = {
  word: string;
  sourceLabel: string;
  createdAt: number;
};

// 輪播用最新的 20 張卡，由舊到新排，最後一張是最近建的。
export function pickResultsIntroCards(
  cards: readonly ResultsIntroCard[]
): ResultsIntroCard[] {
  return [...cards]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, RESULTS_INTRO_CARD_LIMIT)
    .reverse();
}

// 輪播每張卡依離中心的距離（以張數計）連續變化大小、位移和亮度；超過一張就維持最小。
export function resolveCarouselItemStyle(
  distance: number,
  isNextCard: boolean
): { scale: number; translateY: number; opacity: number } {
  const d = Math.min(1, Math.abs(distance));
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    scale: round(1 - 0.16 * d),
    translateY: round(-4 * (1 - d)) || 0,
    opacity: round(isNextCard ? 0.45 + 0.55 * (1 - d) : 1 - 0.6 * d),
  };
}

// 各段基準長度（毫秒），來自 v13 原型。
const BASE = {
  title: 300,
  collectStart: 1000,
  fadeIn: 500,
  spin: 4800,
  settle: 700,
  gap: 600,
  switchWork: 1500,
  hold: 2300,
  slide: 900,
  // 停在 #21 之後的收尾（v13 原型之後，依 Jeff 的指示改成不換畫面）。
  aura: 600,
  chromeFadeDelay: 300,
  chromeFade: 500,
  handoffDelay: 300,
  handoff: 700,
  settleAfterHandoff: 100,
};

export type ResultsIntroTimeline = {
  titleIn: number;
  collectStart: number;
  carouselFadeIn: number;
  carouselSpinDelay: number;
  carouselSpin: number;
  collectDone: number;
  switchStart: number;
  switchDuration: number;
  switchDone: number;
  wrapUp: number;
  slideToNext: number;
  slideToNextDuration: number;
  auraStart: number;
  auraDuration: number;
  chromeFadeStart: number;
  chromeFadeDuration: number;
  handoffStart: number;
  handoffDuration: number;
  finish: number;
};

// 各段開始時間（從動畫開始算）。發音段之後由 S5 插在 switchDone 和 wrapUp 之間。
export function buildResultsIntroTimeline(): ResultsIntroTimeline {
  const carouselSpinDelay = BASE.fadeIn * 0.4;
  const collectDone =
    BASE.collectStart + carouselSpinDelay + BASE.spin + BASE.settle;
  const switchStart = collectDone + BASE.gap;
  const switchDone = switchStart + BASE.switchWork;
  const slideToNext = switchDone + Math.round(BASE.hold * 0.55);
  // 停在 #21 → 金色光暈 → 其他文字淡出 → 卡片移到 paywall 的位置、paywall 淡入。
  const auraStart = slideToNext + BASE.slide;
  const chromeFadeStart = auraStart + BASE.chromeFadeDelay;
  const handoffStart = chromeFadeStart + BASE.handoffDelay;
  return {
    titleIn: BASE.title,
    collectStart: BASE.collectStart,
    carouselFadeIn: BASE.fadeIn,
    carouselSpinDelay,
    carouselSpin: BASE.spin,
    collectDone,
    switchStart,
    switchDuration: BASE.switchWork,
    switchDone,
    wrapUp: switchDone + 200,
    slideToNext,
    slideToNextDuration: BASE.slide,
    auraStart,
    auraDuration: BASE.aura,
    chromeFadeStart,
    chromeFadeDuration: BASE.chromeFade,
    handoffStart,
    handoffDuration: BASE.handoff,
    finish: handoffStart + BASE.handoff + BASE.settleAfterHandoff,
  };
}

// 成果動畫：只在第 21 張卡的 paywall 前播，每個帳號只播第一次。
export function shouldPlayResultsIntro(params: {
  heroKind: 'plan' | 'next' | 'covered' | null;
  alreadySeen: boolean;
  reduceMotion: boolean;
  cardCount: number;
}): boolean {
  return (
    params.heroKind === 'next' &&
    !params.alreadySeen &&
    !params.reduceMotion &&
    params.cardCount > 0
  );
}
