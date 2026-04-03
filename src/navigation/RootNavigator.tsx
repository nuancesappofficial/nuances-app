import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { NavigationContainer, NavigationIndependentTree, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PagerView, {
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidTabBar as NativeLiquidTabBar } from 'liquid-tab-bar';
import CacheScreenFlow from '../screens/flow/CacheScreenFlow';
import AddCacheItemFlow from '../screens/flow/CacheScreenFlow/AddCacheItemFlow';
import CreateCardFlow from '../screens/flow/CacheScreenFlow/CreateCardFlow';
import ReviewFlow from '../screens/flow/DeckScreenFlow/ReviewFlow';
import AlbumViewFlow from '../screens/flow/DeckScreenFlow/AlbumViewFlow';
import CardDetailFlow from '../screens/flow/DeckScreenFlow/CardDetailFlow';
import DayViewFlow from '../screens/flow/DeckScreenFlow/DayViewFlow';
import DeckMainFlow from '../screens/flow/DeckScreenFlow/DeckMainFlow';
import ProfileMainFlow from '../screens/flow/ProfileScreenFlow/ProfileMainFlow';
import { TabSwipeContext, type SwipeExclusionRange } from '../contexts/TabSwipeContext';

const CacheStackNav = createNativeStackNavigator();
const CardsStackNav = createNativeStackNavigator();
const ProfileStackNav = createNativeStackNavigator();
const MAIN_TAB_ORDER = ['Home', 'Explore', 'Profile'] as const;

const ACTIVE_COLOR = '#D4FF00';

const APP_DARK_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000000',
    card: '#000000',
    text: '#FFFFFF',
    border: '#1A1A1A',
    primary: ACTIVE_COLOR,
  },
};

function getActiveRouteName(state?: unknown): string | null {
  let current: any = state;
  while (current?.routes?.length) {
    const route = current.routes[current.index];
    if (!route) return null;
    if (!route.state) return typeof route.name === 'string' ? route.name : null;
    current = route.state;
  }
  return null;
}

