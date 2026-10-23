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
  // 輪盤直接停在 #21 之後的收尾（依 Jeff 的指示，不換畫面、卡片不移動）：
  // #21 往前放大 → 其他東西交叉淡化成 paywall → 原地放回原大小交接。
  pick: 500,
  crossfadeDelay: 300,
  crossfade: 600,
  settle21: 300,
  afterSettle: 100,
  // 發音段（S5，v13 原型）：開始後先停一下再閃字，每個字 0.28 秒，最後揭曉。
  pronFlashLead: 500,
  pronFlashEach: 280,
  pronReveal: 1100,
};

export type ResultsIntroPronunciationTimeline = {
  start: number;
  flashStart: number;
  flashEach: number;
  revealStart: number;
  revealDuration: number;
  done: number;
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
  pickStart: number;
  pickDuration: number;
  crossfadeStart: number;
  crossfadeDuration: number;
  settleStart: number;
  settleDuration: number;
  finish: number;
  // null＝沒有發音段。
  pronunciation: ResultsIntroPronunciationTimeline | null;
};

// 各段開始時間（從動畫開始算）。有發音段時插在 switchDone 和 wrapUp 之間，之後各段往後延。
export function buildResultsIntroTimeline(
  pronunciation: { flashCount: number } | null = null
): ResultsIntroTimeline {
  const carouselSpinDelay = BASE.fadeIn * 0.4;
  const collectDone =
    BASE.collectStart + carouselSpinDelay + BASE.spin + BASE.settle;
  const switchStart = collectDone + BASE.gap;
  const switchDone = switchStart + BASE.switchWork;
  let pron: ResultsIntroPronunciationTimeline | null = null;
  if (pronunciation) {
    const start = switchDone + BASE.gap;
    const flashStart = start + BASE.pronFlashLead;
    const revealStart = flashStart + pronunciation.flashCount * BASE.pronFlashEach;
    pron = {
      start,
      flashStart,
      flashEach: BASE.pronFlashEach,
      revealStart,
      revealDuration: BASE.pronReveal,
      done: revealStart + BASE.pronReveal,
    };
  }
  const beforeWrapUp = pron ? pron.done : switchDone;
  const pickStart = beforeWrapUp + Math.round(BASE.hold * 0.55);
  const crossfadeStart = pickStart + BASE.crossfadeDelay;
  const settleStart = crossfadeStart + BASE.crossfade;
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
    wrapUp: beforeWrapUp + 200,
    pickStart,
    pickDuration: BASE.pick,
    crossfadeStart,
    crossfadeDuration: BASE.crossfade,
    settleStart,
    settleDuration: BASE.settle21,
    finish: settleStart + BASE.settle21 + BASE.afterSettle,
    pronunciation: pron,
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

// 發音段（S5）用到的 Pronunciation Record 欄位。
export type IntroPronunciationRecord = {
  firstScore: number | null;
  latestScore: number;
  bestScore: number;
  attempts: number;
  updatedAt: string;
};

export type IntroPronunciationSummary = {
  mode: 'gain' | 'level';
  flashes: { word: string; first: number; best: number }[];
  // 有紀錄、還在的卡片數（「正在比對 N 個字」）。
  comparedCount: number;
  firstAvg: number | null;
  bestAvg: number | null;
  gain: number | null;
  level: number;
};

// 整理發音紀錄：決定要不要播發音段，以及播什麼。null＝整段跳過。
export function summarizePronunciation(
  records: Readonly<Record<string, IntroPronunciationRecord>>,
  cards: readonly { id: string; word: string }[]
): IntroPronunciationSummary | null {
  const practiced = cards.flatMap((card) => {
    const record = records[card.id];
    return record ? [record] : [];
  });
  if (practiced.length === 0) return null;
  const level = Math.round(
    practiced.reduce((sum, record) => sum + record.latestScore, 0) /
      practiced.length
  );
  return {
    mode: 'level',
    flashes: [],
    comparedCount: practiced.length,
    firstAvg: null,
    bestAvg: null,
    gain: null,
    level,
  };
}
