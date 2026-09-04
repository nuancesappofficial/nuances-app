import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseGrowthAttributionUrl,
  trackFirstAppOpenOnce,
  withGrowthAttribution,
} from './growthAnalytics.ts';

test('first app open is captured only once for an installation', async () => {
  const values = new Map();
  const events = [];
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => void values.set(key, value),
  };
  const capture = (event, properties) => events.push({ event, properties });

  assert.equal(await trackFirstAppOpenOnce(storage, capture), true);
  assert.equal(await trackFirstAppOpenOnce(storage, capture), false);
  assert.deepEqual(events, [
    {
      event: 'first_app_opened',
      properties: { download_source: 'app_first_open' },
    },
  ]);
});

test('growth attribution is read from a campaign link', () => {
  assert.deepEqual(
    parseGrowthAttributionUrl(
      'nuances://open?manager=content_creation&platform=tiktok&method=remix&campaign_id=interview-01'
    ),
    {
      growth_manager: 'content_creation',
      growth_platform: 'tiktok',
      growth_method: 'remix',
      growth_campaign_id: 'interview-01',
    }
  );
});

test('custom-scheme attribution does not depend on the global URL implementation', () => {
  const originalUrl = globalThis.URL;
  try {
    globalThis.URL = undefined;
    assert.deepEqual(
      parseGrowthAttributionUrl(
        'nuances://open?manager=content_creation&platform=tiktok&method=remix&campaign_id=test-02'
      ),
      {
        growth_manager: 'content_creation',
        growth_platform: 'tiktok',
        growth_method: 'remix',
        growth_campaign_id: 'test-02',
      }
    );
  } finally {
    globalThis.URL = originalUrl;
  }
});

test('stored growth attribution is attached to an analytics event', () => {
  assert.deepEqual(
    withGrowthAttribution(
      {
        growth_manager: 'engagement',
        growth_platform: 'reddit',
        growth_method: 'reply',
        growth_campaign_id: 'natural-english-01',
      },
      { plan: 'monthly' }
    ),
    {
      growth_manager: 'engagement',
      growth_platform: 'reddit',
      growth_method: 'reply',
      growth_campaign_id: 'natural-english-01',
      plan: 'monthly',
    }
  );
});
