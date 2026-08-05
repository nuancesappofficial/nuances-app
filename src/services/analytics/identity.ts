import type { GrowthAttributionProperties } from './growthAnalytics';

export type AnalyticsIdentityProperties = {
  email?: string;
} & Partial<GrowthAttributionProperties>;

const MAX_EMAIL_LENGTH = 254;

export function normalizeAnalyticsIdentityProperties(
  properties: AnalyticsIdentityProperties = {}
): AnalyticsIdentityProperties {
  const email = properties.email?.trim().slice(0, MAX_EMAIL_LENGTH);
  const normalized: AnalyticsIdentityProperties = email ? { email } : {};
  for (const key of [
    'growth_manager',
    'growth_platform',
    'growth_method',
    'growth_campaign_id',
  ] as const) {
    const value = properties[key]
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .slice(0, 80);
    if (value) normalized[key] = value;
  }
  return normalized;
}
