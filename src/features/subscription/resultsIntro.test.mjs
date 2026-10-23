import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveCarouselItemStyle,
  buildResultsIntroTimeline,
  pickResultsIntroCards,
  shouldPlayResultsIntro,
  summarizePronunciation,
} from './resultsIntro.ts';

// 預期值來自 v13 原型：scale 1-.16d、translateY -4(1-d)、opacity 1-.6d；
// 虛線第 21 張 opacity .45+.55(1-d)。
test('the centered card is full size and the next ones shrink and dim', () => {
  assert.deepEqual(resolveCarouselItemStyle(0, false), {
    scale: 1,
    translateY: -4,
    opacity: 1,
  });
  assert.deepEqual(resolveCarouselItemStyle(1, false), {
    scale: 0.84,
    translateY: 0,
    opacity: 0.4,
  });
  assert.deepEqual(resolveCarouselItemStyle(3, false), {
    scale: 0.84,
    translateY: 0,
    opacity: 0.4,
  });
  assert.deepEqual(resolveCarouselItemStyle(1, true), {
    scale: 0.84,
    translateY: 0,
    opacity: 0.45,
  });
  assert.deepEqual(resolveCarouselItemStyle(0, true), {
    scale: 1,
    translateY: -4,
    opacity: 1,
  });
});

// 停在 #21 之前的預期值是 v13 原型在速度 1 時的節奏（BASE：title 300、collectStart 1000、
// fadeIn 500、spin 4800、settle 700、gap 600、switchWork 1500、hold 2300）。
// 輪盤直接減速停在 #21；之後（依 Jeff 的指示，卡片不移動）：#21 往前放大 500 →
// 其他交叉淡化成 paywall 600 → 原地放回原大小 300。
test('the intro timeline follows the v13 prototype pacing', () => {
  assert.deepEqual(buildResultsIntroTimeline(), {
    titleIn: 300,
    collectStart: 1000,
    carouselFadeIn: 500,
    carouselSpinDelay: 200,
    carouselSpin: 4800,
    collectDone: 6700,
    switchStart: 7300,
    switchDuration: 1500,
    switchDone: 8800,
    wrapUp: 9000,
    pickStart: 10065,
    pickDuration: 500,
    crossfadeStart: 10365,
    crossfadeDuration: 600,
    settleStart: 10965,
    settleDuration: 300,
    finish: 11365,
    pronunciation: null,
  });
});

const card = (word, day) => ({
  word,
  sourceLabel: 'Netflix',
  createdAt: new Date(2026, 9, day).getTime(),
});

test('the carousel shows the newest 20 cards from oldest to newest', () => {
  const cards = Array.from({ length: 25 }, (_, index) =>
    card(`w${index + 1}`, index + 1)
  ).reverse();
  const picked = pickResultsIntroCards(cards);
  assert.equal(picked.length, 20);
  assert.equal(picked[0].word, 'w6');
  assert.equal(picked[19].word, 'w25');
});

test('fewer cards than the allowance are all shown, oldest first', () => {
  assert.deepEqual(
    pickResultsIntroCards([card('b', 2), card('c', 3), card('a', 1)]).map(
      (item) => item.word
    ),
    ['a', 'b', 'c']
  );
});

test('the first starter-cap paywall plays the results intro', () => {
  assert.equal(
    shouldPlayResultsIntro({
      heroKind: 'next',
      alreadySeen: false,
      reduceMotion: false,
      cardCount: 20,
    }),
    true
  );
});

test('the intro is skipped once seen, with reduce motion, or with no cards', () => {
  const base = {
    heroKind: 'next',
    alreadySeen: false,
    reduceMotion: false,
    cardCount: 20,
  };
  assert.equal(shouldPlayResultsIntro({ ...base, alreadySeen: true }), false);
  assert.equal(shouldPlayResultsIntro({ ...base, reduceMotion: true }), false);
  assert.equal(shouldPlayResultsIntro({ ...base, cardCount: 0 }), false);
});

test('paywalls opened from settings or by paying learners never play the intro', () => {
  const base = { alreadySeen: false, reduceMotion: false, cardCount: 20 };
  assert.equal(shouldPlayResultsIntro({ ...base, heroKind: 'covered' }), false);
  assert.equal(shouldPlayResultsIntro({ ...base, heroKind: 'plan' }), false);
});

// 發音段（S5）：每張卡的 Pronunciation Record 只取分數相關欄位。
const record = (firstScore, latestScore, bestScore, attempts, updatedAt = '2026-10-01T00:00:00.000Z') => ({
  firstScore,
  latestScore,
  bestScore,
  attempts,
  updatedAt,
});
const CARDS = [
  { id: 'a', word: 'receipt' },
  { id: 'b', word: 'situationship' },
  { id: 'c', word: 'nuance' },
];

test('no pronunciation records means no pronunciation segment', () => {
  assert.equal(summarizePronunciation({}, CARDS), null);
});

