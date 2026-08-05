import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEV_FRESH_USER_PREFIX,
  buildDevFreshUserSession,
  createDevFreshUserId,
  isDevFreshUserId,
  getActiveDevFreshUserId,
  setActiveDevFreshUserId,
  shouldUseDevAccountDelete,
  resolveAccountDeletionPath,
} from './devFreshUserSimulatorCore.ts';

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('createDevFreshUserId returns a valid, randomized UUID v4', () => {
  const id = createDevFreshUserId();

  assert.match(id, UUID_V4_RE);
  assert.equal(id.includes(DEV_FRESH_USER_PREFIX), false);
});

test('createDevFreshUserId returns a fresh id on each call', () => {
  const first = createDevFreshUserId();
  const second = createDevFreshUserId();

  assert.notEqual(first, second);
  assert.match(first, UUID_V4_RE);
  assert.match(second, UUID_V4_RE);
});

test('isDevFreshUserId detects the active dev id and rejects others', () => {
  const id = createDevFreshUserId();
  setActiveDevFreshUserId(id);
  assert.equal(isDevFreshUserId(id), true);
  setActiveDevFreshUserId(null);
  assert.equal(isDevFreshUserId(id), false);
  assert.equal(isDevFreshUserId('real-user-uuid'), false);
  assert.equal(isDevFreshUserId(null), false);
  assert.equal(isDevFreshUserId(undefined), false);
  assert.equal(isDevFreshUserId(''), false);
});

test('buildDevFreshUserSession carries the synthetic id and a local email', () => {
  const id = createDevFreshUserId();
  const session = buildDevFreshUserSession(id);

  assert.equal(session.user.id, id);
  assert.equal(session.access_token, `dev-fresh-user-token-${id}`);
  assert.ok(session.user.email?.endsWith('@local.dev'));
  assert.deepEqual(session.user.app_metadata, {});
  assert.deepEqual(session.user.user_metadata, {});
});

test('dev fresh identity is available through the shared local identity seam', () => {
  setActiveDevFreshUserId('dev-fresh-user-test');
  assert.equal(getActiveDevFreshUserId(), 'dev-fresh-user-test');
  setActiveDevFreshUserId(null);
  assert.equal(getActiveDevFreshUserId(), null);
});

test('shouldUseDevAccountDelete is true only for the active dev fresh-user id', () => {
  const devId = createDevFreshUserId();
  setActiveDevFreshUserId(devId);

  // The active simulated id must use the dev-only local delete path.
  assert.equal(shouldUseDevAccountDelete(devId), true);
  // A real account id (even in a dev build) must NOT use the dev-only path.
  assert.equal(shouldUseDevAccountDelete('real-user-uuid'), false);
  // No active id / null must not use the dev-only path.
  assert.equal(shouldUseDevAccountDelete(null), false);
  assert.equal(shouldUseDevAccountDelete(undefined), false);

  setActiveDevFreshUserId(null);
  // After clearing the active dev id, even the former dev id is a real path.
  assert.equal(shouldUseDevAccountDelete(devId), false);
});

test('resolveAccountDeletionPath routes a real account to the real deletion even in a dev build', () => {
  const devId = createDevFreshUserId();
  setActiveDevFreshUserId(devId);

  // A real account signed in on a dev build (dev handler wired up) must still
  // run the real server-backed deletion — this is the regression this guards.
  assert.equal(resolveAccountDeletionPath('real-user-uuid', true), 'real-account');
  // No handler wired up -> real deletion regardless of identity.
  assert.equal(resolveAccountDeletionPath(devId, false), 'real-account');
  // The active simulated user with a dev handler uses the dev-only path.
  assert.equal(resolveAccountDeletionPath(devId, true), 'dev-simulator');
  // Null / unknown identity never uses the dev-only path.
  assert.equal(resolveAccountDeletionPath(null, true), 'real-account');
  assert.equal(resolveAccountDeletionPath(undefined, true), 'real-account');

  setActiveDevFreshUserId(null);
});
