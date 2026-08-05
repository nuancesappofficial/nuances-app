// Pure, dependency-free helpers for the dev fresh-user simulator.
//
// Kept separate from devFreshUserSimulator.ts so the id/session/gating logic
// can be unit-tested in a plain Node environment without pulling in native
// modules (WatermelonDB, AsyncStorage, expo-file-system).
//
// The simulated user id is a real, randomized UUID v4 (not a prefixed string)
// so that every Supabase UUID-keyed write/filter (profiles upsert, markTourSeen,
// sync pull/push, card cloud persistence) accepts it. Postgres rejects any
// non-UUID string against a uuid column with error 22P02.

export type DevFreshUserSession = {
  access_token: string;
  user: {
    id: string;
    email?: string;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  };
};

export const DEV_FRESH_USER_PREFIX = 'dev-fresh-user';

let activeDevFreshUserId: string | null = null;

export function setActiveDevFreshUserId(userId: string | null): void {
  activeDevFreshUserId = userId;
}

export function getActiveDevFreshUserId(): string | null {
  return activeDevFreshUserId;
}

export function isDevToolsEnabled(): boolean {
  // __DEV__ is a React Native compile-time global; guard it so this module can
  // also be imported from a plain Node test environment.
  const isDevBuild = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  const explicitFlag = String(process.env.EXPO_PUBLIC_INTERNAL_TESTER_TOOLS || '')
    .trim()
    .toLowerCase();
  return isDevBuild && explicitFlag !== 'false';
}

export function isDevFreshUserSimulatorEnabled(): boolean {
  return isDevToolsEnabled();
}

/**
 * Generates a valid, randomized UUID v4 without importing any native module.
 *
 * Uses the global `crypto.getRandomValues`, which is available in Node >= 19
 * and in React Native via the `react-native-get-random-values` polyfill (loaded
 * by src/polyfills/webCrypto.ts). This keeps the module pure and Node-testable.
 */
function createUuidV4(): string {
  const bytes = new Uint8Array(16);
  const cryptoImpl = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoImpl?.getRandomValues === 'function') {
    cryptoImpl.getRandomValues(bytes);
  } else {
    // Last-resort fallback for environments without getRandomValues. Not
    // cryptographically strong, but sufficient for a dev-only synthetic id.
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createDevFreshUserId(): string {
  return createUuidV4();
}

/**
 * True when the given id is the currently active dev fresh-user id.
 *
 * The simulated id is a bare UUID v4, so it cannot be detected by prefix. Dev
 * identity is instead tracked via the active-dev-id flag set by
 * `simulateFreshUser()`.
 */
export function isDevFreshUserId(userId: string | null | undefined): boolean {
  return Boolean(userId && activeDevFreshUserId === userId);
}

export function buildDevFreshUserSession(userId: string): DevFreshUserSession {
  return {
    access_token: `dev-fresh-user-token-${userId}`,
    user: {
      id: userId,
      email: `${DEV_FRESH_USER_PREFIX}@local.dev`,
      app_metadata: {},
      user_metadata: {},
    },
  };
}
