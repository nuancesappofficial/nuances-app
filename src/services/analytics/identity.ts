export type AnalyticsIdentityProperties = {
  email?: string;
};

const MAX_EMAIL_LENGTH = 254;

export function normalizeAnalyticsIdentityProperties(
  properties: AnalyticsIdentityProperties = {}
): AnalyticsIdentityProperties {
  const email = properties.email?.trim().slice(0, MAX_EMAIL_LENGTH);
  return email ? { email } : {};
}
