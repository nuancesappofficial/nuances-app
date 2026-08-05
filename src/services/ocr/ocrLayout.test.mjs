import assert from 'node:assert/strict';
import test from 'node:test';

import { joinOCRBlocksByVisualLines } from './ocrLayout.ts';

const block = (text, x, y, width = 80, height = 20) => ({
  text,
  frame: { x, y, width, height },
});

test('keeps blocks on the same visual line separated by spaces', () => {
  assert.equal(
    joinOCRBlocksByVisualLines([block('when', 0, 0), block("you're", 90, 1), block('nuts', 180, 0)]),
    "when you're nuts",
  );
});

test('preserves a line break between separate visual lines', () => {
  assert.equal(
    joinOCRBlocksByVisualLines([block('I can’t understand', 0, 0), block('You’re nuts', 0, 35)]),
    'I can’t understand\nYou’re nuts',
  );
});
