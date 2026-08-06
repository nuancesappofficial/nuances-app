import type { AnalyticsAdapter } from './adapter';
import type { AnalyticsIdentityProperties } from './identity';
import { PostHogAnalyticsAdapter } from './posthogAdapter';
import type { AnalyticsEventName, AnalyticsEventProperties } from './types';
import type { UserProfileAttributes } from './profileAttributes';
import {
  withGrowthAttribution,
  type GrowthAttributionProperties,
} from './growthAnalytics';

let adapter: AnalyticsAdapter = new PostHogAnalyticsAdapter();
let growthAttribution: GrowthAttributionProperties | null = null;

export const analytics = {
  track<EventName extends AnalyticsEventName>(
    event: EventName,
    properties: AnalyticsEventProperties[EventName]
  ): void {
    adapter.capture(
      event,
      withGrowthAttribution(
        growthAttribution,
        properties
      ) as AnalyticsEventProperties[EventName]
    );
  },

  setGrowthAttribution(next: GrowthAttributionProperties | null): void {
    growthAttribution = next;
  },

  identify(userId: string, properties?: AnalyticsIdentityProperties): void {
    adapter.identify(userId, {
      ...growthAttribution,
      ...properties,
    });
  },

  setProfileAttributes(attributes: UserProfileAttributes): void {
    adapter.setProfileAttributes(attributes);
  },

  reset(): void {
    adapter.reset();
  },

  flush(): Promise<void> {
    return adapter.flush();
  },
};

export function setAnalyticsAdapterForTesting(nextAdapter: AnalyticsAdapter): void {
  adapter = nextAdapter;
}

export type {
  AnalyticsAdapter,
  AnalyticsEventName,
  AnalyticsEventProperties,
};
export type { AnalyticsIdentityProperties } from './identity';
export type { UserProfileAttributes } from './profileAttributes';
export type {
  BillingPlan,
  GrowthAttributionProperties,
} from './growthAnalytics';
