import type { AnalyticsAdapter } from './adapter';
import type { AnalyticsIdentityProperties } from './identity';
import { PostHogAnalyticsAdapter } from './posthogAdapter';
import type { AnalyticsEventName, AnalyticsEventProperties } from './types';

let adapter: AnalyticsAdapter = new PostHogAnalyticsAdapter();

export const analytics = {
  track<EventName extends AnalyticsEventName>(
    event: EventName,
    properties: AnalyticsEventProperties[EventName]
  ): void {
    adapter.capture(event, properties);
  },

  identify(userId: string, properties?: AnalyticsIdentityProperties): void {
    adapter.identify(userId, properties);
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
