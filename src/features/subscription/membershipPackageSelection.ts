export type MembershipTier = 'lite' | 'pro';

export type MembershipPackageCandidate = {
  identifier: string;
  packageType?: string | null;
  subscriptionPeriod?: string | null;
  title?: string | null;
};

type MembershipPackageList = readonly MembershipPackageCandidate[];

function resolveMembershipPeriod(
  value?: string | null
): 'weekly' | 'monthly' | 'yearly' | null {
  const normalized = (value || '').toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('p1w') || normalized.includes('week')) return 'weekly';
  if (normalized.includes('p1m') || normalized.includes('month')) return 'monthly';
  if (
    normalized.includes('p1y') ||
    normalized.includes('year') ||
    normalized.includes('annual')
  ) {
    return 'yearly';
  }
  return null;
}

function hasMembershipPeriod(
  item: MembershipPackageCandidate,
  period: 'weekly' | 'monthly' | 'yearly'
): boolean {
  return (
    resolveMembershipPeriod(item.packageType) === period ||
    resolveMembershipPeriod(item.identifier) === period ||
    resolveMembershipPeriod(item.subscriptionPeriod) === period ||
    resolveMembershipPeriod(item.title) === period
  );
}

function getPackagesForTier(
  tier: MembershipTier,
  litePackages: MembershipPackageList,
  proPackages: MembershipPackageList
): MembershipPackageList {
  return tier === 'lite' ? litePackages : proPackages;
}

export function selectDefaultMembershipPackage(
  tier: MembershipTier,
  litePackages: MembershipPackageList,
  proPackages: MembershipPackageList
): string | null {
  const tierPackages = getPackagesForTier(tier, litePackages, proPackages);
  return (
    tierPackages.find((item) => hasMembershipPeriod(item, 'yearly'))
      ?.identifier ||
    tierPackages.find((item) => hasMembershipPeriod(item, 'monthly'))
      ?.identifier ||
    tierPackages[0]?.identifier ||
    null
  );
}

export function resolveMembershipPackageIdentifier(
  tier: MembershipTier,
  selectedIdentifier: string | null | undefined,
  litePackages: MembershipPackageList,
  proPackages: MembershipPackageList
): string | null {
  const requested = selectedIdentifier?.trim();
  if (!requested) return null;

  const tierPackages = getPackagesForTier(tier, litePackages, proPackages);
  return tierPackages.some((item) => item.identifier === requested)
    ? requested
    : null;
}
