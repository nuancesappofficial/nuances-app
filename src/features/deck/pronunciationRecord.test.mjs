import assert from 'node:assert/strict';
import test from 'node:test';

import { readStoredRecord, recordAssessment } from './pronunciationRecord.ts';

const AT = '2026-10-23T10:00:00.000Z';

test('the first scored assessment becomes the first, latest and best score', () => {
  const record = recordAssessment(null, { score: 60, demo: false, at: AT });
  assert.deepEqual(record, {
    firstScore: 60,
    latestScore: 60,
    bestScore: 60,
    attempts: 1,
    updatedAt: AT,
    coach: null,
  });
});

test('later assessments count up and keep the best score', () => {
  const first = recordAssessment(null, { score: 60, demo: false, at: AT });
  const second = recordAssessment(first, {
    score: 85,
    demo: false,
    at: '2026-10-23T11:00:00.000Z',
  });
  // 第三次較低：最近一次變 72，最高分仍是 85，第一次仍是 60。
  const third = recordAssessment(second, {
    score: 72,
    demo: false,
    at: '2026-10-23T12:00:00.000Z',
  });
  assert.deepEqual(third, {
    firstScore: 60,
    latestScore: 72,
    bestScore: 85,
    attempts: 3,
    updatedAt: '2026-10-23T12:00:00.000Z',
    coach: null,
  });
});

test('demo and unscored assessments leave the record unchanged', () => {
  const record = recordAssessment(null, { score: 60, demo: false, at: AT });
  const later = '2026-10-23T11:00:00.000Z';
  assert.equal(recordAssessment(record, { score: 95, demo: true, at: later }), record);
  assert.equal(recordAssessment(record, { score: null, demo: false, at: later }), record);
  assert.equal(recordAssessment(null, { score: 95, demo: true, at: later }), null);
  assert.equal(recordAssessment(null, { score: null, demo: false, at: later }), null);
});

test('a coach assessment keeps its result; other assessments leave it alone', () => {
  const coach = {
    score: 60,
    feedbackLines: ['Stress the second syllable'],
    phonemeFeedback: [],
    showFeedback: true,
  };
  const fromCoach = recordAssessment(null, { score: 60, demo: false, at: AT, coach });
  // 測驗沒有教練的結果：分數更新，教練畫面仍是 60 分那次。
  const fromQuiz = recordAssessment(fromCoach, {
    score: 80,
    demo: false,
    at: '2026-10-23T11:00:00.000Z',
  });
  assert.deepEqual(fromQuiz.coach, coach);
  assert.equal(fromQuiz.latestScore, 80);
});

// 舊格式：發音教練每張卡只存最近一次結果（card_pronunciation_history_v1）。
const LEGACY = {
  score: 74,
  feedbackLines: ['Good rhythm'],
  phonemeFeedback: [],
  showFeedback: true,
  updatedAt: '2026-09-01T08:00:00.000Z',
};

test('a legacy entry reads as one attempt with an unknown first score', () => {
  assert.deepEqual(readStoredRecord(LEGACY), {
    firstScore: null,
    latestScore: 74,
    bestScore: 74,
    attempts: 1,
    updatedAt: '2026-09-01T08:00:00.000Z',
    coach: {
      score: 74,
      feedbackLines: ['Good rhythm'],
      phonemeFeedback: [],
      showFeedback: true,
    },
  });
});

test('a saved record reads back unchanged, and a legacy one keeps its unknown first score', () => {
  const legacyPracticed = recordAssessment(readStoredRecord(LEGACY), {
    score: 88,
    demo: false,
    at: AT,
  });
  // 存檔是 JSON，讀回來要跟存之前一樣。
  const roundTrip = readStoredRecord(JSON.parse(JSON.stringify(legacyPracticed)));
  assert.deepEqual(roundTrip, {
    firstScore: null,
    latestScore: 88,
    bestScore: 88,
    attempts: 2,
    updatedAt: AT,
    coach: {
      score: 74,
      feedbackLines: ['Good rhythm'],
      phonemeFeedback: [],
      showFeedback: true,
    },
  });
});

test('broken or scoreless entries read as no record', () => {
  assert.equal(readStoredRecord({ ...LEGACY, score: null }), null);
  assert.equal(readStoredRecord('74'), null);
  assert.equal(readStoredRecord([LEGACY]), null);
  assert.equal(readStoredRecord(null), null);
  assert.equal(
    readStoredRecord({ firstScore: 60, latestScore: 'x', bestScore: 85, attempts: 2 }),
    null
  );
  assert.equal(
    readStoredRecord({ firstScore: 60, latestScore: 70, bestScore: 85, attempts: 0 }),
    null
  );
});
