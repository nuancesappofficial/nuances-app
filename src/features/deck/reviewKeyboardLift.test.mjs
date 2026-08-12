import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateKeyboardLift,
  getReviewKeyboardEvents,
} from './reviewKeyboardLift.ts';

test('lifts the entire spelling action group above the native keyboard', () => {
  const keyboardTop = 520;
  const groupBottom = 758;
  const gap = 12;

  const lift = calculateKeyboardLift({ groupBottom, keyboardTop, gap });

  assert.equal(lift, 250);
  assert.ok(groupBottom - lift <= keyboardTop - gap);
});

test('does not move a spelling action group that is already above the keyboard', () => {
  assert.equal(
    calculateKeyboardLift({ groupBottom: 480, keyboardTop: 520, gap: 12 }),
    0
  );
});

test('uses one keyboard visibility event pair per platform', () => {
  assert.deepEqual(getReviewKeyboardEvents('ios'), {
    show: 'keyboardWillShow',
    hide: 'keyboardWillHide',
  });
  assert.deepEqual(getReviewKeyboardEvents('android'), {
    show: 'keyboardDidShow',
    hide: 'keyboardDidHide',
  });
});
