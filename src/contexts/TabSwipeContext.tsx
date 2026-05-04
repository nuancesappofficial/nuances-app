import React from 'react';

export type SwipeExclusionRange = {
  top: number;
  bottom: number;
};

export type TabSwipeContextValue = {
  setCacheSwipeExclusionRange: (range: SwipeExclusionRange | null) => void;
  swipeLockRef: React.MutableRefObject<boolean>;
  setPaginationEnabled: (enabled: boolean) => void;
  setPagerScrollEnabled: (enabled: boolean) => void;
  goToTab: (index: number, options?: { animation?: 'fade' | 'slide' }) => void;
  setCacheAddActionHandler: (handler: (() => void) | null) => void;
  triggerCacheAddAction: () => void;
  setTabBarHidden: (hidden: boolean) => void;
  setTabBarHiddenProgress: (progress: number | null) => void;
  fallbackTranslateY?: React.MutableRefObject<any> | any;
};

export const TabSwipeContext = React.createContext<TabSwipeContextValue | null>(null);
