import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeAnalyticsIdentityProperties } from './identity.ts';

test('normalizes an authenticated email for PostHog person properties', () => {
  assert.deepEqual(
    normalizeAnalyticsIdentityProperties({
      email: '  learner@example.com  ',
    }),
    {
      email: 'learner@example.com',
    }
  );
});

test('omits a missing or blank email instead of creating an empty person property', () => {
  assert.deepEqual(normalizeAnalyticsIdentityProperties(), {});
  assert.deepEqual(normalizeAnalyticsIdentityProperties({ email: '   ' }), {});
});

test('keeps normalized growth attribution as person properties', () => {
  assert.deepEqual(
    normalizeAnalyticsIdentityProperties({
      growth_manager: ' Content_Creation ',
      growth_platform: ' TikTok ',
      growth_method: ' Remix ',
      growth_campaign_id: ' Interview-01 ',
    }),
    {
      growth_manager: 'content_creation',
      growth_platform: 'tiktok',
      growth_method: 'remix',
      growth_campaign_id: 'interview-01',
    }
  );
});
