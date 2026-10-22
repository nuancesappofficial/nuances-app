import type { GrowthAttributionProperties } from './growthAnalytics';

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
  video_tutorial_completed: Record<string, never>;
  interactive_tutorial_completed: Record<string, never>;
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
  pronunciation_free_starter_exhausted: {
    context: 'review' | 'card_detail';
  };
  pronunciation_monthly_quota_exceeded: {
    context: 'review' | 'card_detail';
  };
  paywall_viewed: {
    source: 'settings' | 'create_card' | 'review' | 'card_detail' | 'unknown';
    trigger_source:
      | 'free_pronunciation_cap'
      | 'lite_pronunciation_cap'
      | 'lite_card_cap'
      | 'user_initiated';
    entry: 'settings' | 'limit';
  };
  // 第 21 張卡 paywall 被拒絕、出現退出畫面時。
  paywall_declined: { via: 'close' | 'review_link' };
  // 退出畫面的一鍵原因（可略過，所以和 paywall_declined 分開送）。
  paywall_decline_reason: {
    reason: 'too_expensive' | 'trying_first' | 'not_enough_use';
  };
  paywall_exit_action: { action: 'review' | 'cache' | 'start_review' };
  freemium_quota_updated: WithGrowthAttribution<{
    quota_limit: number;
    quota_used: number;
    quota_used_percent: number;
  }>;
};

export type AnalyticsEventName = keyof AnalyticsEventProperties;
