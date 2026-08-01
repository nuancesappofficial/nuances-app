import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHiddenSignInCurtain,
  transitionSignInCurtain,
} from './signInCurtain.ts';

test('first sign-in can reveal the app when the session event arrives before the sign-in promise returns', () => {
  let curtain = createHiddenSignInCurtain();

  curtain = transitionSignInCurtain(curtain, 'sign-in-started');
  curtain = transitionSignInCurtain(curtain, 'session-ready');
  curtain = transitionSignInCurtain(curtain, 'sign-in-returned');

  assert.deepEqual(curtain, {
    visible: true,
    ready: true,
  });
});

test('cancelled or failed sign-in removes the curtain', () => {
  let curtain = createHiddenSignInCurtain();

  curtain = transitionSignInCurtain(curtain, 'sign-in-started');
  curtain = transitionSignInCurtain(curtain, 'sign-in-aborted');

  assert.deepEqual(curtain, {
    visible: false,
    ready: false,
  });
});
