import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveMembershipPackageIdentifier,
  selectDefaultMembershipPackage,
} from './membershipPackageSelection.ts';

function packageSummary(identifier, packageType) {
  return {
    identifier,
    packageType,
    productIdentifier: identifier,
    title: identifier,
    description: '',
    priceLabel: 'NT$120',
    currencyCode: 'TWD',
    subscriptionPeriod: null,
  };
}

const litePackages = [
  packageSummary('nuances_lite_weekly', 'WEEKLY'),
  packageSummary('nuances_lite_monthly', 'MONTHLY'),
  packageSummary('nuances_lite_yearly', 'ANNUAL'),
];

const proPackages = [
  packageSummary('nuances_pro_weekly', 'WEEKLY'),
  packageSummary('nuances_pro_monthly', 'MONTHLY'),
  packageSummary('nuances_pro_yearly', 'ANNUAL'),
];

test('defaults to the monthly package inside the active tier', () => {
  assert.equal(
    selectDefaultMembershipPackage('lite', litePackages, proPackages),
    'nuances_lite_monthly'
  );
  assert.equal(
    selectDefaultMembershipPackage('pro', litePackages, proPackages),
    'nuances_pro_monthly'
  );
});

test('accepts each selected package only from the active tier', () => {
  assert.equal(
    resolveMembershipPackageIdentifier(
      'lite',
      'nuances_lite_weekly',
      litePackages,
      proPackages
    ),
    'nuances_lite_weekly'
  );
  assert.equal(
    resolveMembershipPackageIdentifier(
      'lite',
      'nuances_lite_monthly',
      litePackages,
      proPackages
    ),
    'nuances_lite_monthly'
  );
  assert.equal(
    resolveMembershipPackageIdentifier(
      'lite',
      'nuances_lite_yearly',
      litePackages,
      proPackages
    ),
    'nuances_lite_yearly'
  );
  assert.equal(
    resolveMembershipPackageIdentifier(
      'pro',
      'nuances_pro_weekly',
      litePackages,
      proPackages
    ),
    'nuances_pro_weekly'
  );
  assert.equal(
    resolveMembershipPackageIdentifier(
      'pro',
      'nuances_pro_monthly',
      litePackages,
      proPackages
    ),
    'nuances_pro_monthly'
  );
  assert.equal(
    resolveMembershipPackageIdentifier(
      'pro',
      'nuances_pro_yearly',
      litePackages,
      proPackages
    ),
    'nuances_pro_yearly'
  );
});

test('rejects a cross-tier selection instead of falling back to another tier', () => {
  assert.equal(
    resolveMembershipPackageIdentifier(
      'lite',
      'nuances_pro_monthly',
      litePackages,
      proPackages
    ),
    null
  );
  assert.equal(
    resolveMembershipPackageIdentifier('pro', null, litePackages, proPackages),
    null
  );
  assert.equal(
    resolveMembershipPackageIdentifier(
      'lite',
      'nuances_unknown_monthly',
      litePackages,
      proPackages
    ),
    null
  );
});

test('returns no default when the active tier has no available packages', () => {
  assert.equal(selectDefaultMembershipPackage('lite', [], proPackages), null);
  assert.equal(selectDefaultMembershipPackage('pro', litePackages, []), null);
});
