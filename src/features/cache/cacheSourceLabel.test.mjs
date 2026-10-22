import assert from 'node:assert/strict';
import test from 'node:test';

import { toSourceLabel } from './cacheSourceLabel.ts';

test('built-in capture sources get readable labels', () => {
  assert.equal(toSourceLabel('share_sheet'), 'Share Sheet');
  assert.equal(toSourceLabel('Share Sheet'), 'Share Sheet');
  assert.equal(toSourceLabel('clipboard'), 'Clipboard');
  assert.equal(toSourceLabel('manual entry'), 'Manual Entry');
  assert.equal(toSourceLabel('quick add'), 'Quick Add');
  assert.equal(toSourceLabel('CAMERA'), 'Camera');
});

test('app names are shown as captured, and a missing source is Unknown', () => {
  assert.equal(toSourceLabel('Netflix'), 'Netflix');
  assert.equal(toSourceLabel('  '), 'Unknown');
  assert.equal(toSourceLabel(null), 'Unknown');
  assert.equal(toSourceLabel(undefined), 'Unknown');
});
