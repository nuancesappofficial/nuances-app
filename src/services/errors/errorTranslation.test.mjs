import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyError,
  translateError,
  getErrorTranslation,
  createRecordingError,
} from './errorTranslation.ts';
import { attachEdgeErrorInfo, readEdgeErrorBody } from './edgeErrorInfo.ts';

// Builds the Error the edge client throws for a non-2xx response.
function edgeError(message, status, body, name) {
  const error = new Error(message);
  if (name) error.name = name;
  return attachEdgeErrorInfo(error, readEdgeErrorBody(status, body));
}

const CONNECTION_WORDS = /連線|網路/;

// --- The reported alert: server-side failures must not blame the network ---

test('503 starter_allowance_unavailable is a Nuances-side error, not the user network', () => {
  const error = edgeError(
    'AI action error: Starter allowance is temporarily unavailable (503): starter_allowance_unavailable: requestId=r1',
    503,
    { error: 'Starter allowance is temporarily unavailable', reason: 'starter_allowance_unavailable' }
  );
  assert.equal(classifyError(error), 'starter_allowance_unavailable');
  const translated = translateError(error);
  assert.equal(translated.ctaKind, 'retry');
  assert.match(translated.message, /不是你的網路/);
  assert.doesNotMatch(translated.title, /額度已滿/);
});

test('starter_allowance_unavailable copy never claims the allowance is used up', () => {
  const copy = getErrorTranslation('starter_allowance_unavailable');
  assert.doesNotMatch(copy.title + copy.message, /已滿|用完|升級/);
  assert.equal(copy.ctaKind, 'retry');
});

test('pronunciation_quota_unavailable copy does not claim the quota is reached', () => {
  const error = edgeError('x (503): pronunciation_quota_unavailable', 503, {
    reason: 'pronunciation_quota_unavailable',
  });
  assert.equal(classifyError(error), 'pronunciation_quota_unavailable');
  const copy = translateError(error);
  assert.doesNotMatch(copy.title + copy.message, /已達上限|用完/);
  assert.match(copy.message, /不是你的網路/);
});

test('generic 5xx says it is on Nuances side, not the connection', () => {
  const copy = translateError(
    edgeError('AI action error: Unexpected error (500): ai_proxy_request_failed', 500, {
      reason: 'ai_proxy_request_failed',
    })
  );
  assert.equal(copy.code, 'service_unavailable');
  assert.doesNotMatch(copy.title, CONNECTION_WORDS);
  assert.match(copy.message, /不是你的網路/);
  assert.equal(copy.ctaKind, 'retry');
});

test('Azure pronunciation 502 is a speech-service error on Nuances side', () => {
  const error = edgeError('x (502): azure_pronunciation_failed', 502, {
    reason: 'azure_pronunciation_failed',
  });
  assert.equal(classifyError(error), 'azure_tts_error');
  assert.doesNotMatch(translateError(error).title, CONNECTION_WORDS);
});

test('Azure 4xx (bad audio) asks the user to record again', () => {
  const error = edgeError('x (400): azure_pronunciation_failed', 400, {
    reason: 'azure_pronunciation_failed',
  });
  assert.equal(classifyError(error), 'recording_rejected');
});

test('provider ai_quota_exceeded is our provider limit, never the user paywall', () => {
  const error = edgeError('AI card generation failed (429): ai_quota_exceeded', 429, {
    reason: 'ai_quota_exceeded',
  });
  assert.equal(classifyError(error), 'service_unavailable');
});

test('dependency circuit-open 503 with unknown reason is still server-side', () => {
  const error = edgeError('x (503): azure-speech_unavailable', 503, {
    reason: 'azure-speech_unavailable',
  });
  assert.equal(classifyError(error), 'service_unavailable');
});

// --- Quota reasons drive the paywall regardless of status ---

test('free 20 lifetime pronunciations used -> free_starter_exhausted + LITE paywall', () => {
  const error = edgeError(
    'Premium or active trial required',
    403,
    { error: 'Free starter pronunciations used', reason: 'premium_required', paywallType: 'pronunciation', planType: 'free' },
    'PremiumFeatureError'
  );
  assert.equal(classifyError(error), 'free_starter_exhausted');
  assert.equal(translateError(error).ctaKind, 'open_paywall_lite');
});

test('free starter cards used -> free_starter_cards_exhausted + LITE paywall', () => {
  const error = edgeError('Premium or active trial required', 403, {
    reason: 'premium_required',
    paywallType: 'ai_generate',
  }, 'PremiumFeatureError');
  assert.equal(classifyError(error), 'free_starter_cards_exhausted');
  assert.equal(translateError(error).ctaKind, 'open_paywall_lite');
});

test('LITE monthly pronunciation quota (429) -> PRO paywall', () => {
  const error = edgeError('Premium or active trial required', 429, {
    reason: 'pronunciation_monthly_quota_exceeded',
    planType: 'lite',
  }, 'PremiumFeatureError');
  assert.equal(classifyError(error), 'pronunciation_monthly_quota_exceeded');
  assert.equal(translateError(error).ctaKind, 'open_paywall_pro');
});

