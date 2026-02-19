import { getCurrentUser } from '@services/supabase/client';

export async function getCurrentAuthUserId(): Promise<string | null> {
  const { user, error } = await getCurrentUser();
  if (error) {
    return null;
  }
  return user?.id ?? null;
}

export async function requireCurrentAuthUserId(): Promise<string> {
  const userId = await getCurrentAuthUserId();
  if (!userId) {
    throw new Error('使用者尚未登入，請先完成 Supabase Auth 登入');
  }
  return userId;
}
