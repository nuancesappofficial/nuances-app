import React from 'react';

export type SwipeExclusionRange = {
  top: number;
  bottom: number;
};

export type MembershipReturnTarget = 'settings' | 'create-card';
export type MembershipPaywallSource =
  | 'settings'
  | 'create_card'
  | 'review'
  | 'unknown';

export type TabSwipeContextValue = {
  setCacheSwipeExclusionRange: (range: SwipeExclusionRange | null) => void;
  swipeLockRef: React.MutableRefObject<boolean>;
  setPaginationEnabled: (enabled: boolean) => void;
  setPagerScrollEnabled: (enabled: boolean) => void;
  goToTab: (index: number, options?: { animation?: 'fade' | 'slide'; durationMs?: number }) => void;
  openMembershipPaywall: (options?: {
    returnTo?: MembershipReturnTarget;
    source?: MembershipPaywallSource;
  }) => void;
  setCacheAddActionHandler: (handler: (() => void) | null) => void;
  triggerCacheAddAction: () => void;
  setTabBarHidden: (hidden: boolean) => void;
  fallbackTranslateY?: React.MutableRefObject<any> | any;
};

export const TabSwipeContext = React.createContext<TabSwipeContextValue | null>(null);
