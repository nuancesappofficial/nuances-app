import React from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View, useColorScheme, useWindowDimensions } from 'react-native';
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
import { Q } from '@nozbe/watermelondb';
import CacheScreenFlow from '../screens/flow/CacheScreenFlow';
import AddCacheItemFlow from '../screens/flow/CacheScreenFlow/AddCacheItemFlow';
import CreateCardFlow from '../screens/flow/CacheScreenFlow/CreateCardFlow';
import ReviewFlow from '../screens/flow/DeckScreenFlow/ReviewFlow';
import AlbumViewFlow from '../screens/flow/DeckScreenFlow/AlbumViewFlow';
import CardDetailFlow from '../screens/flow/DeckScreenFlow/CardDetailFlow';
import DayViewFlow from '../screens/flow/DeckScreenFlow/DayViewFlow';
import DeckMainFlow from '../screens/flow/DeckScreenFlow/DeckMainFlow';
import ProfileMainFlow from '../screens/flow/ProfileScreenFlow/ProfileMainFlow';
import ProfileSettingsFlow from '../screens/flow/ProfileScreenFlow/ProfileSettingsFlow';
import { TabSwipeContext, type SwipeExclusionRange } from '../contexts/TabSwipeContext';
import { database } from '../database';
import type CachedItem from '../database/models/CachedItem';
import { resolveThemeColors } from '../theme/colors';

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

const ACTIVE_COLOR = '#4EAFF4';
const TAB_ITEMS = [
  {
    activeIcon: 'library',
    inactiveIcon: 'library-outline',
  },
  {
    activeIcon: 'layers',
    inactiveIcon: 'layers-outline',
  },
  {
    activeIcon: 'person-circle',
    inactiveIcon: 'person-circle-outline',
  },
] as const;

