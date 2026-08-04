// Pure, dependency-free helpers for the dev fresh-user simulator.
//
// Kept separate from devFreshUserSimulator.ts so the id/session/gating logic
// can be unit-tested in a plain Node environment without pulling in native
// modules (WatermelonDB, AsyncStorage, expo-file-system).

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

export function createDevFreshUserId(): string {
  return `${DEV_FRESH_USER_PREFIX}-${Date.now()}`;
}

export function isDevFreshUserId(userId: string | null | undefined): boolean {
  return Boolean(userId && userId.startsWith(`${DEV_FRESH_USER_PREFIX}-`));
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
