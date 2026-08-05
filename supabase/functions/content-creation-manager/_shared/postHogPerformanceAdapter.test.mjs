import assert from 'node:assert/strict';
import test from 'node:test';

import { createPostHogPerformanceAdapter } from './postHogPerformanceAdapter.ts';

test('reads Card Creators and Paying Users grouped by campaign', async () => {
  const requests = [];
  const adapter = createPostHogPerformanceAdapter({
    host: 'https://us.posthog.com',
    projectId: '531181',
    token: 'secret-token',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(
        JSON.stringify({
          columns: ['campaign_id', 'card_creators', 'paying_users'],
          results: [
            ['campaign-a', 4, 1],
            ['campaign-b', 2, 0],
          ],
        }),
        { status: 200 }
      );
    },
  });

  const result = await adapter.getConversions({
    campaignIds: ['campaign-a', 'campaign-b', 'campaign-missing'],
    lookbackDays: 30,
  });

  assert.deepEqual(result, [
    { campaignId: 'campaign-a', cardCreators: 4, payingUsers: 1 },
    { campaignId: 'campaign-b', cardCreators: 2, payingUsers: 0 },
    { campaignId: 'campaign-missing', cardCreators: 0, payingUsers: 0 },
  ]);
  assert.equal(requests[0].url, 'https://us.posthog.com/api/projects/531181/query/');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer secret-token');
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.query.kind, 'HogQLQuery');
  assert.match(body.query.query, /card_creation_succeeded/);
  assert.match(body.query.query, /subscription_started/);
});

test('fails without leaking the token when PostHog rejects the query', async () => {
  const adapter = createPostHogPerformanceAdapter({
    host: 'https://us.posthog.com/',
    projectId: '531181',
    token: 'do-not-leak',
    fetchImpl: async () => new Response('forbidden', { status: 403 }),
  });

  await assert.rejects(
    adapter.getConversions({ campaignIds: ['campaign-a'] }),
    (error) => {
      assert.match(error.message, /403/);
      assert.doesNotMatch(error.message, /do-not-leak/);
      return true;
    }
  );
});
