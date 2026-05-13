import {
  createServiceRoleClient,
  resolveServerEntitlement,
  syncRevenueCatSubscriptionToSupabase,
} from '../_shared/entitlement.ts';
import {
  getAuthenticatedUserFromAuthorization,
} from '../ai-proxy/auth/resolveUserFromBearerToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const user = await getAuthenticatedUserFromAuthorization(req);
  const userId = user?.id ?? null;
  if (!userId) {
    return jsonResponse({ error: 'Unauthorized: missing valid JWT' }, 401);
  }

  try {
    const supabase = createServiceRoleClient();
    await syncRevenueCatSubscriptionToSupabase({ supabase, userId });
    const snapshot = await resolveServerEntitlement({ supabase, userId, user });
    return jsonResponse(snapshot);
  } catch (error) {
    console.error('[sync-entitlement] failed:', error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'sync-entitlement failed',
      },
      500
    );
  }
});
