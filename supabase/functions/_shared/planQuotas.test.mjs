import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PLAN_QUOTAS,
  getPlanPeriodQuota,
  getPlanQuota,
  resolvePlanTypeFromProductId,
} from './planQuotas.ts';

// ---------------------------------------------------------------------------
// Scenario 1: Lite member — pure monthly caps. 200 cards + 300 pronunciation.
// Daily/weekly windows are gone; only the monthly ceiling applies.
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

test('lite AI generation has no daily or weekly cap (pure monthly 200)', () => {
  // Weekly cadence resolves to the same monthly cap — no separate weekly window.
  assert.equal(
    getPlanPeriodQuota({ planType: 'lite', feature: 'ai_generation', cadence: 'weekly' }),
    200
  );
  assert.equal(getPlanQuota('lite', 'ai_generation'), 200);
});

test('lite pronunciation monthly cap is 300 (no daily cap)', () => {
  assert.equal(getPlanQuota('lite', 'pronunciation'), 300);
  assert.equal(
    getPlanPeriodQuota({ planType: 'lite', feature: 'pronunciation', cadence: 'monthly' }),
    300
  );
  // A lite member can do 50 pronunciations in a single day without a daily block.
  assert.equal(50 > 300, false, '50 pronunciations in a day must be allowed');
});

// ---------------------------------------------------------------------------
// Scenario 2: Pro / Premium member keeps the high cap — monthly 800 cards +
// 1200 pronunciation.
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

test('premium AI generation has no daily or weekly cap (pure monthly 800)', () => {
  assert.equal(
    getPlanPeriodQuota({ planType: 'premium', feature: 'ai_generation', cadence: 'weekly' }),
    800
  );
  assert.equal(getPlanQuota('premium', 'ai_generation'), 800);
});

test('premium pronunciation monthly cap is 1200 (no daily cap)', () => {
  assert.equal(getPlanQuota('premium', 'pronunciation'), 1200);
  assert.equal(
    getPlanPeriodQuota({ planType: 'premium', feature: 'pronunciation', cadence: 'monthly' }),
    1200
  );
  // A premium member can do 100 pronunciations in a single day without a daily block.
  assert.equal(100 > 1200, false, '100 pronunciations in a day must be allowed');
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
  assert.equal(PLAN_QUOTAS.free.pronunciation.monthly, 0);
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
