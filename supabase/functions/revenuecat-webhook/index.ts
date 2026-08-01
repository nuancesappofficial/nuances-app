import { createServiceRoleClient, syncRevenueCatSubscriptionToSupabase } from '../_shared/entitlement.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REVENUECAT_WEBHOOK_AUTH_TOKEN = (Deno.env.get('REVENUECAT_WEBHOOK_AUTH_TOKEN') ?? '').trim();
const ALLOW_UNAUTHENTICATED_WEBHOOK_DEV =
  (Deno.env.get('ALLOW_UNAUTHENTICATED_WEBHOOK_DEV') ?? '').trim().toLowerCase() === 'true';

function isDevRuntime(): boolean {
  const runtimeEnv = (
    Deno.env.get('APP_ENV') ??
    Deno.env.get('ENVIRONMENT') ??
    Deno.env.get('NODE_ENV') ??
    Deno.env.get('SUPABASE_ENV') ??
    ''
  ).trim().toLowerCase();
  return ['dev', 'development', 'local', 'test'].includes(runtimeEnv);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isAuthorized(req: Request): boolean {
  if (!REVENUECAT_WEBHOOK_AUTH_TOKEN) {
    return ALLOW_UNAUTHENTICATED_WEBHOOK_DEV && isDevRuntime();
  }
  const authHeader = req.headers.get('authorization')?.trim() ?? '';
  return timingSafeEqual(authHeader, `Bearer ${REVENUECAT_WEBHOOK_AUTH_TOKEN}`);
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const max = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < max; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!REVENUECAT_WEBHOOK_AUTH_TOKEN && !(ALLOW_UNAUTHENTICATED_WEBHOOK_DEV && isDevRuntime())) {
    return jsonResponse({ error: 'Webhook auth token is not configured' }, 500);
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
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('[revenuecat-webhook] failed:', error);
    return jsonResponse(
      {
        error: 'RevenueCat webhook sync failed',
        reason: 'webhook_sync_failed',
      },
      500
    );
  }
});