const APP_DARK_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#02213D',
    card: '#02213D',
    text: '#FBFBFB',
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
          <CacheStackNav.Screen
            name="CardDetail"
            component={CardDetailFlow}
            options={{
              presentation: 'card',
              animation: 'ios_from_right',
              gestureEnabled: true,
              fullScreenGestureEnabled: false,
              gestureResponseDistance: { start: 28 },
            }}
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
            fullScreenGestureEnabled: false,
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
              gestureEnabled: true,
              fullScreenGestureEnabled: false,
              gestureResponseDistance: { start: 28 },
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
            name="ProfileSettings"
            component={ProfileSettingsFlow}
            options={{
              presentation: 'card',
              animation: 'ios_from_right',
              gestureEnabled: true,
              fullScreenGestureEnabled: false,
              gestureResponseDistance: { start: 28 },
            }}
          />
          <ProfileStackNav.Screen
            name="CardDetail"
            component={CardDetailFlow}
            options={{
              presentation: 'card',
              animation: 'ios_from_right',
              gestureEnabled: true,
              fullScreenGestureEnabled: false,
              gestureResponseDistance: { start: 28 },
            }}
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
  cacheBadgeCount,
  navBg,
  navBorder,
  navIconActive,
  navIconInactive,
  navCapsuleBg,
  navCapsuleBorder,
}: {
  selectedTabIndex: number;
  onSelectTab: (index: number) => void;
  cacheBadgeCount: number;
  navBg: string;
  navBorder: string;
  navIconActive: string;
  navIconInactive: string;
  navCapsuleBg: string;
  navCapsuleBorder: string;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  const [tabBarWidth, setTabBarWidth] = React.useState(0);
  const activeTranslateX = React.useRef(new Animated.Value(TAB_BAR_SIDE_PADDING + TAB_CAPSULE_INSET)).current;
  const initializedSlotWidthRef = React.useRef(0);
  const pressScales = React.useRef(TAB_ITEMS.map(() => new Animated.Value(1))).current;
  const innerTrackWidth = Math.max(0, tabBarWidth - TAB_BAR_SIDE_PADDING * 2);
  const slotWidth = innerTrackWidth > 0 ? innerTrackWidth / 3 : 0;
  const capsuleWidth = Math.max(0, slotWidth - TAB_CAPSULE_INSET * 2);
  const capsuleBaseX = TAB_BAR_SIDE_PADDING + TAB_CAPSULE_INSET;

  React.useEffect(() => {
    if (slotWidth <= 0) return;
    const toValue = capsuleBaseX + slotWidth * selectedTabIndex;
    activeTranslateX.stopAnimation();
    Animated.timing(activeTranslateX, {
      toValue,
      duration: 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [activeTranslateX, capsuleBaseX, selectedTabIndex, slotWidth]);

  React.useEffect(() => {
    if (slotWidth <= 0) return;
    if (Math.abs(initializedSlotWidthRef.current - slotWidth) < 0.5) return;
    initializedSlotWidthRef.current = slotWidth;
    activeTranslateX.setValue(capsuleBaseX + slotWidth * selectedTabIndex);
  }, [activeTranslateX, capsuleBaseX, selectedTabIndex, slotWidth]);
  const handlePressIn = React.useCallback((index: number) => {
    Animated.spring(pressScales[index], {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 26,
      bounciness: 0,
    }).start();
  }, [pressScales]);
  const handlePressOut = React.useCallback((index: number) => {
    Animated.spring(pressScales[index], {
      toValue: 1,
      useNativeDriver: true,
      speed: 22,
      bounciness: 6,
    }).start();
  }, [pressScales]);

  return (
    <View style={styles.tabBarOuter}>
      <View
        style={[styles.rnTabBarWrap, { marginBottom: bottomInset, backgroundColor: navBg, borderColor: navBorder }]}
        onLayout={(event) => {
          const width = Math.round(event.nativeEvent.layout.width);
          if (width > 0 && width !== tabBarWidth) {
            const nextInnerTrackWidth = Math.max(0, width - TAB_BAR_SIDE_PADDING * 2);
            const nextSlotWidth = nextInnerTrackWidth > 0 ? nextInnerTrackWidth / TAB_ITEMS.length : 0;
            if (nextSlotWidth > 0) {
              activeTranslateX.setValue(TAB_BAR_SIDE_PADDING + TAB_CAPSULE_INSET + nextSlotWidth * selectedTabIndex);
            }
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
                backgroundColor: navCapsuleBg,
                borderColor: navCapsuleBorder,
                transform: [
                  {
                    translateX: activeTranslateX,
                  },
                ],
              },
            ]}
          />
        ) : null}

        {TAB_ITEMS.map((item, index) => {
          const active = selectedTabIndex === index;
          return (
            <TouchableOpacity
              key={`tab-item-${index}`}
              style={styles.rnTabButton}
              activeOpacity={1}
              onPressIn={() => handlePressIn(index)}
              onPressOut={() => handlePressOut(index)}
              onPress={() => onSelectTab(index)}
            >
              <Animated.View style={{ transform: [{ scale: pressScales[index] }] }}>
                <View style={styles.tabIconWrap}>
                  <Ionicons
                    name={active ? item.activeIcon : item.inactiveIcon}
                    size={27}
                    color={active ? navIconActive : navIconInactive}
                  />
                  {index === 1 && cacheBadgeCount > 0 ? (
                    <View style={styles.cacheBadge}>
                      <Animated.Text style={styles.cacheBadgeText}>
                        {cacheBadgeCount > 99 ? '99+' : String(cacheBadgeCount)}
                      </Animated.Text>
                    </View>
                  ) : null}
                </View>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function RootNavigator({ isExpoGo: _isExpoGo }: RootNavigatorProps) {
  const colorScheme = useColorScheme();
  const theme = React.useMemo(() => resolveThemeColors('dark'), [colorScheme]);
  const { width: screenWidth } = useWindowDimensions();
  const cardsNavigationRef = React.useMemo(() => createNavigationContainerRef<any>(), []);
  const cacheSwipeExclusionRangeRef = React.useRef<SwipeExclusionRange | null>(null);
  const swipeLockRef = React.useRef(false);
  const paginationEnabledRef = React.useRef(true);
  const [selectedTabIndex, setSelectedTabIndex] = React.useState(0);
  const [cacheBadgeCount, setCacheBadgeCount] = React.useState(0);
  const [tabTransitionFromIndex, setTabTransitionFromIndex] = React.useState(0);
  const [tabTransitionToIndex, setTabTransitionToIndex] = React.useState(0);
  const [tabTransitionAnimation, setTabTransitionAnimation] = React.useState<'fade' | 'slide'>('fade');
  const [isTabTransitioning, setIsTabTransitioning] = React.useState(false);
  const tabSceneProgress = React.useRef(new Animated.Value(1)).current;
  const [tabRootRouteEnabledMap, setTabRootRouteEnabledMap] = React.useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: true,
  });
  const [tabBarForcedHidden, setTabBarForcedHidden] = React.useState(false);
  const cacheAddActionHandlerRef = React.useRef<(() => void) | null>(null);

  const setCacheSwipeExclusionRange = React.useCallback((range: SwipeExclusionRange | null) => {
    cacheSwipeExclusionRangeRef.current = range;
  }, []);

  const setPaginationEnabled = React.useCallback((enabled: boolean) => {
    paginationEnabledRef.current = enabled;
  }, []);

  const switchTabImmediately = React.useCallback(
    (index: number, options?: { animation?: 'fade' | 'slide' }) => {
      const nextIndex = Math.min(MAIN_TAB_ORDER.length - 1, Math.max(0, index));
      if (nextIndex === selectedTabIndex) return;
      const animationType = options?.animation ?? 'fade';
      setTabTransitionFromIndex(selectedTabIndex);
      setTabTransitionToIndex(nextIndex);
      setTabTransitionAnimation(animationType);
      setIsTabTransitioning(true);
      tabSceneProgress.stopAnimation();
      tabSceneProgress.setValue(0);
      setSelectedTabIndex(nextIndex);
      Animated.timing(tabSceneProgress, {
        toValue: 1,
        duration: animationType === 'slide' ? 360 : 240,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        setIsTabTransitioning(false);
        setTabTransitionFromIndex(nextIndex);
      });
    },
    [selectedTabIndex, tabSceneProgress]
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
    switchTabImmediately(index, { animation: 'fade' });
  }, [popDeckToRoot, selectedTabIndex, switchTabImmediately]);

  const goToTab = React.useCallback((index: number, options?: { animation?: 'fade' | 'slide' }) => {
    switchTabImmediately(index, options);
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

  const setCacheAddActionHandler = React.useCallback((handler: (() => void) | null) => {
    cacheAddActionHandlerRef.current = handler;
  }, []);

  const triggerCacheAddAction = React.useCallback(() => {
    cacheAddActionHandlerRef.current?.();
  }, []);

  const shouldShowTabBar = (tabRootRouteEnabledMap[selectedTabIndex] ?? true) && !tabBarForcedHidden;
  const tabBarTranslateY = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const query = database
      .get<CachedItem>('cached_items')
      .query(Q.where('deleted_at', null));

    const load = async () => {
      try {
        const items = await query.fetch();
        setCacheBadgeCount(items.length);
      } catch (error) {
        console.error('[RootNavigator] load cache badge count failed:', error);
        setCacheBadgeCount(0);
      }
    };

    void load();
    const sub = query.observe().subscribe((items: CachedItem[]) => setCacheBadgeCount(items.length));
    return () => sub.unsubscribe();
  }, []);

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
        setCacheAddActionHandler,
        triggerCacheAddAction,
        setTabBarHidden: setTabBarForcedHidden,
      }}
    >
      <View style={[styles.container, { backgroundColor: theme.screenBg }]}>
        <View style={styles.pager}>
          {/*
            只讓 from/to 兩個 scene 參與 cross-fade，避免 0 <-> 2 時閃現中間頁。
          */}
          <Animated.View
            style={[
              styles.tabScene,
              {
                opacity:
                  tabTransitionAnimation === 'slide'
                    ? selectedTabIndex === 0 || (isTabTransitioning && (tabTransitionFromIndex === 0 || tabTransitionToIndex === 0))
                      ? 1
                      : 0
                    : isTabTransitioning && tabTransitionFromIndex === 0
                      ? tabSceneProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0],
                          extrapolate: 'clamp',
                        })
                      : isTabTransitioning && tabTransitionToIndex === 0
                        ? tabSceneProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 1],
                            extrapolate: 'clamp',
                          })
                        : selectedTabIndex === 0
                          ? 1
                          : 0,
                transform: [
                  {
                    translateX:
                      tabTransitionAnimation === 'slide' && isTabTransitioning
                        ? tabTransitionFromIndex === 0
                          ? tabSceneProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, tabTransitionToIndex > tabTransitionFromIndex ? -screenWidth : screenWidth],
                              extrapolate: 'clamp',
                            })
                          : tabTransitionToIndex === 0
                            ? tabSceneProgress.interpolate({
                                inputRange: [0, 1],
                                outputRange: [tabTransitionToIndex > tabTransitionFromIndex ? screenWidth : -screenWidth, 0],
                                extrapolate: 'clamp',
                              })
                            : 0
                        : 0,
                  },
                ],
                zIndex: selectedTabIndex === 0 ? 3 : isTabTransitioning && tabTransitionFromIndex === 0 ? 2 : 1,
              },
            ]}
            pointerEvents={selectedTabIndex === 0 ? 'auto' : 'none'}
          >
            <CardsStack
              navigationRef={cardsNavigationRef}
              onSwipeEnabledChange={(enabled) => setTabSwipeRouteEnabled(0, enabled)}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.tabScene,
              {
                opacity:
                  tabTransitionAnimation === 'slide'
                    ? selectedTabIndex === 1 || (isTabTransitioning && (tabTransitionFromIndex === 1 || tabTransitionToIndex === 1))
                      ? 1
                      : 0
                    : isTabTransitioning && tabTransitionFromIndex === 1
                      ? tabSceneProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0],
                          extrapolate: 'clamp',
                        })
                      : isTabTransitioning && tabTransitionToIndex === 1
                        ? tabSceneProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 1],
                            extrapolate: 'clamp',
                          })
                        : selectedTabIndex === 1
                          ? 1
                          : 0,
                transform: [
                  {
                    translateX:
                      tabTransitionAnimation === 'slide' && isTabTransitioning
                        ? tabTransitionFromIndex === 1
                          ? tabSceneProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, tabTransitionToIndex > tabTransitionFromIndex ? -screenWidth : screenWidth],
                              extrapolate: 'clamp',
                            })
                          : tabTransitionToIndex === 1
                            ? tabSceneProgress.interpolate({
                                inputRange: [0, 1],
                                outputRange: [tabTransitionToIndex > tabTransitionFromIndex ? screenWidth : -screenWidth, 0],
                                extrapolate: 'clamp',
                              })
                            : 0
                        : 0,
                  },
                ],
                zIndex: selectedTabIndex === 1 ? 3 : isTabTransitioning && tabTransitionFromIndex === 1 ? 2 : 1,
              },
            ]}
            pointerEvents={selectedTabIndex === 1 ? 'auto' : 'none'}
          >
            <CacheStack onSwipeEnabledChange={(enabled) => setTabSwipeRouteEnabled(1, enabled)} />
          </Animated.View>
          <Animated.View
            style={[
              styles.tabScene,
              {
                opacity:
                  tabTransitionAnimation === 'slide'
                    ? selectedTabIndex === 2 || (isTabTransitioning && (tabTransitionFromIndex === 2 || tabTransitionToIndex === 2))
                      ? 1
                      : 0
                    : isTabTransitioning && tabTransitionFromIndex === 2
                      ? tabSceneProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0],
                          extrapolate: 'clamp',
                        })
                      : isTabTransitioning && tabTransitionToIndex === 2
                        ? tabSceneProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 1],
                            extrapolate: 'clamp',
                          })
                        : selectedTabIndex === 2
                          ? 1
                          : 0,
                transform: [
                  {
                    translateX:
                      tabTransitionAnimation === 'slide' && isTabTransitioning
                        ? tabTransitionFromIndex === 2
                          ? tabSceneProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, tabTransitionToIndex > tabTransitionFromIndex ? -screenWidth : screenWidth],
                              extrapolate: 'clamp',
                            })
                          : tabTransitionToIndex === 2
                            ? tabSceneProgress.interpolate({
                                inputRange: [0, 1],
                                outputRange: [tabTransitionToIndex > tabTransitionFromIndex ? screenWidth : -screenWidth, 0],
                                extrapolate: 'clamp',
                              })
                            : 0
                        : 0,
                  },
                ],
                zIndex: selectedTabIndex === 2 ? 3 : isTabTransitioning && tabTransitionFromIndex === 2 ? 2 : 1,
              },
            ]}
            pointerEvents={selectedTabIndex === 2 ? 'auto' : 'none'}
          >
            <ProfileStack onSwipeEnabledChange={(enabled) => setTabSwipeRouteEnabled(2, enabled)} />
          </Animated.View>
        </View>

        <Animated.View
          pointerEvents={shouldShowTabBar ? 'auto' : 'none'}
          style={[styles.tabBarAnimatedWrap, { transform: [{ translateY: tabBarTranslateY }] }]}
        >
          <LiquidTabBar
            selectedTabIndex={selectedTabIndex}
            onSelectTab={handleTabSelect}
            cacheBadgeCount={cacheBadgeCount}
            navBg={theme.navBg}
            navBorder={theme.navBorder}
            navIconActive={theme.navActive}
            navIconInactive={theme.navInactive}
            navCapsuleBg={theme.navCapsuleBg}
            navCapsuleBorder={theme.navCapsuleBorder}
          />
        </Animated.View>
      </View>
    </TabSwipeContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02213D',
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
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.34,
    shadowRadius: 20,
    elevation: 16,
    overflow: 'visible',
  },
  rnActiveCapsule: {
    position: 'absolute',
    left: 0,
    top: TAB_BAR_VERTICAL_INSET,
    height: TAB_CAPSULE_HEIGHT,
    borderRadius: TAB_CAPSULE_RADIUS,
    borderWidth: 1,
    shadowColor: '#89CCFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  rnTabButton: {
    flex: 1,
    height: TAB_CAPSULE_HEIGHT,
    borderRadius: TAB_CAPSULE_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tabIconWrap: {
    position: 'relative',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cacheBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 999,
    backgroundColor: '#FF2D55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cacheBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
