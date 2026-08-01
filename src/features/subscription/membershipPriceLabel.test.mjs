import assert from 'node:assert/strict';
import test from 'node:test';

import { formatMembershipPriceLabel } from './membershipPriceLabel.ts';

test('does not duplicate USD when RevenueCat already returns US dollars', () => {
  assert.equal(formatMembershipPriceLabel('US$6.99', 'USD'), 'US$6.99');
  assert.equal(formatMembershipPriceLabel('$6.99', 'USD'), '$6.99');
});

test('adds a currency code only when the price has no currency marker', () => {
  assert.equal(formatMembershipPriceLabel('6.99', 'USD'), '6.99 · USD');
});
