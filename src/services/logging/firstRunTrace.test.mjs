import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFirstRunTrace,
  sanitizeFirstRunTraceConsoleContext,
} from './firstRunTrace.ts';

test('disabled first-run trace produces no output', () => {
  const entries = [];
  const trace = createFirstRunTrace({
    enabled: false,
    now: () => 1000,
    sink: (entry) => entries.push(entry),
  });

  trace.record('auth', 'sign_in_started');

  assert.deepEqual(entries, []);
});

test('enabled first-run trace numbers and times each journey event', () => {
  const entries = [];
  const times = [1000, 1125, 1600];
  const trace = createFirstRunTrace({
    enabled: true,
    now: () => times.shift(),
    sink: (entry) => entries.push(entry),
  });

  trace.record('auth', 'sign_in_started', { provider: 'apple' });
  trace.record('onboarding', 'screen_visible', { step: 1 });

  assert.deepEqual(entries, [
    {
      sequence: 1,
      elapsedMs: 125,
      stage: 'auth',
      event: 'sign_in_started',
      context: { provider: 'apple' },
    },
    {
      sequence: 2,
      elapsedMs: 600,
      stage: 'onboarding',
      event: 'screen_visible',
      context: { step: 1 },
    },
  ]);
});

test('console context redacts credentials and opaque error details', () => {
  assert.deepEqual(
    sanitizeFirstRunTraceConsoleContext({
      provider: 'apple',
      email: 'fresh-user@example.com',
      password: 'do-not-log',
      error: new Error('Bearer secret-token'),
    }),
    {
      provider: 'apple',
      email: '[redacted]',
      password: '[redacted]',
      error: '[object]',
    },
  );
});
