import type {
  BillingPlan,
  GrowthAttributionProperties,
} from './growthAnalytics';

export type AnalyticsPrimitive = string | number | boolean;

type WithGrowthAttribution<Properties> = Properties &
  Partial<GrowthAttributionProperties>;

export type AnalyticsEventProperties = {
  growth_attribution_captured: GrowthAttributionProperties;
  first_app_opened: WithGrowthAttribution<{
    download_source: 'app_first_open';
  }>;
  app_opened: WithGrowthAttribution<{
    auth_state: 'authenticated' | 'anonymous';
  }>;
  onboarding_started: { ui_language: string };
  onboarding_completed: { ui_language: string };
  card_creation_started: {
    source_type: 'image' | 'text';
    selected_card_count: number;
  };
  card_creation_succeeded: {
    source_type: 'image' | 'text';
    card_count: number;
    is_tutorial: boolean;
  };
  card_creation_failed: {
    source_type: 'image' | 'text';
    reason: 'premium_required' | 'save_failed';
  };
  review_started: {
    question_count: number;
    question_type_count: number;
    album_scope: 'all_cards' | 'album';
    is_tutorial: boolean;
  };
  review_completed: {
    question_count: number;
    correct_count: number;
    skipped_count: number;
    is_tutorial: boolean;
  };
  pronunciation_attempted: { context: 'review' | 'card_detail' };
  paywall_viewed: {
    source: 'settings' | 'create_card' | 'review' | 'unknown';
  };
  subscription_started: WithGrowthAttribution<{ plan: BillingPlan }>;
  subscription_failed: { reason: 'purchase_failed' | 'pending_sync' };
  freemium_quota_updated: WithGrowthAttribution<{
    quota_limit: number;
    quota_used: number;
    quota_used_percent: number;
  }>;
};

export type AnalyticsEventName = keyof AnalyticsEventProperties;
