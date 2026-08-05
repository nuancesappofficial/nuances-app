import assert from 'node:assert/strict';
import test from 'node:test';

import { createCampaignRegistry } from './campaignRegistry.ts';

function createMemoryRepository() {
  const campaigns = [];
  return {
    async insert(campaign) {
      if (campaigns.some((item) => item.campaignId === campaign.campaignId)) {
        const error = new Error('duplicate campaign id');
        error.code = '23505';
        throw error;
      }
      campaigns.push(campaign);
      return campaign;
    },
    async list(filters = {}) {
      return campaigns.filter(
        (campaign) =>
          (!filters.manager || campaign.manager === filters.manager) &&
          (!filters.status || campaign.status === filters.status)
      );
    },
    async updateStatus(campaignId, status) {
      const campaign = campaigns.find((item) => item.campaignId === campaignId);
      if (!campaign) throw new Error('Campaign not found');
      campaign.status = status;
      return campaign;
    },
  };
}

test('registerCampaign returns a draft campaign and its Nuances tracking URL', async () => {
  const registry = createCampaignRegistry({
    repository: createMemoryRepository(),
    now: () => new Date('2026-08-02T04:00:00.000Z'),
    randomSuffix: () => 'a1b2c3d4',
  });

  const result = await registry.registerCampaign({
    name: 'Reddit launch replies',
    ownerAgent: 'Reddit Reply Agent',
    manager: 'engaging',
    platform: 'Reddit',
    method: 'Reply',
  });

  assert.deepEqual(result, {
    campaign: {
      campaignId: 'engaging-reddit-reply-20260802-a1b2c3d4',
      name: 'Reddit launch replies',
      ownerAgent: 'reddit_reply_agent',
      manager: 'engaging',
      platform: 'reddit',
      method: 'reply',
      status: 'draft',
      createdAt: '2026-08-02T04:00:00.000Z',
    },
    trackingUrl:
      'nuances://open?manager=engaging&platform=reddit&method=reply&campaign_id=engaging-reddit-reply-20260802-a1b2c3d4',
  });
});

test('registerCampaign retries when a generated Campaign ID already exists', async () => {
  const repository = createMemoryRepository();
  const suffixes = ['duplicate', 'duplicate', 'unique02'];
  const registry = createCampaignRegistry({
    repository,
    now: () => new Date('2026-08-02T04:00:00.000Z'),
    randomSuffix: () => suffixes.shift(),
  });
  const input = {
    name: 'Reddit reply',
    ownerAgent: 'reddit_reply_agent',
    manager: 'engaging',
    platform: 'reddit',
    method: 'reply',
  };

  const first = await registry.registerCampaign(input);
  const second = await registry.registerCampaign(input);

  assert.equal(
    first.campaign.campaignId,
    'engaging-reddit-reply-20260802-duplicate'
  );
  assert.equal(
    second.campaign.campaignId,
    'engaging-reddit-reply-20260802-unique02'
  );
});

test('listCampaigns returns filtered campaigns with ready-to-use tracking URLs', async () => {
  const registry = createCampaignRegistry({
    repository: createMemoryRepository(),
    now: () => new Date('2026-08-02T04:00:00.000Z'),
    randomSuffix: () => 'list0001',
  });
  await registry.registerCampaign({
    name: 'YouTube UGC',
    ownerAgent: 'youtube_ugc_agent',
    manager: 'content_creation',
    platform: 'youtube',
    method: 'ugc',
  });

  const campaigns = await registry.listCampaigns({
    manager: 'content_creation',
  });

  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].campaign.ownerAgent, 'youtube_ugc_agent');
  assert.equal(
    campaigns[0].trackingUrl,
    'nuances://open?manager=content_creation&platform=youtube&method=ugc&campaign_id=content_creation-youtube-ugc-20260802-list0001'
  );
});

test('activateCampaign makes a draft eligible for manager review', async () => {
  const registry = createCampaignRegistry({
    repository: createMemoryRepository(),
    now: () => new Date('2026-08-02T04:00:00.000Z'),
    randomSuffix: () => 'active01',
  });
  const created = await registry.registerCampaign({
    name: 'TikTok Remix',
    ownerAgent: 'tiktok_remix_agent',
    manager: 'content_creation',
    platform: 'tiktok',
    method: 'remix',
  });

  const activated = await registry.activateCampaign(created.campaign.campaignId);

  assert.equal(activated.campaign.status, 'active');
  assert.equal(activated.trackingUrl, created.trackingUrl);
});
