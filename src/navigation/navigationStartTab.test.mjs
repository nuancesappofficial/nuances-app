import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInitialTabIndex } from './navigationStartTabCore.ts';

test('resolveInitialTabIndex returns 1 (Cache tab) when startTutorialOnMount is true', () => {
  assert.equal(
    resolveInitialTabIndex({ startTutorialOnMount: true, hasCacheItems: false }),
    1
  );
  assert.equal(
    resolveInitialTabIndex({ startTutorialOnMount: true, hasCacheItems: true }),
    1
  );
});

test('resolveInitialTabIndex returns initialTabIndexProp when explicitly provided', () => {
  assert.equal(
    resolveInitialTabIndex({ initialTabIndexProp: 1, hasCacheItems: false }),
    1
  );
  assert.equal(
    resolveInitialTabIndex({ initialTabIndexProp: 2 }),
    2
  );
});

test('resolveInitialTabIndex returns 1 (Cache tab) when user has cache items', () => {
  assert.equal(
    resolveInitialTabIndex({ startTutorialOnMount: false, hasCacheItems: true }),
    1
  );
});

test('resolveInitialTabIndex returns 0 (Deck tab) when cold starting with no cache items and not in tutorial', () => {
  assert.equal(
    resolveInitialTabIndex({ startTutorialOnMount: false, hasCacheItems: false }),
    0
  );
  assert.equal(
    resolveInitialTabIndex({}),
    0
  );
});
