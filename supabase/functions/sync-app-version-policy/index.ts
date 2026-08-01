import { createServiceRoleClient } from '../_shared/entitlement.ts';

function buildCorsHeaders(req?: Request): Record<string, string> {
  const configuredOrigin = (Deno.env.get('APP_VERSION_POLICY_ALLOWED_ORIGIN') ?? '').trim();
  const requestOrigin = req?.headers.get('origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (configuredOrigin && requestOrigin === configuredOrigin) {
    headers['Access-Control-Allow-Origin'] = configuredOrigin;
    headers['Vary'] = 'Origin';
  }

  return headers;
}

type AppVersionPolicyPayload = {
  platform?: unknown;
  latestVersion?: unknown;
  minimumSupportedVersion?: unknown;
  latestBuildNumber?: unknown;
  minimumSupportedBuildNumber?: unknown;
  required?: unknown;
  source?: unknown;
};

function jsonResponse(payload: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizePositiveInt(value: unknown, name: string): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function assertSyncToken(req: Request) {
  const expectedToken = (Deno.env.get('APP_VERSION_POLICY_SYNC_TOKEN') ?? '').trim();
  const providedToken = (req.headers.get('x-sync-token') ?? '').trim();
  if (!expectedToken) {
    throw new Error('Server missing APP_VERSION_POLICY_SYNC_TOKEN');
  }
  if (!providedToken || providedToken !== expectedToken) {
    return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, req);
  }

  try {
    if (!assertSyncToken(req)) {
      return jsonResponse({ error: 'Unauthorized' }, 401, req);
    }

    const body = (await req.json()) as AppVersionPolicyPayload;
    const nowIso = new Date().toISOString();
    const platform = normalizeString(body.platform, 'ios');
    const latestVersion = normalizeString(body.latestVersion, '1.0.0');
    const minimumSupportedVersion = normalizeString(body.minimumSupportedVersion, latestVersion);
    const latestBuildNumber = normalizePositiveInt(body.latestBuildNumber, 'latestBuildNumber');
    const minimumSupportedBuildNumber = normalizePositiveInt(
      body.minimumSupportedBuildNumber ?? latestBuildNumber,
      'minimumSupportedBuildNumber'
    );
    const required = typeof body.required === 'boolean' ? body.required : true;

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('app_version_policy')
      .upsert(
        {
          platform,
          latest_version: latestVersion,
          minimum_supported_version: minimumSupportedVersion,
          latest_build_number: latestBuildNumber,
          minimum_supported_build_number: minimumSupportedBuildNumber,
          required,
          updated_at: nowIso,
        },
        { onConflict: 'platform' }
      )
      .select('platform, latest_version, minimum_supported_version, latest_build_number, minimum_supported_build_number, required, updated_at')
      .single();

    if (error) {
      throw error;
    }

    console.log('[sync-app-version-policy] updated', {
      platform,
      latestVersion,
      minimumSupportedVersion,
      latestBuildNumber,
      minimumSupportedBuildNumber,
      required,
      source: typeof body.source === 'string' ? body.source : null,
    });

    return jsonResponse({ ok: true, policy: data }, 200, req);
  } catch (error) {
    console.error('[sync-app-version-policy] failed:', error);
    return jsonResponse(
      {
        error: 'sync-app-version-policy failed',
        reason: 'version_policy_sync_failed',
      },
      500,
      req
    );
  }
});
