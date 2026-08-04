import AsyncStorage from '@react-native-async-storage/async-storage';
import { analytics } from './index';
import {
  parseGrowthAttributionUrl,
  trackFirstAppOpenOnce,
  type GrowthAttributionProperties,
} from './growthAnalytics';

const GROWTH_ATTRIBUTION_STORAGE_KEY = '@nuances/analytics/growth-attribution/v1';

function isGrowthAttribution(value: unknown): value is GrowthAttributionProperties {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return ['growth_manager', 'growth_platform', 'growth_method', 'growth_campaign_id']
    .every((key) => typeof candidate[key] === 'string' && candidate[key].length > 0);
}

async function loadStoredGrowthAttribution(): Promise<GrowthAttributionProperties | null> {
  const raw = await AsyncStorage.getItem(GROWTH_ATTRIBUTION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isGrowthAttribution(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function rememberGrowthAttributionFromUrl(url: string): Promise<boolean> {
  const attribution = parseGrowthAttributionUrl(url);
  if (!attribution) return false;
  await AsyncStorage.setItem(
    GROWTH_ATTRIBUTION_STORAGE_KEY,
    JSON.stringify(attribution)
  );
  analytics.setGrowthAttribution(attribution);
  analytics.track('growth_attribution_captured', attribution);
  return true;
}

export async function initializeGrowthAnalytics(
  getInitialUrl: () => Promise<string | null>
): Promise<void> {
  const initialUrl = await getInitialUrl().catch(() => null);
  if (!initialUrl || !(await rememberGrowthAttributionFromUrl(initialUrl))) {
    analytics.setGrowthAttribution(await loadStoredGrowthAttribution());
  }
  await trackFirstAppOpenOnce(AsyncStorage, (event, properties) => {
    analytics.track(event, properties);
  });
}
