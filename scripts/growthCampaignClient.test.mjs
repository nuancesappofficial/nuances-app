import assert from 'node:assert/strict';
import test from 'node:test';

import { createGrowthCampaignClient } from './growthCampaignClient.mjs';

test('agent registers a campaign without handling registry authentication details', async () => {
  const requests = [];
  const client = createGrowthCampaignClient({
    endpoint: 'https://registry.example.test/growth-campaigns',
    getToken: async () => 'secret-token',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(
        JSON.stringify({ campaign: { campaignId: 'campaign-01' } }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    },
  });

  const result = await client.registerCampaign({
    name: 'TikTok pilot',
    ownerAgent: 'tiktok_remix_agent',
    manager: 'content_creation',
    platform: 'tiktok',
    method: 'remix',
  });

  assert.equal(result.campaign.campaignId, 'campaign-01');
  assert.deepEqual(requests, [
    {
      url: 'https://registry.example.test/growth-campaigns',
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-growth-token': 'secret-token',
        },
        body: JSON.stringify({
          name: 'TikTok pilot',
          ownerAgent: 'tiktok_remix_agent',
          manager: 'content_creation',
          platform: 'tiktok',
          method: 'remix',
        }),
      },
    },
  ]);
});

test('operator can explicitly activate a draft campaign', async () => {
  const requests = [];
  const client = createGrowthCampaignClient({
    endpoint: 'https://registry.example.test/growth-campaigns',
    getToken: async () => 'secret-token',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ campaign: { status: 'active' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const result = await client.activateCampaign('campaign-01');

  assert.equal(result.campaign.status, 'active');
  assert.equal(requests[0].init.method, 'PATCH');
  assert.equal(
    requests[0].init.body,
    JSON.stringify({ action: 'activate', campaignId: 'campaign-01' })
  );
});
