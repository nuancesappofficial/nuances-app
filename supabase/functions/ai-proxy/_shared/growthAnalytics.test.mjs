import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFreemiumQuotaEvent } from './growthAnalytics.ts';

test('a claimed starter card creates a PostHog quota event', () => {
  assert.deepEqual(
    buildFreemiumQuotaEvent({
      userId: 'user-123',
      generationId: 'generation-456',
      limit: 20,
      remaining: 5,
    }),
    {
      event: 'freemium_quota_updated',
      distinctId: 'user-123',
      insertId: 'starter-generation-generation-456',
      properties: {
        quota_limit: 20,
        quota_used: 15,
        quota_used_percent: 75,
      },
    }
  );
});
