import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  NavigationContainer,
  NavigationIndependentTree,
  DarkTheme,
  StackActions,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
const MAIN_TAB_ORDER = ['Deck', 'Cache', 'Profile'] as const;
const CACHE_TAB_INDEX = 1;

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

function CacheStack({
  onSwipeEnabledChange,
}: {
  onSwipeEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <NavigationIndependentTree>
      <NavigationContainer
        theme={APP_DARK_THEME}
        onReady={() => {
          onSwipeEnabledChange(true);
        }}
        onStateChange={(state) => {
          const routeName = getActiveRouteName(state);
          const isRootRoute = routeName === 'CacheList';
          onSwipeEnabledChange(isRootRoute);
        }}
      >
        <CacheStackNav.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
          <CacheStackNav.Screen name="CacheList" component={CacheScreenFlow} />
          <CacheStackNav.Screen
            name="AddCacheItem"
            component={AddCacheItemFlow}
            options={({ route }) => {
              const quickFlow = Boolean(
                (route as any)?.params?.autoOpenCropper ||
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

function CardsStack({
  onSwipeEnabledChange,
  navigationRef,
}: {
  onSwipeEnabledChange: (enabled: boolean) => void;
  navigationRef: ReturnType<typeof createNavigationContainerRef<any>>;
}) {
  return (
    <NavigationIndependentTree>
      <NavigationContainer
        ref={navigationRef}
        theme={APP_DARK_THEME}
        onReady={() => {
          onSwipeEnabledChange(true);
        }}
        onStateChange={(state) => {
          const routeName = getActiveRouteName(state);
          const isRootRoute = routeName === 'CardsList' || routeName === 'Deck';
          onSwipeEnabledChange(isRootRoute);
        }}
      >
        <CardsStackNav.Navigator
          screenOptions={{
            headerShown: false,
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            animation: 'ios_from_right',
          }}
        >
          <CardsStackNav.Screen name="CardsList" component={DeckMainFlow} />
          <CardsStackNav.Screen name="Deck" component={DeckMainFlow} options={{ presentation: 'card' }} />
          <CardsStackNav.Screen
            name="AlbumView"
            component={AlbumViewFlow}
            options={{
              presentation: 'card',
              animation: 'ios_from_right',
              animationDuration: 520,
            }}
          />
          <CardsStackNav.Screen
            name="CardDetail"
            component={CardDetailFlow}
            options={{
              presentation: 'card',
              animation: 'ios_from_right',
            }}
          />
          <CardsStackNav.Screen name="DayView" component={DayViewFlow} options={{ presentation: 'card' }} />
          <CardsStackNav.Screen name="CardReview" component={ReviewFlow} options={{ presentation: 'card' }} />
        </CardsStackNav.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

function ProfileStack({
  onSwipeEnabledChange,
}: {
  onSwipeEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <NavigationIndependentTree>
      <NavigationContainer
        theme={APP_DARK_THEME}
        onReady={() => {
          onSwipeEnabledChange(true);
        }}
        onStateChange={(state) => {
          const routeName = getActiveRouteName(state);
          const isRootRoute = routeName === 'ProfileHome';
          onSwipeEnabledChange(isRootRoute);
        }}
      >
        <ProfileStackNav.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
          <ProfileStackNav.Screen name="ProfileHome" component={ProfileMainFlow} />
          <ProfileStackNav.Screen
            name="CardDetail"
            component={CardDetailFlow}
            options={{ presentation: 'card' }}
          />
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
      <View style={styles.tabTouchOverlay}>
        <TouchableOpacity
          style={styles.tabTouchZone}
          activeOpacity={1}
          onPress={() => onSelectTab(0)}
          accessibilityRole="button"
          accessibilityLabel="Deck tab"
        />
        <TouchableOpacity
          style={styles.tabTouchZone}
          activeOpacity={1}
          onPress={() => onSelectTab(1)}
          accessibilityRole="button"
          accessibilityLabel="Cache tab"
        />
        <TouchableOpacity
          style={styles.tabTouchZone}
          activeOpacity={1}
          onPress={() => onSelectTab(2)}
          accessibilityRole="button"
          accessibilityLabel="Profile tab"
        />
      </View>
    </View>
  );
}

export default function RootNavigator({ isExpoGo: _isExpoGo }: RootNavigatorProps) {
  const cardsNavigationRef = React.useMemo(() => createNavigationContainerRef<any>(), []);
  const cacheSwipeExclusionRangeRef = React.useRef<SwipeExclusionRange | null>(null);
  const cacheAddActionHandlerRef = React.useRef<(() => void) | null>(null);
  const swipeLockRef = React.useRef(false);
  const paginationEnabledRef = React.useRef(true);
  const [selectedTabIndex, setSelectedTabIndex] = React.useState(0);

  const setCacheSwipeExclusionRange = React.useCallback((range: SwipeExclusionRange | null) => {
    cacheSwipeExclusionRangeRef.current = range;
  }, []);

  const setPaginationEnabled = React.useCallback((enabled: boolean) => {
    paginationEnabledRef.current = enabled;
  }, []);

  const switchTabImmediately = React.useCallback(
    (index: number) => {
      const nextIndex = Math.min(MAIN_TAB_ORDER.length - 1, Math.max(0, index));
      if (nextIndex === selectedTabIndex) return;
      setSelectedTabIndex(nextIndex);
    },
    [selectedTabIndex]
  );

  const popDeckToRoot = React.useCallback(() => {
    if (!cardsNavigationRef.isReady()) return;
    const state = cardsNavigationRef.getRootState();
    const stackIndex = typeof state?.index === 'number' ? state.index : 0;
    if (stackIndex <= 0) return;
    cardsNavigationRef.dispatch(StackActions.popToTop());
  }, [cardsNavigationRef]);

  const handleTabSelect = React.useCallback((index: number) => {
    if (index === 0 && selectedTabIndex === 0) {
      popDeckToRoot();
      return;
    }
    switchTabImmediately(index);
  }, [popDeckToRoot, selectedTabIndex, switchTabImmediately]);

  const goToTab = React.useCallback((index: number) => {
    switchTabImmediately(index);
  }, [switchTabImmediately]);

  const setPagerScrollEnabled = React.useCallback((enabled: boolean) => {
    setPaginationEnabled(enabled);
  }, [setPaginationEnabled]);

  const setCacheAddActionHandler = React.useCallback((handler: (() => void) | null) => {
    cacheAddActionHandlerRef.current = handler;
  }, []);

  const setTabSwipeRouteEnabled = React.useCallback((_tabIndex: number, _enabled: boolean) => {
    // Page swipe is globally disabled; keep callback for compatibility with child stacks.
  }, []);

  const handleAddPress = React.useCallback(() => {
    if (selectedTabIndex !== CACHE_TAB_INDEX) return;
    const invoke = () => {
      cacheAddActionHandlerRef.current?.();
    };
    invoke();
  }, [selectedTabIndex]);

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
        <View style={styles.pager}>
          <View
            style={[styles.tabScene, selectedTabIndex === 0 ? styles.tabSceneActive : styles.tabSceneHidden]}
            pointerEvents={selectedTabIndex === 0 ? 'auto' : 'none'}
          >
            <CardsStack
              navigationRef={cardsNavigationRef}
              onSwipeEnabledChange={(enabled) => setTabSwipeRouteEnabled(0, enabled)}
            />
          </View>
          <View
            style={[styles.tabScene, selectedTabIndex === 1 ? styles.tabSceneActive : styles.tabSceneHidden]}
            pointerEvents={selectedTabIndex === 1 ? 'auto' : 'none'}
          >
            <CacheStack onSwipeEnabledChange={(enabled) => setTabSwipeRouteEnabled(1, enabled)} />
          </View>
          <View
            style={[styles.tabScene, selectedTabIndex === 2 ? styles.tabSceneActive : styles.tabSceneHidden]}
            pointerEvents={selectedTabIndex === 2 ? 'auto' : 'none'}
          >
            <ProfileStack onSwipeEnabledChange={(enabled) => setTabSwipeRouteEnabled(2, enabled)} />
          </View>
        </View>

        <View style={styles.tabBarAnimatedWrap}>
          <LiquidTabBar
            selectedTabIndex={selectedTabIndex}
            showsAddButton={false}
            onSelectTab={handleTabSelect}
            onAddPress={handleAddPress}
          />
        </View>

        {selectedTabIndex === CACHE_TAB_INDEX ? (
          <TouchableOpacity
            style={styles.floatingCacheAddButton}
            activeOpacity={0.9}
            onPress={handleAddPress}
          >
            <Text style={styles.floatingCacheAddButtonText}>＋</Text>
          </TouchableOpacity>
        ) : null}
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
  tabScene: {
    ...StyleSheet.absoluteFillObject,
  },
  tabSceneActive: {
    opacity: 1,
    zIndex: 2,
  },
  tabSceneHidden: {
    opacity: 0,
    zIndex: 1,
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
  floatingCacheAddButton: {
    position: 'absolute',
    right: 18,
    bottom: 92,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 12,
  },
  floatingCacheAddButtonText: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 30,
    fontWeight: '300',
    marginTop: -1,
  },
  nativeLiquidBar: {
    width: '100%',
    height: 82,
    backgroundColor: 'transparent',
  },
  tabTouchOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    flexDirection: 'row',
  },
  tabTouchZone: {
    flex: 1,
  },
});
