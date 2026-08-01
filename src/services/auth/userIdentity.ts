import { getCurrentSession, getCurrentUser } from '@services/supabase/client';

/**
 * UI-safe identity lookup.
 *
 * This reads the persisted Supabase session and must be used for local database,
 * AsyncStorage, filesystem namespaces, and optimistic UI work. It does not make
 * a server request.
 */
export async function getCurrentSessionUserId(): Promise<string | null> {
  const { session, error } = await getCurrentSession();
  if (error) return null;
  return session?.user?.id ?? null;
}

/**
 * Server-verified identity lookup.
 *
 * This may perform network I/O. Only use it inside an operation that already
 * requires the network (sync, protected cloud actions), never before local UI
 * state is committed.
 */
export async function getVerifiedAuthUserId(): Promise<string | null> {
  const { user, error } = await getCurrentUser();
  if (error) {
    return null;
  }
  return user?.id ?? null;
}

/** @deprecated Use getCurrentSessionUserId for local work or getVerifiedAuthUserId for cloud verification. */
export async function getCurrentAuthUserId(): Promise<string | null> {
  return getVerifiedAuthUserId();
}

export async function requireCurrentSessionUserId(): Promise<string> {
  const userId = await getCurrentSessionUserId();
  if (!userId) {
    throw new Error('使用者尚未登入，請先完成 Supabase Auth 登入');
  }
  return userId;
}

export async function requireCurrentAuthUserId(): Promise<string> {
  return requireCurrentSessionUserId();
}

export async function assertRecordOwnedByCurrentUser(
  recordUserId: string,
  context: string
): Promise<string> {
  const currentUserId = await requireCurrentSessionUserId();
  if (!recordUserId || currentUserId !== recordUserId) {
    throw new Error(`${context} 已不屬於目前登入帳號，操作已取消`);
  }
  return currentUserId;
}
