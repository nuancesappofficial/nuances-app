export type AnalyticsPrimitive = string | number | boolean;

export type AnalyticsEventProperties = {
  app_opened: { auth_state: 'authenticated' | 'anonymous' };
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
  subscription_started: { plan: 'premium' | 'trial' };
  subscription_failed: { reason: 'purchase_failed' | 'pending_sync' };
};

export type AnalyticsEventName = keyof AnalyticsEventProperties;

