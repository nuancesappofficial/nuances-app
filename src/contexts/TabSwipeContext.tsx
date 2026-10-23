import React from 'react';
import type {
  PendingPaywallCard,
  StarterUsage,
} from '../features/subscription/paywallHero';
import type { DevSamplePronunciation } from '../features/dev/paywallDevLinks';

export type SwipeExclusionRange = {
  top: number;
  bottom: number;
};

export type MembershipReturnTarget = 'settings' | 'create-card';
export type MembershipPaywallSource =
  | 'settings'
  | 'create_card'
  | 'review'
  | 'card_detail'
  | 'unknown';
export type MembershipPaywallTriggerSource =
  | 'free_pronunciation_cap'
  | 'lite_pronunciation_cap'
  | 'lite_card_cap'
  | 'user_initiated';

export type TabSwipeContextValue = {
  setCacheSwipeExclusionRange: (range: SwipeExclusionRange | null) => void;
  swipeLockRef: React.MutableRefObject<boolean>;
  setPaginationEnabled: (enabled: boolean) => void;
  setPagerScrollEnabled: (enabled: boolean) => void;
  goToTab: (index: number, options?: { animation?: 'fade' | 'slide'; durationMs?: number }) => void;
  openMembershipPaywall: (options?:
    | {
        returnTo?: MembershipReturnTarget;
        source?: MembershipPaywallSource;
        tier?: 'lite' | 'pro';
        triggerSource?: MembershipPaywallTriggerSource;
        // 只給 __DEV__ deep link 用：覆蓋從後端讀到的入門額度已用次數。
        devStarterUsage?: Partial<StarterUsage>;
        // 只給 __DEV__ deep link 用：帳號沒有卡時，成果動畫改用示範卡。
        devSampleIntroCards?: boolean;
        // 只給 __DEV__ deep link 用：示範卡的發音紀錄情境。
        devSamplePronunciation?: DevSamplePronunciation;
        // 入門額度用完時正要建的那張卡（第 21 張）。
        pendingCard?: PendingPaywallCard;
      }
    | 'lite'
    | 'pro') => void;
  setCacheAddActionHandler: (handler: (() => void) | null) => void;
  triggerCacheAddAction: () => void;
  setTabBarHidden: (hidden: boolean) => void;
  fallbackTranslateY?: React.MutableRefObject<any> | any;
  isCacheTabActive?: boolean;
};

export const TabSwipeContext = React.createContext<TabSwipeContextValue | null>(null);
