import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginFreshTestAccountReset,
  finishFreshTestAccountReset,
  waitForFreshTestAccountReset,
} from './freshTestAccountGate.ts';

test('auth bootstrap waits when SIGNED_IN arrives before the fresh account reset finishes', async () => {
  beginFreshTestAccountReset();

  let bootstrapReleased = false;
  const bootstrap = waitForFreshTestAccountReset().then(() => {
    bootstrapReleased = true;
  });

  await Promise.resolve();
  assert.equal(bootstrapReleased, false);

  finishFreshTestAccountReset();
  await bootstrap;
  assert.equal(bootstrapReleased, true);
});

test('normal sign-in has no fresh account gate', async () => {
  await waitForFreshTestAccountReset();
});