test('top-plan monthly pronunciation quota does not upsell PRO again', () => {
  const error = edgeError('x', 429, {
    reason: 'pronunciation_monthly_quota_exceeded',
    planType: 'premium',
  });
  assert.equal(classifyError(error), 'pronunciation_quota_reached_top');
  assert.equal(translateError(error).ctaKind, 'dismiss');
});

test('fair-use pronunciation_month_quota_exceeded 429 is a quota, not rate limit', () => {
  const error = edgeError(
    "You've used this subscription period's pronunciation scoring fair-use limit.",
    429,
    { reason: 'pronunciation_month_quota_exceeded', planType: 'lite' }
  );
  assert.equal(classifyError(error), 'pronunciation_monthly_quota_exceeded');
});

test('ai_generation month quota maps to ai_monthly_quota_exceeded even with 429', () => {
  const error = edgeError('x', 429, { reason: 'ai_generation_month_quota_exceeded' });
  assert.equal(classifyError(error), 'ai_monthly_quota_exceeded');
});

test('quota reason wins even when status is 503', () => {
  const error = edgeError('x', 503, { reason: 'pronunciation_monthly_quota_exceeded', planType: 'lite' });
  assert.equal(classifyError(error), 'pronunciation_monthly_quota_exceeded');
});

test('real rate limit stays rate_limit_exceeded', () => {
  const error = edgeError('x', 429, { reason: 'rate_limit_exceeded' });
  assert.equal(classifyError(error), 'rate_limit_exceeded');
});

test('PremiumFeatureError without a reason opens the paywall instead of "unknown"', () => {
  const error = new Error('Premium or active trial required');
  error.name = 'PremiumFeatureError';
  assert.equal(classifyError(error), 'premium_required');
  assert.equal(translateError(error).ctaKind, 'open_paywall_lite');
});

// --- Legacy strings with no structured info ---

test('reason embedded in a legacy message string is still honoured', () => {
  assert.equal(
    classifyError(new Error('AI action error: Starter allowance is temporarily unavailable (503): starter_allowance_unavailable: requestId=r1')),
    'starter_allowance_unavailable'
  );
});

test('numbers inside request ids or text do not fake a 5xx', () => {
  assert.equal(
    classifyError(new Error('Something odd happened: requestId=ab500cd-1503-4500')),
    'unknown'
  );
  assert.equal(classifyError(new Error('took 5000 ms')), 'unknown');
});

test('status written as "(503)" in a legacy message still counts as server-side', () => {
  assert.equal(
    classifyError(new Error('AI action error: Service temporarily unavailable (503)')),
    'service_unavailable'
  );
});

// --- Device-side failures are the only ones that mention the network ---

test('fetch failure on the device -> network_error that mentions the network', () => {
  const error = attachEdgeErrorInfo(new Error('AI action error: Network request failed'), {
    clientFailure: 'network',
  });
  assert.equal(classifyError(error), 'network_error');
  assert.match(translateError(error).message, CONNECTION_WORDS);
  assert.equal(translateError(error).ctaKind, 'retry');
});

test('legacy "Network request failed" string -> network_error', () => {
  assert.equal(classifyError(new Error('Network request failed')), 'network_error');
});

test('client-side timeout -> request_timeout, not a server outage', () => {
  assert.equal(
    classifyError(new Error('發音分析逾時，請稍後再試（timeout）')),
    'request_timeout'
  );
  assert.equal(
    classifyError(attachEdgeErrorInfo(new Error('AI request timed out after 45 seconds'), { clientFailure: 'timeout' })),
    'request_timeout'
  );
});

test('offline flag wins', () => {
  assert.equal(classifyError(new Error('x'), { isOffline: true }), 'network_offline');
});

// --- Local recording problems show their own message ---

test('local recording errors keep their real message', () => {
  const error = new Error('錄音太短，請至少清楚唸出一個完整單字再送出');
  assert.equal(classifyError(error), 'recording_invalid');
  assert.equal(translateError(error).message, '錄音太短，請至少清楚唸出一個完整單字再送出');
});

test('recording errors in any UI language keep their message', () => {
  const error = createRecordingError('Recording too short. Please try again.');
  assert.equal(classifyError(error), 'recording_invalid');
  assert.equal(translateError(error).message, 'Recording too short. Please try again.');
});

test('auth errors ask the user to sign in again', () => {
  const error = new Error('Authentication required: please sign in again');
  error.name = 'AIAuthError';
  assert.equal(classifyError(error), 'auth_required');
});

// --- Edge info reader ---

test('readEdgeErrorBody reads reason, paywallType and planType', () => {
  assert.deepEqual(
    readEdgeErrorBody(403, { reason: 'premium_required', paywallType: 'pronunciation', planType: 'free' }),
    { status: 403, reason: 'premium_required', paywallType: 'pronunciation', planType: 'free', clientFailure: null }
  );
  assert.deepEqual(readEdgeErrorBody(502, 'Bad gateway'), {
    status: 502, reason: null, paywallType: null, planType: null, clientFailure: null,
  });
});
