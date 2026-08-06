import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
  AnalyticsPrimitive,
} from './types';
import type { AnalyticsIdentityProperties } from './identity';
import type { UserProfileAttributes } from './profileAttributes';

export type SanitizedAnalyticsProperties = Record<string, AnalyticsPrimitive>;

export interface AnalyticsAdapter {
  capture<EventName extends AnalyticsEventName>(
    event: EventName,
    properties: AnalyticsEventProperties[EventName]
  ): void;
  identify(userId: string, properties?: AnalyticsIdentityProperties): void;
  /** 同步標準用戶資料屬性（PostHog $set）。 */
  setProfileAttributes(attributes: UserProfileAttributes): void;
  reset(): void;
  flush(): Promise<void>;
}

const FORBIDDEN_PROPERTY_KEY_PARTS = [
  'audio',
  'authorization',
  'card_id',
  'cookie',
  'email',
  'image',
  'jwt',
  'name',
  'ocr',
  'password',
  'payment',
  'prompt',
  'sentence',
  'text',
  'token',
  'transcript',
  'user_id',
] as const;

const MAX_STRING_PROPERTY_LENGTH = 80;

export function sanitizeAnalyticsProperties(
  properties: Record<string, AnalyticsPrimitive>
): SanitizedAnalyticsProperties {
  const sanitized: SanitizedAnalyticsProperties = {};

  for (const [key, value] of Object.entries(properties)) {
    const normalizedKey = key.toLowerCase();
    if (FORBIDDEN_PROPERTY_KEY_PARTS.some((part) => normalizedKey.includes(part))) {
      if (__DEV__) {
        console.warn(`[Analytics] Blocked sensitive property key: ${key}`);
      }
      continue;
    }

    if (typeof value === 'string') {
      sanitized[key] = value.trim().slice(0, MAX_STRING_PROPERTY_LENGTH);
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) sanitized[key] = value;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
