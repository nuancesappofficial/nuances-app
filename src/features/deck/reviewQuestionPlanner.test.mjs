import test from 'node:test';
import assert from 'node:assert/strict';
import { planReviewQuestions } from './reviewQuestionPlanner.ts';

test('planReviewQuestions returns empty plan when cards array is empty', () => {
  const result = planReviewQuestions({
    cards: [],
    questionCount: 10,
    selectedQuestionTypes: ['fill_blank', 'spelling'],
  });

  assert.deepEqual(result.items, []);
  assert.equal(result.isClamped, false);
  assert.equal(result.maxAvailable, 0);
});

test('planReviewQuestions expands questions across question types when cards count is less than requested question count (Option C)', () => {
  const cards = [
    { id: 'card-1' },
    { id: 'card-2' },
    { id: 'card-3' },
  ];
  const selectedQuestionTypes = ['fill_blank', 'spelling', 'pronunciation'];

  const result = planReviewQuestions({
    cards,
    questionCount: 10,
    selectedQuestionTypes,
    canBuildQuestionType: () => true,
  });

  // 3 cards * 3 types = 9 max possible questions
  assert.equal(result.items.length, 9);
  assert.equal(result.isClamped, true);
  assert.equal(result.maxAvailable, 9);

  // Verify each (cardId, questionType) pair is unique (no duplicate question types for same card)
  const seenPairs = new Set();
  const cardCounts = new Map();

  for (const item of result.items) {
    const pairKey = `${item.cardId}:${item.questionType}`;
    assert.equal(seenPairs.has(pairKey), false, `Duplicate pair found: ${pairKey}`);
    seenPairs.add(pairKey);

    cardCounts.set(item.cardId, (cardCounts.get(item.cardId) || 0) + 1);
    assert.equal(item.questionId, `${item.cardId}:${item.questionType}`);
  }

  // Each card should be tested 3 times with 3 distinct types
  for (const card of cards) {
    assert.equal(cardCounts.get(card.id), 3);
  }
});

test('planReviewQuestions clamps exactly to requestedCount when cards * types > requestedCount', () => {
  const cards = [
    { id: 'card-1' },
    { id: 'card-2' },
  ];
  const selectedQuestionTypes = ['fill_blank', 'spelling', 'pronunciation'];

  const result = planReviewQuestions({
    cards,
    questionCount: 5,
    selectedQuestionTypes,
    canBuildQuestionType: () => true,
  });

  assert.equal(result.items.length, 5);
  assert.equal(result.isClamped, false);
  assert.equal(result.maxAvailable, 6);

  const seenPairs = new Set();
  for (const item of result.items) {
    const pairKey = `${item.cardId}:${item.questionType}`;
    assert.equal(seenPairs.has(pairKey), false);
    seenPairs.add(pairKey);
  }
});

test('planReviewQuestions spaces out cards to avoid consecutive duplicate cards when possible', () => {
  const cards = [
    { id: 'card-1' },
    { id: 'card-2' },
  ];
  const selectedQuestionTypes = ['fill_blank', 'spelling'];

  const result = planReviewQuestions({
    cards,
    questionCount: 4,
    selectedQuestionTypes,
    canBuildQuestionType: () => true,
  });

  assert.equal(result.items.length, 4);
  for (let i = 0; i < result.items.length - 1; i++) {
    assert.notEqual(
      result.items[i].cardId,
      result.items[i + 1].cardId,
      `Consecutive card found at index ${i} and ${i + 1}`
    );
  }
});

test('planReviewQuestions prioritizes skippedPronunciationCardIds with pronunciation', () => {
  const cards = [
    { id: 'card-1' },
    { id: 'card-2' },
  ];
  const selectedQuestionTypes = ['fill_blank', 'pronunciation'];

  const result = planReviewQuestions({
    cards,
    questionCount: 2,
    selectedQuestionTypes,
    skippedPronunciationCardIds: ['card-2'],
    canBuildQuestionType: () => true,
  });

  assert.equal(result.items.length, 2);
  const card2Item = result.items.find((item) => item.cardId === 'card-2');
  assert.ok(card2Item);
  assert.equal(card2Item.questionType, 'pronunciation');
});

test('planReviewQuestions prioritizes pinnedCardIds before unpinned cards', () => {
  const cards = [
    { id: 'card-1' },
    { id: 'card-2' },
    { id: 'card-3' },
  ];
  const selectedQuestionTypes = ['fill_blank'];

  const result = planReviewQuestions({
    cards,
    questionCount: 2,
    selectedQuestionTypes,
    pinnedCardIds: ['card-3'],
    canBuildQuestionType: () => true,
  });

  assert.equal(result.items.length, 2);
  const cardIds = result.items.map((item) => item.cardId);
  assert.ok(cardIds.includes('card-3'), 'Pinned card should be included');
});

