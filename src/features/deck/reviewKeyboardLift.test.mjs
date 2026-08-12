import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateKeyboardLift } from './reviewKeyboardLift.ts';

test('lifts a spelling input above the native keyboard with a visible gap', () => {
  const keyboardTop = 520;
  const inputBottom = 690;
  const gap = 12;

  const lift = calculateKeyboardLift({ inputBottom, keyboardTop, gap });

  assert.equal(lift, 182);
  assert.ok(inputBottom - lift <= keyboardTop - gap);
});

test('does not move a spelling input that is already above the keyboard', () => {
  assert.equal(
    calculateKeyboardLift({ inputBottom: 480, keyboardTop: 520, gap: 12 }),
    0
  );
});
