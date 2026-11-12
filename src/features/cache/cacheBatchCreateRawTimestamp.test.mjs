import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('CachedItem model createdAt is @readonly, so batch creation must assign to _raw directly', () => {
  const filePath = join(__dirname, '../../screens/flow/CacheScreenFlow/hooks/useCacheQuickAddFlow.ts');
  const fileContent = readFileSync(filePath, 'utf8');

  // Must not have direct assignment to item.createdAt
  assert.equal(
    /item\.createdAt\s*=/.test(fileContent),
    false,
    'useCacheQuickAddFlow must not directly assign to item.createdAt (throws @readonly invariant)'
  );

  // Must assign to _raw.created_at directly
  assert.equal(
    /\(item\._raw as any\)\.created_at\s*=/.test(fileContent),
    true,
    'useCacheQuickAddFlow must assign to (item._raw as any).created_at directly'
  );

  // Must also assign to _raw.updated_at directly
  assert.equal(
    /\(item\._raw as any\)\.updated_at\s*=/.test(fileContent),
    true,
    'useCacheQuickAddFlow must assign to (item._raw as any).updated_at directly'
  );
});
