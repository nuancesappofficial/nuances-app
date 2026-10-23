import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');

// index.ts 會在 import 時呼叫 Deno.serve，所以用原始碼順序鎖住行為：
// cached_pronunciations 命中時，任何已登入使用者（含 starter 額度用完的 free）
// 都直接拿到 audioUrl；只有 cache miss（要叫 Azure 生成新音檔）才走 free 閘門
// 與 fair-use / period 配額。

const indexOf = (needle) => {
  const index = source.indexOf(needle);
  assert.notEqual(index, -1, `missing in tts-proxy/index.ts: ${needle}`);
  return index;
};

const cacheLookup = indexOf(".from('cached_pronunciations')\n      .select('audio_url')");
const cacheHitReturn = indexOf('return jsonResponse({ audioUrl: cacheHit.audio_url, cached: true });');
const starterAllowanceRpc = indexOf("'get_free_starter_card_allowance'");
const premiumRequired = indexOf("reason: 'premium_required'");
const quotaEnforcement = indexOf('await enforceTtsLimits(');
const azureCall = indexOf('const ttsResponse = await fetchWithTimeout(');
const jwtCheck = indexOf('missing valid JWT');

test('cache hit is returned before the free starter allowance gate', () => {
  assert.ok(cacheLookup < cacheHitReturn);
  assert.ok(cacheHitReturn < starterAllowanceRpc, 'starter allowance RPC must run only on cache miss');
  assert.ok(cacheHitReturn < premiumRequired, 'premium_required must not block cached audio');
});

test('cache miss is still gated for exhausted free users before Azure generation', () => {
  assert.ok(starterAllowanceRpc < premiumRequired);
  assert.ok(premiumRequired < azureCall, 'free gate must run before calling Azure');
});

test('cache hits do not count against fair-use or period quotas', () => {
  assert.ok(cacheHitReturn < quotaEnforcement, 'enforceTtsLimits must run only on cache miss');
  assert.ok(quotaEnforcement < azureCall);
});

test('cached audio still requires a signed-in user', () => {
  assert.ok(jwtCheck < cacheLookup, 'JWT check must stay ahead of the cache lookup');
});
