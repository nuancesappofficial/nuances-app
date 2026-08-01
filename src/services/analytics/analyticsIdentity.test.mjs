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
