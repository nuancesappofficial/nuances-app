import { createServiceRoleClient, syncRevenueCatSubscriptionToSupabase } from '../_shared/entitlement.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REVENUECAT_WEBHOOK_AUTH_TOKEN = (Deno.env.get('REVENUECAT_WEBHOOK_AUTH_TOKEN') ?? '').trim();

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isAuthorized(req: Request): boolean {
  if (!REVENUECAT_WEBHOOK_AUTH_TOKEN) return true;
  const authHeader = req.headers.get('authorization')?.trim() ?? '';
  return authHeader === `Bearer ${REVENUECAT_WEBHOOK_AUTH_TOKEN}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!isAuthorized(req)) {
    return jsonResponse({ error: 'Unauthorized webhook request' }, 401);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400);
  }

  const appUserId =
    payload?.event?.app_user_id ||
    payload?.app_user_id ||
    payload?.event?.aliases?.[0] ||
    payload?.aliases?.[0] ||
    null;

  if (!appUserId || typeof appUserId !== 'string') {
    return jsonResponse({ error: 'Missing app_user_id in RevenueCat webhook payload' }, 400);
  }

  try {
    const supabase = createServiceRoleClient();
    await syncRevenueCatSubscriptionToSupabase({
      supabase,
      userId: appUserId,
    });
    return jsonResponse({ ok: true, userId: appUserId });
  } catch (error) {
    console.error('[revenuecat-webhook] failed:', error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'RevenueCat webhook sync failed',
      },
      500
    );
  }
});