function CacheStack({ onShowTabBarChange }: { onShowTabBarChange: (visible: boolean) => void }) {
  return (
    <NavigationIndependentTree>
      <NavigationContainer
        theme={APP_DARK_THEME}
        onReady={() => onShowTabBarChange(true)}
        onStateChange={(state) => {
          const routeName = getActiveRouteName(state);
          onShowTabBarChange(routeName === 'CacheList');
        }}
      >
        <CacheStackNav.Navigator screenOptions={{ headerShown: false }}>
          <CacheStackNav.Screen name="CacheList" component={CacheScreenFlow} />
          <CacheStackNav.Screen
            name="AddCacheItem"
            component={AddCacheItemFlow}
            options={({ route }) => {
              const quickFlow = Boolean(
                (route as any)?.params?.autoOpenCropper ||
                  (route as any)?.params?.openOcrOnLoad ||
                  (route as any)?.params?.startMode === 'camera' ||
                  (route as any)?.params?.startMode === 'library'
              );
              if (quickFlow) {
                return {
                  presentation: 'transparentModal',
                  animation: 'none',
                  detachPreviousScreen: false,
                  contentStyle: { backgroundColor: 'transparent' },
                };
              }
              return { presentation: 'modal' };
            }}
          />
          <CacheStackNav.Screen
            name="CreateCard"
            component={CreateCardFlow}
            options={{ presentation: 'modal' }}
          />
        </CacheStackNav.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

function CardsStack({ onShowTabBarChange }: { onShowTabBarChange: (visible: boolean) => void }) {
  return (
    <NavigationIndependentTree>
      <NavigationContainer
        theme={APP_DARK_THEME}
        onReady={() => onShowTabBarChange(true)}
        onStateChange={(state) => {
          const routeName = getActiveRouteName(state);
          onShowTabBarChange(routeName === 'CardsList' || routeName === 'Deck');
        }}
      >
        <CardsStackNav.Navigator screenOptions={{ headerShown: false }}>
          <CardsStackNav.Screen name="CardsList" component={DeckMainFlow} />
          <CardsStackNav.Screen name="Deck" component={DeckMainFlow} options={{ presentation: 'card' }} />
          <CardsStackNav.Screen
            name="AlbumView"
            component={AlbumViewFlow}
            options={{
              presentation: 'card',
              animation: 'simple_push',
              animationDuration: 520,
            }}
          />
          <CardsStackNav.Screen name="CardDetail" component={CardDetailFlow} options={{ presentation: 'card' }} />
          <CardsStackNav.Screen name="DayView" component={DayViewFlow} options={{ presentation: 'card' }} />
          <CardsStackNav.Screen name="CardReview" component={ReviewFlow} options={{ presentation: 'card' }} />
        </CardsStackNav.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

function ProfileStack({ onShowTabBarChange }: { onShowTabBarChange: (visible: boolean) => void }) {
  return (
    <NavigationIndependentTree>
      <NavigationContainer
        theme={APP_DARK_THEME}
        onReady={() => onShowTabBarChange(true)}
        onStateChange={(state) => {
          const routeName = getActiveRouteName(state);
          onShowTabBarChange(routeName === 'ProfileHome');
        }}
      >
        <ProfileStackNav.Navigator screenOptions={{ headerShown: false }}>
          <ProfileStackNav.Screen name="ProfileHome" component={ProfileMainFlow} />
        </ProfileStackNav.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

type RootNavigatorProps = {
  isExpoGo?: boolean;
};

function LiquidTabBar({
  selectedTabIndex,
  showsAddButton,
  onSelectTab,
  onAddPress,
}: {
  selectedTabIndex: number;
  showsAddButton: boolean;
  onSelectTab: (index: number) => void;
  onAddPress: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.tabBarOuter}>
      <NativeLiquidTabBar
        style={[styles.nativeLiquidBar, { height: 64 + Math.max(insets.bottom, 8) }]}
        selectedTabIndex={selectedTabIndex}
        showsAddButton={showsAddButton}
        onTabSelect={(index) => onSelectTab(index)}
        onAddPress={onAddPress}
      />
    </View>
  );
}

export default function RootNavigator({ isExpoGo: _isExpoGo }: RootNavigatorProps) {
  const pagerRef = React.useRef<PagerView | null>(null);
  const cacheSwipeExclusionRangeRef = React.useRef<SwipeExclusionRange | null>(null);
  const cacheAddActionHandlerRef = React.useRef<(() => void) | null>(null);
  const swipeLockRef = React.useRef(false);
  const currentIndexRef = React.useRef(0);
  const isProgrammaticScrollRef = React.useRef(false);
  const targetIndexRef = React.useRef<number | null>(null);
  const clickLockRef = React.useRef(false);
  const clickUnlockTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHapticAtRef = React.useRef(0);
  const paginationEnabledRef = React.useRef(true);
  const [selectedTabIndex, setSelectedTabIndex] = React.useState(0);
  const [isPaginationEnabled, setIsPaginationEnabled] = React.useState(true);
  const [tabRootBarVisible, setTabRootBarVisible] = React.useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: true,
  });
  const tabBarTranslateY = React.useRef(new Animated.Value(0)).current;
  const tabBarOpacity = React.useRef(new Animated.Value(1)).current;

  const setCacheSwipeExclusionRange = React.useCallback((range: SwipeExclusionRange | null) => {
    cacheSwipeExclusionRangeRef.current = range;
  }, []);

  const setPaginationEnabled = React.useCallback((enabled: boolean) => {
    paginationEnabledRef.current = enabled;
    setIsPaginationEnabled(enabled);
  }, []);

  const triggerTabHaptic = React.useCallback(() => {
    const now = Date.now();
    if (now - lastHapticAtRef.current < 80) return;
    lastHapticAtRef.current = now;
    void Haptics.selectionAsync();
  }, []);

  const handleTabSelect = React.useCallback((index: number) => {
    const nextIndex = Math.min(MAIN_TAB_ORDER.length - 1, Math.max(0, index));
    if (nextIndex === selectedTabIndex) return;
    if (clickLockRef.current) return;

    clickLockRef.current = true;
    if (clickUnlockTimeoutRef.current) {
      clearTimeout(clickUnlockTimeoutRef.current);
    }
    clickUnlockTimeoutRef.current = setTimeout(() => {
      clickLockRef.current = false;
      clickUnlockTimeoutRef.current = null;
    }, 350);

    isProgrammaticScrollRef.current = true;
    targetIndexRef.current = nextIndex;
    currentIndexRef.current = nextIndex;
    setSelectedTabIndex(nextIndex);
    pagerRef.current?.setPage(nextIndex);
  }, [selectedTabIndex]);

  const handlePageScroll = React.useCallback(
    (event: PagerViewOnPageScrollEvent) => {
      if (isProgrammaticScrollRef.current) return;
      const { position, offset } = event.nativeEvent;
      const eagerIndex = Math.min(MAIN_TAB_ORDER.length - 1, Math.max(0, Math.round(position + offset)));
      if (eagerIndex === currentIndexRef.current) return;
      currentIndexRef.current = eagerIndex;
      setSelectedTabIndex(eagerIndex);
      triggerTabHaptic();
    },
    [triggerTabHaptic]
  );

  const handlePageSelected = React.useCallback((event: PagerViewOnPageSelectedEvent) => {
    const settledIndex = event.nativeEvent.position;
    if (targetIndexRef.current === null || targetIndexRef.current === settledIndex) {
      isProgrammaticScrollRef.current = false;
      targetIndexRef.current = null;
    }
    if (settledIndex === currentIndexRef.current && settledIndex === selectedTabIndex) return;
    currentIndexRef.current = settledIndex;
    setSelectedTabIndex(settledIndex);
  }, [selectedTabIndex]);

  const goToTab = React.useCallback((index: number) => {
    const nextIndex = Math.min(MAIN_TAB_ORDER.length - 1, Math.max(0, index));
    if (nextIndex === selectedTabIndex) return;
    isProgrammaticScrollRef.current = true;
    targetIndexRef.current = nextIndex;
    currentIndexRef.current = nextIndex;
    setSelectedTabIndex(nextIndex);
    pagerRef.current?.setPage(nextIndex);
  }, [selectedTabIndex]);

  const setPagerScrollEnabled = React.useCallback((enabled: boolean) => {
    setPaginationEnabled(enabled);
  }, [setPaginationEnabled]);

  const setCacheAddActionHandler = React.useCallback((handler: (() => void) | null) => {
    cacheAddActionHandlerRef.current = handler;
  }, []);

  const setTabRootVisible = React.useCallback((tabIndex: number, visible: boolean) => {
    setTabRootBarVisible((prev) => {
      if (prev[tabIndex] === visible) return prev;
      return { ...prev, [tabIndex]: visible };
    });
  }, []);

  const isTabBarVisible = tabRootBarVisible[selectedTabIndex] ?? true;

  const handleAddPress = React.useCallback(() => {
    if (selectedTabIndex !== 0) return;
    triggerTabHaptic();
    const invoke = () => {
      cacheAddActionHandlerRef.current?.();
    };
    invoke();
  }, [selectedTabIndex, triggerTabHaptic]);

  React.useEffect(() => {
    currentIndexRef.current = selectedTabIndex;
  }, [selectedTabIndex]);

  React.useEffect(
    () => () => {
      if (clickUnlockTimeoutRef.current) {
        clearTimeout(clickUnlockTimeoutRef.current);
        clickUnlockTimeoutRef.current = null;
      }
      clickLockRef.current = false;
    },
    []
  );

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(tabBarTranslateY, {
        toValue: isTabBarVisible ? 0 : 120,
        duration: 380,
        useNativeDriver: true,
      }),
      Animated.timing(tabBarOpacity, {
        toValue: isTabBarVisible ? 1 : 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isTabBarVisible, tabBarOpacity, tabBarTranslateY]);

  return (
    <TabSwipeContext.Provider
      value={{
        setCacheSwipeExclusionRange,
        swipeLockRef,
        setPaginationEnabled,
        setPagerScrollEnabled,
        goToTab,
        setCacheAddActionHandler,
      }}
    >
      <View style={styles.container}>
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          scrollEnabled={isPaginationEnabled}
          onPageScroll={handlePageScroll}
          onPageSelected={handlePageSelected}
          overdrag={false}
        >
          <View key="0" style={styles.page}>
            <CacheStack onShowTabBarChange={(visible) => setTabRootVisible(0, visible)} />
          </View>
          <View key="1" style={styles.page}>
            <CardsStack onShowTabBarChange={(visible) => setTabRootVisible(1, visible)} />
          </View>
          <View key="2" style={styles.page}>
            <ProfileStack onShowTabBarChange={(visible) => setTabRootVisible(2, visible)} />
          </View>
        </PagerView>

        <Animated.View
          pointerEvents={isTabBarVisible ? 'auto' : 'none'}
          style={[styles.tabBarAnimatedWrap, { opacity: tabBarOpacity, transform: [{ translateY: tabBarTranslateY }] }]}
        >
          <LiquidTabBar
            selectedTabIndex={selectedTabIndex}
            showsAddButton={selectedTabIndex === 0}
            onSelectTab={handleTabSelect}
            onAddPress={handleAddPress}
          />
        </Animated.View>
      </View>
    </TabSwipeContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  tabBarOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 200,
  },
  tabBarAnimatedWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 200,
  },
  nativeLiquidBar: {
    width: '100%',
    height: 82,
  },
});
