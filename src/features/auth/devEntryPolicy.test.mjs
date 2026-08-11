import test from 'node:test';
import assert from 'node:assert/strict';
import { isDevTestAccountEntryEnabled } from './devEntryPolicy.ts';

test('normal-mode sign-in does not expose the dev test-account entry', () => {
  assert.equal(isDevTestAccountEntryEnabled(), false);
});
