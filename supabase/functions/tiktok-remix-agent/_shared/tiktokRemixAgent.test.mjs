import assert from 'node:assert/strict';
import test from 'node:test';

import { createTikTokRemixAgent } from './tiktokRemixAgent.ts';

test('turns an approved manager task into a reviewable TikTok remix draft', () => {
  const agent = createTikTokRemixAgent();
  const draft = agent.createDraft({
    task: {
      id: 'task-1',
      status: 'approved',
      assignedAgent: 'tiktok_remix_agent',
      action: 'create_revised_variant',
      brief: 'Strong engagement, improve Card Creator conversion.',
    },
    campaign: {
      campaignId: 'content_creation-tiktok-remix-01',
      platform: 'tiktok',
      method: 'remix',
    },
  });

  assert.equal(draft.status, 'draft');
  assert.equal(draft.requiresPublishApproval, true);
  assert.equal(draft.trackingUrl.includes('campaign_id=content_creation-tiktok-remix-01'), true);
  assert.equal(draft.script.beats.at(-1).visual, 'Show the real Nuances app');
  assert.equal(draft.sourceBrief.reusePolicy, 'transform, comment, and credit; never repost unchanged');
});

test('refuses unapproved tasks and tasks assigned to another agent', () => {
  const agent = createTikTokRemixAgent();
  const campaign = {
    campaignId: 'campaign-1',
    platform: 'tiktok',
    method: 'remix',
  };
  const baseTask = {
    id: 'task-1',
    assignedAgent: 'tiktok_remix_agent',
    action: 'create_more_variants',
    brief: 'Make another variant.',
  };

  assert.throws(
    () => agent.createDraft({ task: { ...baseTask, status: 'draft' }, campaign }),
    /approved/
  );
  assert.throws(
    () =>
      agent.createDraft({
        task: { ...baseTask, status: 'approved', assignedAgent: 'youtube_ugc_agent' },
        campaign,
      }),
    /tiktok_remix_agent/
  );
});
