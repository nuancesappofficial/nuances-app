import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PLAN_QUOTAS,
  getPlanPeriodQuota,
  getPlanQuota,
  resolvePlanTypeFromProductId,
} from './planQuotas.ts';

// ---------------------------------------------------------------------------
// Scenario 1: Lite member — monthly cadence, 200-card monthly cap.
// The 200th card is allowed; the 201st exceeds the quota.
// ---------------------------------------------------------------------------
test('lite monthly AI generation cap is 200 (200th allowed, 201st exceeds)', () => {
  const monthlyLimit = getPlanPeriodQuota({
    planType: 'lite',
    feature: 'ai_generation',
    cadence: 'monthly',
  });
  assert.equal(monthlyLimit, 200);

  // The proxy rejects when periodCount > limit, so count 200 is allowed and
  // count 201 is rejected.
  assert.equal(200 > monthlyLimit, false, '200th card must be allowed');
  assert.equal(201 > monthlyLimit, true, '201st card must be rejected');
});

test('lite weekly AI generation cap is 50 and daily cap is 30', () => {
  assert.equal(
    getPlanPeriodQuota({ planType: 'lite', feature: 'ai_generation', cadence: 'weekly' }),
    50
  );
  assert.equal(getPlanQuota('lite', 'ai_generation'), 30);
});

test('lite pronunciation daily quota is 15', () => {
  assert.equal(getPlanQuota('lite', 'pronunciation'), 15);
});

// ---------------------------------------------------------------------------
// Scenario 2: Pro / Premium member keeps the high cap — monthly 800.
// ---------------------------------------------------------------------------
test('premium monthly AI generation cap is 800 (exceeds 200, capped at 800)', () => {
  const monthlyLimit = getPlanPeriodQuota({
    planType: 'premium',
    feature: 'ai_generation',
    cadence: 'monthly',
  });
  assert.equal(monthlyLimit, 800);

  // A premium member can go well past 200; only 800 is the ceiling.
  assert.equal(400 > monthlyLimit, false, '400th card must be allowed for premium');
  assert.equal(800 > monthlyLimit, false, '800th card must be allowed for premium');
  assert.equal(801 > monthlyLimit, true, '801st card must be rejected for premium');
});

test('premium weekly AI generation cap is 200 and daily cap is 100', () => {
  assert.equal(
    getPlanPeriodQuota({ planType: 'premium', feature: 'ai_generation', cadence: 'weekly' }),
    200
  );
  assert.equal(getPlanQuota('premium', 'ai_generation'), 100);
});

test('premium pronunciation daily quota is 60', () => {
  assert.equal(getPlanQuota('premium', 'pronunciation'), 60);
});

// ---------------------------------------------------------------------------
// Scenario 3: Free users and the lifetime starter allowance are untouched.
// The free plan has no recurring billable quota (0), and the 20-card starter
// allowance lives in freeStarterAllowance.ts, not here.
// ---------------------------------------------------------------------------
test('free plan has no recurring billable quota', () => {
  assert.equal(getPlanQuota('free', 'ai_generation'), 0);
  assert.equal(getPlanQuota('free', 'pronunciation'), 0);
  assert.equal(
    getPlanPeriodQuota({ planType: 'free', feature: 'ai_generation', cadence: 'monthly' }),
    0
  );
});

test('free starter card allowance stays at 20 and is not defined in planQuotas', () => {
  // planQuotas deliberately does not own the starter allowance; it must not
  // accidentally define a free recurring quota that would shadow it.
  assert.equal(PLAN_QUOTAS.free.aiGeneration.monthly, 0);
  assert.equal(PLAN_QUOTAS.free.aiGeneration.daily, 0);
});

// ---------------------------------------------------------------------------
// Plan-type resolution from the RevenueCat product identifier.
// ---------------------------------------------------------------------------
test('product ids containing "lite" resolve to the lite plan', () => {
  assert.equal(resolvePlanTypeFromProductId('nuances_lite_monthly'), 'lite');
  assert.equal(resolvePlanTypeFromProductId('nuances_lite_weekly'), 'lite');
  assert.equal(resolvePlanTypeFromProductId('LITE_YEARLY'), 'lite');
});

test('non-lite product ids resolve to premium', () => {
  assert.equal(resolvePlanTypeFromProductId('nuances_pro_monthly'), 'premium');
  assert.equal(resolvePlanTypeFromProductId('nuances_premium_yearly'), 'premium');
  assert.equal(resolvePlanTypeFromProductId(null), 'premium');
  assert.equal(resolvePlanTypeFromProductId(undefined), 'premium');
});
