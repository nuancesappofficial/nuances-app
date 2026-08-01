import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveBottomAlignedScrollTarget,
  resolveCardTopAlignedScrollTarget,
} from './ghostScrollTargets.ts';

test('the next word in a multi-card run snaps its ghost card top to the viewport', () => {
  assert.equal(
    resolveCardTopAlignedScrollTarget({
      previewY: 640,
      cardYWithinPreview: 556,
    }),
    1196,
  );
});

test('completed ghost flow snaps to the true bottom so the save button is fully visible', () => {
  assert.equal(
    resolveBottomAlignedScrollTarget({
      contentHeight: 1840,
      viewportHeight: 760,
    }),
    1080,
  );
});

test('scroll targets never become negative when content fits in the viewport', () => {
  assert.equal(
    resolveCardTopAlignedScrollTarget({
      previewY: -8,
      cardYWithinPreview: 0,
    }),
    0,
  );
  assert.equal(
    resolveBottomAlignedScrollTarget({
      contentHeight: 600,
      viewportHeight: 760,
    }),
    0,
  );
});
