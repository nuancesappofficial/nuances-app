import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveCarouselItemStyle,
  buildResultsIntroTimeline,
  pickResultsIntroCards,
  shouldPlayResultsIntro,
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
// 輪盤直接減速停在 #21；之後（依 Jeff 的指示）：挑起 #21 500 → 其他交叉淡化 600、
// 卡片同時移到 paywall 700 → 放回原大小 300。
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
    moveDuration: 700,
    settleStart: 11065,
    settleDuration: 300,
    finish: 11465,
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
