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

function extractUserId(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    // Older auth-js builds wrapped the session as { currentSession, expiresAt }.
    const session = (parsed?.currentSession ?? parsed) as
      | { refresh_token?: unknown; user?: { id?: unknown } }
      | null
      | undefined;
    if (!session || typeof session.refresh_token !== 'string' || !session.refresh_token) return null;
    const id = session.user?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

/**
 * Reads the signed-in user id from the persisted Supabase session without
 * refreshing it. Returns null when nothing is persisted (signed out).
 */
export async function readLocalSessionUserId(auth: unknown): Promise<string | null> {
  const { storage, storageKey } = (auth ?? {}) as LocalSessionSource;
  if (!storage || typeof storage.getItem !== 'function' || !storageKey) return null;
  try {
    return extractUserId(await storage.getItem(storageKey));
  } catch {
    return null;
  }
}
