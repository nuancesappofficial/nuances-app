import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveBottomAlignedScrollTarget,
  resolveCardTopAlignedScrollTarget,
  resolveStreamingFollowScrollTarget,
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

test('streaming follow scroll stays put when card fits inside the viewport', () => {
  assert.equal(
    resolveStreamingFollowScrollTarget({
      previewY: 100,
      previewHeight: 300,
      viewportHeight: 700,
      currentScrollY: 50,
      bottomPadding: 48,
    }),
    50,
  );
});

test('streaming follow scroll smoothly scrolls down when card bottom extends past viewport bottom', () => {
  // cardBottom = 100 + 700 + 48 = 848. visibleBottom = 50 + 700 = 750.
  // needed target = 848 - 700 = 148.
  assert.equal(
    resolveStreamingFollowScrollTarget({
      previewY: 100,
      previewHeight: 700,
      viewportHeight: 700,
      currentScrollY: 50,
      bottomPadding: 48,
    }),
    148,
  );
});

test('streaming follow scroll handles zero or negative viewport height safely', () => {
  assert.equal(
    resolveStreamingFollowScrollTarget({
      previewY: 100,
      previewHeight: 500,
      viewportHeight: 0,
      currentScrollY: 80,
    }),
    80,
  );
});
