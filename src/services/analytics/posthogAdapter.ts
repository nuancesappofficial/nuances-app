import PostHog from 'posthog-react-native';
import type { AnalyticsAdapter } from './adapter';
import { sanitizeAnalyticsProperties } from './adapter';
import {
  normalizeAnalyticsIdentityProperties,
  type AnalyticsIdentityProperties,
} from './identity';
import type { UserProfileAttributes } from './profileAttributes';
import type { AnalyticsEventName, AnalyticsEventProperties } from './types';

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() || '';
const host =
  process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';
const explicitlyEnabled =
  process.env.EXPO_PUBLIC_ANALYTICS_ENABLED?.trim().toLowerCase() === 'true';

export const isPostHogAnalyticsConfigured = Boolean(apiKey && explicitlyEnabled);

const client = isPostHogAnalyticsConfigured
  ? new PostHog(apiKey, {
      host,
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
      disableRemoteConfig: true,
      errorTracking: { autocapture: false },
    })
  : null;

export class PostHogAnalyticsAdapter implements AnalyticsAdapter {
  capture<EventName extends AnalyticsEventName>(
    event: EventName,
    properties: AnalyticsEventProperties[EventName]
  ): void {
    if (!client) return;
    client.capture(event, sanitizeAnalyticsProperties(properties));
  }

  identify(userId: string, properties?: AnalyticsIdentityProperties): void {
    if (!client || !userId) return;
    client.identify(userId, normalizeAnalyticsIdentityProperties(properties));
  }

  setProfileAttributes(attributes: UserProfileAttributes): void {
    if (!client) return;
    // PostHog 以 $set 事件更新 profile 屬性。
    client.capture('$set', sanitizeAnalyticsProperties(attributes));
  }

  reset(): void {
    client?.reset();
  }

  async flush(): Promise<void> {
    await client?.flush();
  }
}