test('cards practiced once or legacy-only show the current level without flashes', () => {
  // a：只練過 1 次（80）；b：舊資料，第一次不明，最近一次 70。目前水準 = (80+70)/2 = 75。
  const summary = summarizePronunciation(
    { a: record(80, 80, 80, 1), b: record(null, 70, 70, 3) },
    CARDS
  );
  assert.deepEqual(summary, {
    mode: 'level',
    flashes: [],
    comparedCount: 2,
    firstAvg: null,
    bestAvg: null,
    gain: null,
    level: 75,
  });
});

test('deleted cards are left out and the level is rounded', () => {
  // z 已刪除（10 分）不算；(81 + 70) / 2 = 75.5 → 76。
  const summary = summarizePronunciation(
    { a: record(81, 81, 81, 1), b: record(null, 70, 70, 1), z: record(10, 10, 10, 1) },
    CARDS
  );
  assert.equal(summary.comparedCount, 2);
  assert.equal(summary.level, 76);
});

test('records only on deleted cards mean no pronunciation segment', () => {
  assert.equal(summarizePronunciation({ z: record(60, 90, 90, 4) }, CARDS), null);
});

test('a level-only pronunciation segment sits between app switching and wrap-up', () => {
  // v13 原型：switchDone 8800 + gap 600 = 9400 開始；+500 開始閃字（0 個）；揭曉 1100 → 11000。
  // 之後每段都比 S4 晚 11000 - 8800 = 2200。
  const timeline = buildResultsIntroTimeline({ flashCount: 0 });
  assert.deepEqual(timeline.pronunciation, {
    start: 9400,
    flashStart: 9900,
    flashEach: 280,
    revealStart: 9900,
    revealDuration: 1100,
    done: 11000,
  });
  assert.equal(timeline.switchDone, 8800);
  assert.equal(timeline.wrapUp, 11200);
  assert.equal(timeline.pickStart, 12265);
  assert.equal(timeline.finish, 13565);
});

test('cards with a known first score and 2+ attempts show the average gain', () => {
  // a：60 → 最高 85；b：70 → 最高 74；c：只練過 1 次，不算進步但算目前水準。
  // 第一次平均 (60+70)/2 = 65，最高分平均 (85+74)/2 = 79.5 → 80，進步 80 - 65 = 15。
  // 目前水準：最近一次 (80 + 72 + 90) / 3 = 80.67 → 81。
  const summary = summarizePronunciation(
    {
      a: record(60, 80, 85, 3, '2026-10-02T00:00:00.000Z'),
      b: record(70, 72, 74, 2, '2026-10-01T00:00:00.000Z'),
      c: record(90, 90, 90, 1),
    },
    CARDS
  );
  assert.deepEqual(summary, {
    mode: 'gain',
    flashes: [
      { word: 'situationship', first: 70, best: 74 },
      { word: 'receipt', first: 60, best: 85 },
    ],
    comparedCount: 3,
    firstAvg: 65,
    bestAvg: 80,
    gain: 15,
    level: 81,
  });
});

test('a gain of exactly 5 counts as progress; 4 falls back to the current level', () => {
  const five = summarizePronunciation({ a: record(60, 65, 65, 2) }, CARDS);
  assert.equal(five.mode, 'gain');
  assert.equal(five.gain, 5);
  // 進步不到 5：改顯示目前水準，但練過的字仍然閃過。
  const four = summarizePronunciation({ a: record(60, 64, 64, 2) }, CARDS);
  assert.equal(four.mode, 'level');
  assert.deepEqual(four.flashes, [{ word: 'receipt', first: 60, best: 64 }]);
  assert.equal(four.level, 64);
});

test('more than 10 practiced words flash only the 10 biggest gains, smallest first', () => {
  // 12 張卡，第 i 張第一次 50、最高 50 + i（進步 0…11）。
  const cards = Array.from({ length: 12 }, (_, i) => ({ id: `k${i}`, word: `w${i}` }));
  const records = Object.fromEntries(
    cards.map((card, i) => [card.id, record(50, 50 + i, 50 + i, 2)])
  );
  const summary = summarizePronunciation(records, cards);
  assert.deepEqual(
    summary.flashes.map((flash) => flash.word),
    ['w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11']
  );
  // 平均用全部 12 張：最高分平均 (50 + 50…61) = 55.5 → 56，進步 56 - 50 = 6。
  assert.equal(summary.gain, 6);
});

test('equal gains flash in the order they were last practiced', () => {
  const summary = summarizePronunciation(
    {
      a: record(60, 70, 70, 2, '2026-10-05T00:00:00.000Z'),
      b: record(60, 70, 70, 2, '2026-10-03T00:00:00.000Z'),
    },
    CARDS
  );
  assert.deepEqual(summary.flashes.map((flash) => flash.word), ['situationship', 'receipt']);
});

test('each flashed word adds 280 ms before the reveal', () => {
  // 3 個字：閃字從 9900 開始，9900 + 3 × 280 = 10740 揭曉，+1100 = 11840 結束。
  const timeline = buildResultsIntroTimeline({ flashCount: 3 });
  assert.equal(timeline.pronunciation.revealStart, 10740);
  assert.equal(timeline.pronunciation.done, 11840);
  assert.equal(timeline.finish, 13565 + 840);
});
