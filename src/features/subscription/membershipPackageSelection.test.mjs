import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMembershipPackagesForTier,
  resolveMembershipPackageIdentifier,
  selectDefaultMembershipPackage,
} from './membershipPackageSelection.ts';

function packageSummary(identifier, packageType) {
  return {
    identifier,
    packageType,
    subscriptionPeriod: null,
    title: identifier,
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

test('returns only the three packages belonging to the active tier', () => {
  assert.deepEqual(
    getMembershipPackagesForTier('lite', litePackages, proPackages),
    litePackages
  );
  assert.deepEqual(
    getMembershipPackagesForTier('pro', litePackages, proPackages),
    proPackages
  );
});

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

test('accepts each of the six packages without falling back', () => {
  for (const identifier of litePackages.map((item) => item.identifier)) {
    assert.equal(
      resolveMembershipPackageIdentifier(
        'lite',
        identifier,
        litePackages,
        proPackages
      ),
      identifier
    );
  }

  for (const identifier of proPackages.map((item) => item.identifier)) {
    assert.equal(
      resolveMembershipPackageIdentifier(
        'pro',
        identifier,
        litePackages,
        proPackages
      ),
      identifier
    );
  }
});

test('rejects an unavailable package instead of falling back to another tier', () => {
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
    resolveMembershipPackageIdentifier(
      'pro',
      'nuances_unknown_monthly',
      litePackages,
      proPackages
    ),
    null
  );
  assert.equal(
    resolveMembershipPackageIdentifier('pro', null, litePackages, proPackages),
    null
  );
});

test('returns no default when the active tier has no packages', () => {
  assert.equal(selectDefaultMembershipPackage('lite', [], proPackages), null);
  assert.equal(selectDefaultMembershipPackage('pro', litePackages, []), null);
});

test('does not fall back to another billing period when monthly is unavailable', () => {
  const liteWithoutMonthly = [
    packageSummary('nuances_lite_weekly', 'WEEKLY'),
    packageSummary('nuances_lite_yearly', 'ANNUAL'),
  ];

  assert.equal(
    selectDefaultMembershipPackage('lite', liteWithoutMonthly, proPackages),
    null
  );
});
