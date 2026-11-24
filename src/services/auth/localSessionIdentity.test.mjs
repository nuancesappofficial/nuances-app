import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { readLocalSessionUserId } from './localSessionIdentity.ts';

const USER_ID = '11111111-2222-4333-8444-555555555555';
const STORAGE_KEY = 'sb-example-auth-token';

// A real auth client with no network and an access token that expired 2h ago:
// the state of a phone with no service after the app sat idle for an hour.
function makeOfflineClient(persisted) {
  const store = new Map(persisted ? [[STORAGE_KEY, JSON.stringify(persisted)]] : []);
  let fetchCalls = 0;
  const client = createClient('https://example.supabase.co', 'anon', {
    auth: {
      storageKey: STORAGE_KEY,
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      storage: {
        getItem: async (k) => store.get(k) ?? null,
        setItem: async (k, v) => void store.set(k, v),
        removeItem: async (k) => void store.delete(k),
      },
    },
    global: {
      // No service: requests never come back. (getSession() on this client
      // would wait on the stuck refresh forever.)
      fetch: () => {
        fetchCalls += 1;
        return new Promise(() => {});
      },
    },
  });
  return { client, fetchCalls: () => fetchCalls };
}

const expiredSession = () => ({
  access_token: 'expired.jwt.token',
  refresh_token: 'refresh-1',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) - 7200,
  user: { id: USER_ID, aud: 'authenticated' },
});

test('offline with an expired token: returns the signed-in user at once, no network', async () => {
  const { client, fetchCalls } = makeOfflineClient(expiredSession());
  const before = fetchCalls();
  const started = Date.now();
  const userId = await readLocalSessionUserId(client.auth);
  assert.equal(userId, USER_ID);
  assert.ok(Date.now() - started < 500, 'identity lookup must not wait on the network');
  assert.equal(fetchCalls(), before, 'identity lookup must not call the network');
});

const plainAuth = (persisted) => ({
  storageKey: STORAGE_KEY,
  storage: { getItem: async () => (persisted ? JSON.stringify(persisted) : null) },
});

test('signed out: returns null', async () => {
  assert.equal(await readLocalSessionUserId(plainAuth(null)), null);
});

test('session without a refresh token is not treated as signed in', async () => {
  assert.equal(await readLocalSessionUserId(plainAuth({ ...expiredSession(), refresh_token: '' })), null);
});

test('legacy { currentSession } wrapper is read', async () => {
  assert.equal(await readLocalSessionUserId(plainAuth({ currentSession: expiredSession(), expiresAt: 0 })), USER_ID);
});

// ── Cold start (splash) ──────────────────────────────────────────────────────
import { resolveStartupUser } from './localSessionIdentity.ts';

test('cold start offline with an expired token: user resolves at once, no getSession wait', async () => {
  const { client, fetchCalls } = makeOfflineClient({
    ...expiredSession(),
    user: { id: USER_ID, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z', last_sign_in_at: '2026-11-01T00:00:00Z' },
  });
  let getSessionCalls = 0;
  const started = Date.now();
  const user = await resolveStartupUser(client.auth, async () => {
    getSessionCalls += 1;
    return new Promise(() => {}); // refresh that never answers, like no service
  });
  assert.equal(user?.id, USER_ID);
  assert.equal(user?.created_at, '2026-01-01T00:00:00Z');
  assert.ok(Date.now() - started < 500, 'splash must not wait on the network');
  assert.equal(getSessionCalls, 0, 'a persisted session needs no getSession() at startup');
  assert.equal(fetchCalls(), 0);
});

test('cold start with nothing persisted falls back to the remote lookup', async () => {
  const { client } = makeOfflineClient(null);
  const user = await resolveStartupUser(client.auth, async () => ({ id: 'from-remote' }));
  assert.equal(user?.id, 'from-remote');
});
