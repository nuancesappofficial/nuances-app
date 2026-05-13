declare const Deno: any;

export type AuthenticatedSupabaseUser = {
  id: string;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

async function resolveUserIdViaSupabaseAuth(
  req: Request,
  token: string
): Promise<AuthenticatedSupabaseUser | null> {
  const requestUrl = new URL(req.url);
  const supabaseOrigin = requestUrl.origin;
  const reqApiKey = req.headers.get('apikey');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = reqApiKey || supabaseAnonKey || supabaseServiceRoleKey;
  if (!supabaseOrigin || !apiKey) return null;

  try {
    const response = await fetch(`${supabaseOrigin}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: apiKey,
        authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json() as Record<string, unknown>;
    if (typeof payload.id === 'string' && payload.id.trim()) {
      return payload as AuthenticatedSupabaseUser;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getAuthenticatedUserFromAuthorization(
  req: Request
): Promise<AuthenticatedSupabaseUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  return await resolveUserIdViaSupabaseAuth(req, token);
}

export async function getUserIdFromAuthorization(req: Request): Promise<string | null> {
  const user = await getAuthenticatedUserFromAuthorization(req);
  return user?.id ?? null;
}
