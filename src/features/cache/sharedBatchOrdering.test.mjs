import assert from 'node:assert/strict';
import test from 'node:test';
import { planSharedBatchCreation } from './sharedBatchOrdering.ts';

const BASE = 1700000000000;

test('mixed text/image share keeps input order: 1st shared = newest created_at', () => {
  const plan = planSharedBatchCreation(
    [
      { kind: 'text', value: 'A' },
      { kind: 'image', value: 'file:///b.jpg' },
      { kind: 'text', value: 'C' },
      { kind: 'image', value: 'file:///d.jpg' },
    ],
    { existingTexts: new Set(), existingImageUris: new Set(), baseTime: BASE }
  );
  assert.deepEqual(plan.map((p) => p.value), ['A', 'file:///b.jpg', 'C', 'file:///d.jpg']);
  for (let i = 1; i < plan.length; i += 1) {
    assert.ok(plan[i - 1].createdAt.getTime() > plan[i].createdAt.getTime());
  }
});

test('duplicates are skipped without breaking the order of the rest', () => {
  const plan = planSharedBatchCreation(
    [
      { kind: 'text', value: 'A' },
      { kind: 'text', value: 'dup' },
      { kind: 'image', value: 'file:///x.jpg' },
    ],
    { existingTexts: new Set(['dup']), existingImageUris: new Set(), baseTime: BASE }
  );
  assert.deepEqual(plan.map((p) => p.value), ['A', 'file:///x.jpg']);
  assert.ok(plan[0].createdAt.getTime() > plan[1].createdAt.getTime());
});
