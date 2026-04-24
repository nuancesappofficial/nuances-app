import React from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  NavigationContainer,
  NavigationIndependentTree,
  DarkTheme,
  StackActions,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
const TAB_BAR_SIDE_PADDING = 14;
const TAB_CAPSULE_INSET = 0;
const TAB_BAR_HEIGHT = 65;
const TAB_BAR_VERTICAL_INSET = 5;
const TAB_BAR_RADIUS = TAB_BAR_HEIGHT / 2;
const TAB_CAPSULE_HEIGHT = TAB_BAR_HEIGHT - TAB_BAR_VERTICAL_INSET * 2;
const TAB_CAPSULE_RADIUS = TAB_CAPSULE_HEIGHT / 2;

const ACTIVE_COLOR = '#D4FF00';

const APP_DARK_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#ADD8E6',
    card: '#ADD8E6',
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
  const cacheNavigationRef = React.useMemo(() => createNavigationContainerRef<any>(), []);
  const syncSwipeEnabled = React.useCallback(() => {
    const state = cacheNavigationRef.getRootState();
    const routeName = getActiveRouteName(state);
    const isRootRoute = routeName === 'CacheList';
    onSwipeEnabledChange(isRootRoute);
  }, [cacheNavigationRef, onSwipeEnabledChange]);

  return (
    <NavigationIndependentTree>
      <NavigationContainer
        ref={cacheNavigationRef}
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
        <CacheStackNav.Navigator
          screenOptions={{ headerShown: false, gestureEnabled: false }}
          screenListeners={{
            transitionStart: () => {
              syncSwipeEnabled();
            },
          }}
        >
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
  const syncSwipeEnabled = React.useCallback(() => {
    const state = navigationRef.getRootState();
    const routeName = getActiveRouteName(state);
    const isDeckScreen = routeName === 'CardsList' || routeName === 'Deck';
    onSwipeEnabledChange(isDeckScreen);
  }, [navigationRef, onSwipeEnabledChange]);

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
          const isDeckScreen = routeName === 'CardsList' || routeName === 'Deck';
          onSwipeEnabledChange(isDeckScreen);
        }}
      >
        <CardsStackNav.Navigator
          screenOptions={{
            headerShown: false,
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            animation: 'ios_from_right',
          }}
          screenListeners={{
            transitionStart: () => {
              syncSwipeEnabled();
            },
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
  const profileNavigationRef = React.useMemo(() => createNavigationContainerRef<any>(), []);
  const syncSwipeEnabled = React.useCallback(() => {
    const state = profileNavigationRef.getRootState();
    const routeName = getActiveRouteName(state);
    const isRootRoute = routeName === 'ProfileHome';
    onSwipeEnabledChange(isRootRoute);
  }, [onSwipeEnabledChange, profileNavigationRef]);

  return (
    <NavigationIndependentTree>
      <NavigationContainer
        ref={profileNavigationRef}
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
        <ProfileStackNav.Navigator
          screenOptions={{ headerShown: false, gestureEnabled: false }}
          screenListeners={{
            transitionStart: () => {
              syncSwipeEnabled();
            },
          }}
        >
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
  onSelectTab,
}: {
  selectedTabIndex: number;
  onSelectTab: (index: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  const [tabBarWidth, setTabBarWidth] = React.useState(0);
  const activeIndex = React.useRef(new Animated.Value(selectedTabIndex)).current;

  React.useEffect(() => {
    Animated.spring(activeIndex, {
      toValue: selectedTabIndex,
      useNativeDriver: false,
      tension: 220,
      friction: 22,
    }).start();
  }, [activeIndex, selectedTabIndex]);

  const innerTrackWidth = Math.max(0, tabBarWidth - TAB_BAR_SIDE_PADDING * 2);
  const slotWidth = innerTrackWidth > 0 ? innerTrackWidth / 3 : 0;
  const capsuleWidth = Math.max(0, slotWidth - TAB_CAPSULE_INSET * 2);

  return (
    <View style={styles.tabBarOuter}>
      <View
        style={[styles.rnTabBarWrap, { marginBottom: bottomInset }]}
        onLayout={(event) => {
          const width = Math.round(event.nativeEvent.layout.width);
          if (width > 0 && width !== tabBarWidth) {
            setTabBarWidth(width);
          }
        }}
      >
        {slotWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.rnActiveCapsule,
              {
                width: capsuleWidth,
                transform: [
                  {
                    translateX: activeIndex.interpolate({
                      inputRange: [0, 1, 2],
                      outputRange: [
                        TAB_BAR_SIDE_PADDING + TAB_CAPSULE_INSET,
                        TAB_BAR_SIDE_PADDING + slotWidth + TAB_CAPSULE_INSET,
                        TAB_BAR_SIDE_PADDING + slotWidth * 2 + TAB_CAPSULE_INSET,
                      ],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}

        <TouchableOpacity
          style={styles.rnTabButton}
          activeOpacity={0.9}
          onPress={() => onSelectTab(0)}
        >
          <Ionicons
            name={selectedTabIndex === 0 ? 'albums' : 'albums-outline'}
            size={25}
            color={selectedTabIndex === 0 ? '#2FA7FF' : '#FFFFFF'}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.rnTabButton}
          activeOpacity={0.9}
          onPress={() => onSelectTab(1)}
        >
          <Ionicons
            name={selectedTabIndex === 1 ? 'archive' : 'archive-outline'}
            size={25}
            color={selectedTabIndex === 1 ? '#2FA7FF' : '#FFFFFF'}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.rnTabButton}
          activeOpacity={0.9}
          onPress={() => onSelectTab(2)}
        >
          <Ionicons
            name={selectedTabIndex === 2 ? 'person-circle' : 'person-circle-outline'}
            size={25}
            color={selectedTabIndex === 2 ? '#2FA7FF' : '#FFFFFF'}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function RootNavigator({ isExpoGo: _isExpoGo }: RootNavigatorProps) {
  const cardsNavigationRef = React.useMemo(() => createNavigationContainerRef<any>(), []);
  const cacheSwipeExclusionRangeRef = React.useRef<SwipeExclusionRange | null>(null);
  const swipeLockRef = React.useRef(false);
  const paginationEnabledRef = React.useRef(true);
  const [selectedTabIndex, setSelectedTabIndex] = React.useState(0);
  const [tabRootRouteEnabledMap, setTabRootRouteEnabledMap] = React.useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: true,
  });

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

  const setTabSwipeRouteEnabled = React.useCallback((_tabIndex: number, _enabled: boolean) => {
    setTabRootRouteEnabledMap((prev) => {
      if (prev[_tabIndex] === _enabled) return prev;
      return { ...prev, [_tabIndex]: _enabled };
    });
  }, []);

  const shouldShowTabBar = tabRootRouteEnabledMap[selectedTabIndex] ?? true;
  const tabBarTranslateY = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(tabBarTranslateY, {
      toValue: shouldShowTabBar ? 0 : 140,
      duration: shouldShowTabBar ? 210 : 320,
      easing: shouldShowTabBar ? Easing.out(Easing.exp) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [shouldShowTabBar, tabBarTranslateY]);

  return (
    <TabSwipeContext.Provider
      value={{
        setCacheSwipeExclusionRange,
        swipeLockRef,
        setPaginationEnabled,
        setPagerScrollEnabled,
        goToTab,
        setCacheAddActionHandler: () => {},
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

        <Animated.View
          pointerEvents={shouldShowTabBar ? 'auto' : 'none'}
          style={[styles.tabBarAnimatedWrap, { transform: [{ translateY: tabBarTranslateY }] }]}
        >
          <LiquidTabBar
            selectedTabIndex={selectedTabIndex}
            onSelectTab={handleTabSelect}
          />
        </Animated.View>
      </View>
    </TabSwipeContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ADD8E6',
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
    alignItems: 'center',
    zIndex: 200,
  },
  tabBarAnimatedWrap: {
    position: 'absolute',
    bottom: -15,
    left: 0,
    right: 0,
    zIndex: 200,
  },
  rnTabBarWrap: {
    width: '75%',
    maxWidth: 360,
    minWidth: 250,
    height: TAB_BAR_HEIGHT,
    paddingHorizontal: TAB_BAR_SIDE_PADDING,
    borderRadius: TAB_BAR_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,12,18,0.90)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  rnActiveCapsule: {
    position: 'absolute',
    left: 0,
    top: TAB_BAR_VERTICAL_INSET,
    height: TAB_CAPSULE_HEIGHT,
    borderRadius: TAB_CAPSULE_RADIUS,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  rnTabButton: {
    flex: 1,
    height: TAB_CAPSULE_HEIGHT,
    borderRadius: TAB_CAPSULE_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
