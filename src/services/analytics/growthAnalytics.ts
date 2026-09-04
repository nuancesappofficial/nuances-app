export type GrowthAttributionProperties = {
  growth_manager: string;
  growth_platform: string;
  growth_method: string;
  growth_campaign_id: string;
};

type FirstOpenStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
};

type FirstOpenCapture = (
  event: 'first_app_opened',
  properties: { download_source: 'app_first_open' }
) => void;

const FIRST_APP_OPEN_STORAGE_KEY = '@nuances/analytics/first-app-opened/v1';
const ATTRIBUTION_KEYS = {
  manager: 'growth_manager',
  platform: 'growth_platform',
  method: 'growth_method',
  campaign_id: 'growth_campaign_id',
} as const;

export async function trackFirstAppOpenOnce(
  storage: FirstOpenStorage,
  capture: FirstOpenCapture
): Promise<boolean> {
  if ((await storage.getItem(FIRST_APP_OPEN_STORAGE_KEY)) === 'true')
    return false;

  capture('first_app_opened', { download_source: 'app_first_open' });
  await storage.setItem(FIRST_APP_OPEN_STORAGE_KEY, 'true');
  return true;
}

function cleanAttributionValue(value: string | null): string | null {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_');
  return normalized ? normalized.slice(0, 80) : null;
}

export function parseGrowthAttributionUrl(
  url: string
): GrowthAttributionProperties | null {
  try {
    const queryStart = url.indexOf('?');
    if (queryStart < 0) return null;
    const fragmentStart = url.indexOf('#', queryStart);
    const rawQuery = url.slice(
      queryStart + 1,
      fragmentStart < 0 ? url.length : fragmentStart
    );
    const query = new Map<string, string>();
    for (const pair of rawQuery.split('&')) {
      if (!pair) continue;
      const separator = pair.indexOf('=');
      const rawKey = separator < 0 ? pair : pair.slice(0, separator);
      const rawValue = separator < 0 ? '' : pair.slice(separator + 1);
      const decode = (value: string) =>
        decodeURIComponent(value.replace(/\+/g, ' '));
      query.set(decode(rawKey), decode(rawValue));
    }
    const entries = Object.entries(ATTRIBUTION_KEYS).map(
      ([queryKey, propertyKey]) =>
        [
          propertyKey,
          cleanAttributionValue(query.get(queryKey) ?? null),
        ] as const
    );
    if (entries.some(([, value]) => !value)) return null;
    return Object.fromEntries(entries) as GrowthAttributionProperties;
  } catch {
    return null;
  }
}

export function withGrowthAttribution<
  Properties extends Record<string, unknown>,
>(
  attribution: GrowthAttributionProperties | null,
  properties: Properties
): Properties & Partial<GrowthAttributionProperties> {
  return {
    ...attribution,
    ...properties,
  };
}
