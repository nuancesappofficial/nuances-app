import assert from 'node:assert/strict';
import test from 'node:test';

import { createContentCreationManager } from './contentCreationManager.ts';

const campaigns = [
  {
    campaignId: 'tiktok-remix-01',
    ownerAgent: 'tiktok_remix_agent',
    manager: 'content_creation',
    platform: 'tiktok',
    method: 'remix',
    status: 'active',
  },
  {
    campaignId: 'youtube-ugc-01',
    ownerAgent: 'youtube_ugc_agent',
    manager: 'content_creation',
    platform: 'youtube',
    method: 'ugc',
    status: 'active',
  },
  {
    campaignId: 'instagram-ugc-01',
    ownerAgent: 'instagram_ugc_agent',
    manager: 'content_creation',
    platform: 'instagram',
    method: 'ugc',
    status: 'active',
  },
  {
    campaignId: 'youtube-remix-new',
    ownerAgent: 'youtube_remix_agent',
    manager: 'content_creation',
    platform: 'youtube',
    method: 'remix',
    status: 'active',
  },
];

test('manager compares campaigns and creates approval-gated draft tasks', () => {
  const manager = createContentCreationManager({ minimumViews: 200 });
  const result = manager.reviewCampaigns({
    campaigns,
    performanceSnapshots: [
      {
        campaignId: 'tiktok-remix-01',
        views: 1000,
        engagements: 40,
        cardCreators: 10,
        payingUsers: 0,
      },
      {
        campaignId: 'youtube-ugc-01',
        views: 1000,
        engagements: 30,
        cardCreators: 2,
        payingUsers: 0,
      },
      {
        campaignId: 'instagram-ugc-01',
        views: 1000,
        engagements: 0,
        cardCreators: 0,
        payingUsers: 0,
      },
      {
        campaignId: 'youtube-remix-new',
        views: 50,
        engagements: 2,
        cardCreators: 0,
        payingUsers: 0,
      },
    ],
  });

  assert.deepEqual(
    result.decisions.map(({ campaignId, decision }) => ({ campaignId, decision })),
    [
      { campaignId: 'tiktok-remix-01', decision: 'scale' },
      { campaignId: 'youtube-ugc-01', decision: 'iterate' },
      { campaignId: 'instagram-ugc-01', decision: 'stop' },
      { campaignId: 'youtube-remix-new', decision: 'collect_more_data' },
    ]
  );
  assert.deepEqual(
    result.draftTasks.map(({ campaignId, assignedAgent, action, requiresApproval }) => ({
      campaignId,
      assignedAgent,
      action,
      requiresApproval,
    })),
    [
      {
        campaignId: 'tiktok-remix-01',
        assignedAgent: 'tiktok_remix_agent',
        action: 'create_more_variants',
        requiresApproval: true,
      },
      {
        campaignId: 'youtube-ugc-01',
        assignedAgent: 'youtube_ugc_agent',
        action: 'create_revised_variant',
        requiresApproval: true,
      },
    ]
  );
});
