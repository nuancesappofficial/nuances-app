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
  goToTab: (index: number) => void;
  setCacheAddActionHandler: (handler: (() => void) | null) => void;
};

export const TabSwipeContext = React.createContext<TabSwipeContextValue | null>(null);
