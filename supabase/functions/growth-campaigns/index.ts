import { createServiceRoleClient } from '../_shared/entitlement.ts';
import {
  createCampaignRegistry,
  type CampaignManager,
  type CampaignStatus,
} from './_shared/campaignRegistry.ts';
import { createSupabaseCampaignRepository } from './_shared/supabaseCampaignRepository.ts';

const DenoRuntime = Deno;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isAuthorized(req: Request): boolean {
  const expected = (DenoRuntime.env.get('GROWTH_OPERATIONS_TOKEN') ?? '').trim();
  const provided = (req.headers.get('x-growth-token') ?? '').trim();
  if (!expected) throw new Error('Server missing GROWTH_OPERATIONS_TOKEN');
  return provided.length > 0 && provided === expected;
}

DenoRuntime.serve(async (req: Request) => {
  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = createServiceRoleClient();
  const registry = createCampaignRegistry({
    repository: createSupabaseCampaignRepository(supabase),
  });

  try {
    if (req.method === 'POST') {
      const result = await registry.registerCampaign(await req.json());
      return json(result, 201);
    }

    if (req.method === 'PATCH') {
      const body = await req.json();
      if (body?.action !== 'activate' || typeof body?.campaignId !== 'string') {
        return json({ error: 'Invalid activation request' }, 400);
      }
      return json(await registry.activateCampaign(body.campaignId));
    }

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const manager = url.searchParams.get('manager') || undefined;
      const status = url.searchParams.get('status') || undefined;
      const campaigns = await registry.listCampaigns({
        manager: manager as CampaignManager | undefined,
        status: status as CampaignStatus | undefined,
      });
      return json({ campaigns });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isInputError =
      message.includes('required') || message.includes('Unsupported growth manager');
    console.error('[growth-campaigns] request failed', error);
    return json(
      {
        error: isInputError ? 'Invalid campaign' : 'Campaign registry failed',
        reason: message,
      },
      isInputError ? 400 : 500
    );
  }
});
