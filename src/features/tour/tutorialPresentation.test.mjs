import assert from 'node:assert/strict';
import test from 'node:test';

import { getTutorialArrowRenderSize } from './tutorialPresentation.ts';

test('tutorial arrows render twice as large and twice as thick', () => {
  assert.equal(getTutorialArrowRenderSize(32), 64);
  assert.equal(getTutorialArrowRenderSize(27), 54);
});
