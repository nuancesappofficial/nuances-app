import { createServiceRoleClient } from '../_shared/entitlement.ts';
import { createSupabaseCampaignRepository } from '../growth-campaigns/_shared/supabaseCampaignRepository.ts';
import { createContentCreationManager } from './_shared/contentCreationManager.ts';
import { createPostHogPerformanceAdapter } from './_shared/postHogPerformanceAdapter.ts';

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

function normalizeCount(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return number;
}

DenoRuntime.serve(async (req: Request) => {
  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  try {
    if (req.method === 'GET') {
      const supabase = createServiceRoleClient();
      const url = new URL(req.url);
      const requestedLimit = Number(url.searchParams.get('limit') ?? 10);
      const limit = Number.isInteger(requestedLimit)
        ? Math.min(20, Math.max(1, requestedLimit))
        : 10;
      const { data, error } = await supabase
        .from('growth_manager_runs')
        .select('id, manager, minimum_views, report, created_at')
        .eq('manager', 'content_creation')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return json({ runs: data ?? [] });
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const body = await req.json();
    const requestedMinimumViews = Number(body?.minimumViews ?? 200);
    if (!Number.isInteger(requestedMinimumViews) || requestedMinimumViews <= 0) {
      throw new Error('minimumViews must be a positive integer');
    }
    const minimumViews = requestedMinimumViews;
    const inputSnapshots = (Array.isArray(body?.performanceSnapshots)
      ? body.performanceSnapshots
      : []
    ).map((snapshot: Record<string, unknown>) => ({
      campaignId: String(snapshot.campaignId ?? ''),
      views: normalizeCount(snapshot.views, 'views'),
      engagements: normalizeCount(snapshot.engagements, 'engagements'),
    }));

    const supabase = createServiceRoleClient();
    const campaignRepository = createSupabaseCampaignRepository(supabase);
    const campaigns = await campaignRepository.list({
      manager: 'content_creation',
      status: 'active',
    });
    const postHog = createPostHogPerformanceAdapter({
      host: DenoRuntime.env.get('POSTHOG_HOST') ?? 'https://us.posthog.com',
      projectId: DenoRuntime.env.get('POSTHOG_PROJECT_ID') ?? '',
      token: DenoRuntime.env.get('POSTHOG_PERSONAL_API_KEY') ?? '',
    });
    const conversions = await postHog.getConversions({
      campaignIds: campaigns.map((campaign) => campaign.campaignId),
      lookbackDays: normalizeCount(body?.lookbackDays ?? 30, 'lookbackDays'),
    });
    const conversionByCampaign = new Map(
      conversions.map((conversion) => [conversion.campaignId, conversion])
    );
    const inputByCampaign = new Map(
      inputSnapshots.map((snapshot) => [snapshot.campaignId, snapshot])
    );
    const performanceSnapshots = campaigns.map((campaign) => {
      const input = inputByCampaign.get(campaign.campaignId);
      const conversion = conversionByCampaign.get(campaign.campaignId);
      return {
        campaignId: campaign.campaignId,
        views: input?.views ?? 0,
        engagements: input?.engagements ?? 0,
        cardCreators: conversion?.cardCreators ?? 0,
        payingUsers: conversion?.payingUsers ?? 0,
      };
    });
    const manager = createContentCreationManager({ minimumViews });
    const report = manager.reviewCampaigns({ campaigns, performanceSnapshots });

    const { data: run, error: runError } = await supabase
      .from('growth_manager_runs')
      .insert({ manager: 'content_creation', minimum_views: minimumViews, report })
      .select('id, manager, minimum_views, created_at')
      .single();
    if (runError) throw runError;

    if (performanceSnapshots.length > 0) {
      const { error } = await supabase
        .from('growth_campaign_performance_snapshots')
        .insert(
          performanceSnapshots.map((snapshot) => ({
            manager_run_id: run.id,
            campaign_id: snapshot.campaignId,
            views: snapshot.views,
            engagements: snapshot.engagements,
            card_creators: snapshot.cardCreators,
            paying_users: snapshot.payingUsers,
          }))
        );
      if (error) throw error;
    }

    if (report.draftTasks.length > 0) {
      const { error } = await supabase.from('growth_agent_tasks').insert(
        report.draftTasks.map((task) => ({
          manager_run_id: run.id,
          campaign_id: task.campaignId,
          assigned_agent: task.assignedAgent,
          action: task.action,
          brief: task.brief,
          status: 'draft',
          requires_approval: true,
        }))
      );
      if (error) throw error;
    }

    return json({ run, ...report }, 201);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.error('[content-creation-manager] run failed', error);
    return json({ error: 'Manager run failed', reason }, 400);
  }
});
