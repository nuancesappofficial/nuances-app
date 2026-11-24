// Dependency-free so it can be unit-tested in plain Node.
//
// supabase.auth.getSession() refreshes an expired access token before it
// answers. Offline, that refresh retries with backoff for ~25s and then reports
// "no session", so every local action gated on identity (swipe-delete, clear
// cache, share-sheet ingest) stalled and then refused. Local work only needs to
// know who is signed in on this device, which the persisted session already
// says without any network I/O.

type AuthStorage = { getItem: (key: string) => Promise<string | null> | string | null };

export type LocalSessionSource = {
  storage?: AuthStorage;
  storageKey?: string;
};

export type LocalSessionUser = {
  id: string;
  created_at?: string;
  last_sign_in_at?: string;
};

function extractUser(raw: string | null): LocalSessionUser | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    // Older auth-js builds wrapped the session as { currentSession, expiresAt }.
    const session = (parsed?.currentSession ?? parsed) as
      | { refresh_token?: unknown; user?: { id?: unknown; created_at?: unknown; last_sign_in_at?: unknown } }
      | null
      | undefined;
    if (!session || typeof session.refresh_token !== 'string' || !session.refresh_token) return null;
    const id = session.user?.id;
    if (typeof id !== 'string' || !id) return null;
    const { created_at, last_sign_in_at } = session.user ?? {};
    return {
      id,
      ...(typeof created_at === 'string' ? { created_at } : {}),
      ...(typeof last_sign_in_at === 'string' ? { last_sign_in_at } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Reads the signed-in user id from the persisted Supabase session without
 * refreshing it. Returns null when nothing is persisted (signed out).
 */
export async function readLocalSessionUser(auth: unknown): Promise<LocalSessionUser | null> {
  const { storage, storageKey } = (auth ?? {}) as LocalSessionSource;
  if (!storage || typeof storage.getItem !== 'function' || !storageKey) return null;
  try {
    return extractUser(await storage.getItem(storageKey));
  } catch {
    return null;
  }
}

export async function readLocalSessionUserId(auth: unknown): Promise<string | null> {
  return (await readLocalSessionUser(auth))?.id ?? null;
}

/**
 * Who is signed in, for the cold start. A persisted session answers at once
 * with no network: getSession() would first refresh an expired token, and
 * with no service that keeps the splash up for seconds (then reads as signed
 * out). Only when nothing is persisted is `remoteLookup` asked.
 */
export async function resolveStartupUser(
  auth: unknown,
  remoteLookup: () => Promise<LocalSessionUser | null>
): Promise<LocalSessionUser | null> {
  return (await readLocalSessionUser(auth)) ?? (await remoteLookup());
}
