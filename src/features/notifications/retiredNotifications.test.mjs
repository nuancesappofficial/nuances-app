import assert from 'node:assert/strict';
import test from 'node:test';

import { cancelRetiredNotifications } from './retiredNotifications.ts';

test('cancels the retired trial-ending notification', async () => {
  const cancelledIds = [];

  await cancelRetiredNotifications(async (identifier) => {
    cancelledIds.push(identifier);
  });

  assert.deepEqual(cancelledIds, ['nuances-trial-ending-reminder']);
});
