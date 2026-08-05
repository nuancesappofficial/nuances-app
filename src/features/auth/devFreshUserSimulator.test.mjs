import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEV_FRESH_USER_PREFIX,
  buildDevFreshUserSession,
  createDevFreshUserId,
  isDevFreshUserId,
  getActiveDevFreshUserId,
  setActiveDevFreshUserId,
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
