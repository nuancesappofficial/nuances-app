export type MembershipTier = 'lite' | 'pro';

export type MembershipPackageCandidate = {
  identifier: string;
  packageType?: string | null;
  subscriptionPeriod?: string | null;
  title?: string | null;
};

type MembershipPackageList = readonly MembershipPackageCandidate[];
type MembershipPeriod = 'weekly' | 'monthly' | 'yearly';

export function resolveMembershipPeriod(
  value?: string | null
): MembershipPeriod | null {
  const normalized = (value || '').toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('p1w') || normalized.includes('week'))
    return 'weekly';
  if (normalized.includes('p1m') || normalized.includes('month'))
    return 'monthly';
  if (
    normalized.includes('p1y') ||
    normalized.includes('year') ||
    normalized.includes('annual')
  ) {
    return 'yearly';
  }
  return null;
}

function isMonthlyPackage(item: MembershipPackageCandidate): boolean {
  return (
    resolveMembershipPeriod(item.packageType) === 'monthly' ||
    resolveMembershipPeriod(item.identifier) === 'monthly' ||
    resolveMembershipPeriod(item.subscriptionPeriod) === 'monthly' ||
    resolveMembershipPeriod(item.title) === 'monthly'
  );
}

export function getMembershipPackagesForTier<
  T extends MembershipPackageCandidate,
>(
  tier: MembershipTier,
  litePackages: readonly T[],
  proPackages: readonly T[]
): readonly T[] {
  return tier === 'lite' ? litePackages : proPackages;
}

export function selectDefaultMembershipPackage(
  tier: MembershipTier,
  litePackages: MembershipPackageList,
  proPackages: MembershipPackageList
): string | null {
  const tierPackages = getMembershipPackagesForTier(
    tier,
    litePackages,
    proPackages
  );
  return tierPackages.find(isMonthlyPackage)?.identifier || null;
}

export function resolveMembershipPackageIdentifier(
  tier: MembershipTier,
  selectedIdentifier: string | null | undefined,
  litePackages: MembershipPackageList,
  proPackages: MembershipPackageList
): string | null {
  const requested = selectedIdentifier?.trim();
  if (!requested) return null;

  const tierPackages = getMembershipPackagesForTier(
    tier,
    litePackages,
    proPackages
  );
  return tierPackages.some((item) => item.identifier === requested)
    ? requested
    : null;
}
