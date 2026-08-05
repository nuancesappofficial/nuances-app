import { createServiceRoleClient } from '../_shared/entitlement.ts';
import { createTikTokRemixAgent } from './_shared/tiktokRemixAgent.ts';

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

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('growth_content_drafts')
        .select(
          'id, task_id, campaign_id, agent, platform, method, source_brief, script, tracking_url, status, requires_publish_approval, created_at'
        )
        .eq('agent', 'tiktok_remix_agent')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return json({ drafts: data ?? [] });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'approve_and_run_next') {
      return json({ error: 'action must be approve_and_run_next' }, 400);
    }

    const { data: queuedTask, error: queueError } = await supabase
      .from('growth_agent_tasks')
      .select('id, campaign_id, assigned_agent, action, brief, status')
      .eq('assigned_agent', 'tiktok_remix_agent')
      .eq('status', 'draft')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (queueError) throw queueError;
    if (!queuedTask) return json({ error: 'No draft TikTok Remix task available' }, 404);

    const { data: claimedTask, error: claimError } = await supabase
      .from('growth_agent_tasks')
      .update({ status: 'approved' })
      .eq('id', queuedTask.id)
      .eq('status', 'draft')
      .select('id, campaign_id, assigned_agent, action, brief, status')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimedTask) return json({ error: 'Task was already claimed' }, 409);

    const { data: campaign, error: campaignError } = await supabase
      .from('growth_campaigns')
      .select('campaign_id, platform, method, status')
      .eq('campaign_id', claimedTask.campaign_id)
      .single();
    if (campaignError) throw campaignError;
    if (campaign.status !== 'active') throw new Error('Campaign is not active');

    const agent = createTikTokRemixAgent();
    const draft = agent.createDraft({
      task: {
        id: claimedTask.id,
        status: claimedTask.status,
        assignedAgent: claimedTask.assigned_agent,
        action: claimedTask.action,
        brief: claimedTask.brief,
      },
      campaign: {
        campaignId: campaign.campaign_id,
        platform: campaign.platform,
        method: campaign.method,
      },
    });

    const { data: savedDraft, error: draftError } = await supabase
      .from('growth_content_drafts')
      .insert({
        task_id: claimedTask.id,
        campaign_id: campaign.campaign_id,
        agent: 'tiktok_remix_agent',
        platform: campaign.platform,
        method: campaign.method,
        source_brief: draft.sourceBrief,
        script: draft.script,
        tracking_url: draft.trackingUrl,
        status: draft.status,
        requires_publish_approval: draft.requiresPublishApproval,
      })
      .select(
        'id, task_id, campaign_id, agent, source_brief, script, tracking_url, status, requires_publish_approval, created_at'
      )
      .single();
    if (draftError) {
      await supabase
        .from('growth_agent_tasks')
        .update({ status: 'draft' })
        .eq('id', claimedTask.id)
        .eq('status', 'approved');
      throw draftError;
    }

    const { error: completeError } = await supabase
      .from('growth_agent_tasks')
      .update({ status: 'completed' })
      .eq('id', claimedTask.id)
      .eq('status', 'approved');
    if (completeError) throw completeError;

    return json({ draft: savedDraft }, 201);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tiktok-remix-agent] request failed', error);
    return json({ error: 'TikTok Remix Agent failed', reason }, 400);
  }
});
