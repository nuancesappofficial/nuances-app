import React from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View, useColorScheme } from 'react-native';
import {
  NavigationContainer,
  NavigationIndependentTree,
  DarkTheme,
  StackActions,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
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
import ProfileSettingOptionsFlow from '../screens/flow/ProfileScreenFlow/ProfileSettingOptionsFlow';
import { TabSwipeContext, type SwipeExclusionRange } from '../contexts/TabSwipeContext';
import { database } from '../database';
import type CachedItem from '../database/models/CachedItem';
import { resolveThemeColors } from '../theme/colors';

const CacheStackNav = createStackNavigator();
const CardsStackNav = createStackNavigator();
const ProfileStackNav = createStackNavigator();

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
  { activeIcon: 'library', inactiveIcon: 'library-outline' },
  { activeIcon: 'layers', inactiveIcon: 'layers-outline' },
  { activeIcon: 'settings', inactiveIcon: 'settings-outline' },
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

const IOS_CARD_SCREEN_OPTIONS = {
  presentation: 'card' as const,
  gestureEnabled: true,
  gestureResponseDistance: 28,
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

function withNavBarSync<P extends object>(Component: React.ComponentType<P>) {
  return function WrappedComponent(props: P) {
    const tabSwipeContext = React.useContext(TabSwipeContext);

    React.useEffect(() => {
      tabSwipeContext?.setTabBarHidden?.(true);
      return () => {
        tabSwipeContext?.setTabBarHidden?.(false);
      };
    }, [tabSwipeContext]);

    return <Component {...props} />;
  };
}

// 預先封裝需要隱藏導覽列的子頁面
const SyncAddCacheItemFlow = withNavBarSync(AddCacheItemFlow);
const SyncCreateCardFlow = withNavBarSync(CreateCardFlow);
const SyncCardDetailFlow = withNavBarSync(CardDetailFlow);
const SyncAlbumViewFlow = withNavBarSync(AlbumViewFlow);
const SyncDayViewFlow = withNavBarSync(DayViewFlow);
const SyncReviewFlow = withNavBarSync(ReviewFlow);
const SyncProfileSettingsFlow = withNavBarSync(ProfileSettingsFlow);
const SyncProfileSettingOptionsFlow = withNavBarSync(ProfileSettingOptionsFlow);

function CacheStack({ onSwipeEnabledChange }: { onSwipeEnabledChange: (enabled: boolean) => void }) {
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
        onReady={() => onSwipeEnabledChange(true)}
        onStateChange={(state) => {
          const routeName = getActiveRouteName(state);
          onSwipeEnabledChange(routeName === 'CacheList');
        }}
      >
        <CacheStackNav.Navigator
          screenOptions={{ headerShown: false, gestureEnabled: false }}
          screenListeners={{ transitionStart: () => syncSwipeEnabled() }}
        >
          <CacheStackNav.Screen name="CacheList" component={CacheScreenFlow} />
          <CacheStackNav.Screen
            name="AddCacheItem"
            component={SyncAddCacheItemFlow}
            options={({ route }) => {
              const quickFlow = Boolean(
                (route as any)?.params?.autoOpenCropper ||
                (route as any)?.params?.startMode === 'camera' ||
                (route as any)?.params?.startMode === 'library'
              );
              if (quickFlow) {
                return {
                  presentation: 'transparentModal',
                  animationEnabled: false,
                  cardStyle: { backgroundColor: 'transparent' },
                };
              }
              return { presentation: 'modal' };
            }}
          />
          <CacheStackNav.Screen
            name="CreateCard"
            component={SyncCreateCardFlow}
            options={{ presentation: 'card', gestureEnabled: true, gestureResponseDistance: 28 }}
          />
          <CacheStackNav.Screen name="CardDetail" component={SyncCardDetailFlow} options={{ presentation: 'card', gestureEnabled: true, gestureResponseDistance: 28 }} />
        </CacheStackNav.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

function CardsStack({ onSwipeEnabledChange, navigationRef }: { onSwipeEnabledChange: (enabled: boolean) => void; navigationRef: ReturnType<typeof createNavigationContainerRef<any>> }) {
  const syncSwipeEnabled = React.useCallback(() => {
    const state = navigationRef.getRootState();
    const routeName = getActiveRouteName(state);
    onSwipeEnabledChange(routeName === 'CardsList' || routeName === 'Deck');
  }, [navigationRef, onSwipeEnabledChange]);

  return (
    <NavigationIndependentTree>
      <NavigationContainer
        ref={navigationRef}
        theme={APP_DARK_THEME}
        onReady={() => onSwipeEnabledChange(true)}
        onStateChange={(state) => {
          const routeName = getActiveRouteName(state);
          onSwipeEnabledChange(routeName === 'CardsList' || routeName === 'Deck');
        }}
      >
        <CardsStackNav.Navigator
          screenOptions={{ headerShown: false, gestureEnabled: true }}
          screenListeners={{ transitionStart: () => syncSwipeEnabled() }}
        >
          <CardsStackNav.Screen name="CardsList" component={DeckMainFlow} />
          <CardsStackNav.Screen name="Deck" component={DeckMainFlow} options={{ presentation: 'card' }} />
          <CardsStackNav.Screen name="AlbumView" component={SyncAlbumViewFlow} options={{ presentation: 'card' }} />
          <CardsStackNav.Screen name="CardDetail" component={SyncCardDetailFlow} options={{ presentation: 'card', gestureEnabled: true, gestureResponseDistance: 28 }} />
          <CardsStackNav.Screen name="DayView" component={SyncDayViewFlow} options={{ presentation: 'card' }} />
          <CardsStackNav.Screen name="CardReview" component={SyncReviewFlow} options={{ presentation: 'card' }} />
        </CardsStackNav.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

function ProfileStack({ onSwipeEnabledChange }: { onSwipeEnabledChange: (enabled: boolean) => void }) {
  const profileNavigationRef = React.useMemo(() => createNavigationContainerRef<any>(), []);
  const syncSwipeEnabled = React.useCallback(() => {
    const state = profileNavigationRef.getRootState();
    const routeName = getActiveRouteName(state);
    onSwipeEnabledChange(routeName === 'ProfileHome');
  }, [onSwipeEnabledChange, profileNavigationRef]);

  return (
    <NavigationIndependentTree>
      <NavigationContainer
        ref={profileNavigationRef}
        theme={APP_DARK_THEME}
        onReady={() => onSwipeEnabledChange(true)}
        onStateChange={(state) => {
          const routeName = getActiveRouteName(state);
          onSwipeEnabledChange(routeName === 'ProfileHome');
        }}
      >
        <ProfileStackNav.Navigator
          screenOptions={{ headerShown: false, gestureEnabled: false }}
          screenListeners={{ transitionStart: () => syncSwipeEnabled() }}
        >
          <ProfileStackNav.Screen name="ProfileHome" component={ProfileMainFlow} />
          <ProfileStackNav.Screen name="ProfileSettings" component={SyncProfileSettingsFlow} options={IOS_CARD_SCREEN_OPTIONS} />
          <ProfileStackNav.Screen name="ProfileSettingOptions" component={SyncProfileSettingOptionsFlow} options={IOS_CARD_SCREEN_OPTIONS} />
          <ProfileStackNav.Screen name="CardDetail" component={SyncCardDetailFlow} options={{ presentation: 'card', gestureEnabled: true, gestureResponseDistance: 28 }} />
        </ProfileStackNav.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

type RootNavigatorProps = { isExpoGo?: boolean };

function LiquidTabBar({ selectedTabIndex, onSelectTab, cacheBadgeCount, navBg, navBorder, navIconActive, navIconInactive, navCapsuleBg, navCapsuleBorder }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  const [tabBarWidth, setTabBarWidth] = React.useState(0);
  const [optimisticSelectedIndex, setOptimisticSelectedIndex] = React.useState(selectedTabIndex);
  const activeTranslateX = React.useRef(new Animated.Value(TAB_BAR_SIDE_PADDING + TAB_CAPSULE_INSET)).current;
  const pressScales = React.useRef(TAB_ITEMS.map(() => new Animated.Value(1))).current;
  const iconOpacities = React.useRef(TAB_ITEMS.map((_, i) => new Animated.Value(i === selectedTabIndex ? 1 : 0))).current;

  const innerTrackWidth = Math.max(0, tabBarWidth - TAB_BAR_SIDE_PADDING * 2);
  const slotWidth = innerTrackWidth > 0 ? innerTrackWidth / 3 : 0;
  const capsuleWidth = Math.max(0, slotWidth - TAB_CAPSULE_INSET * 2);
  const capsuleBaseX = TAB_BAR_SIDE_PADDING + TAB_CAPSULE_INSET;

  const animateCapsuleToIndex = React.useCallback((index: number, duration = 300) => {
    if (slotWidth <= 0) return;
    activeTranslateX.stopAnimation();
    Animated.parallel([
      Animated.timing(activeTranslateX, { toValue: capsuleBaseX + slotWidth * index, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ...iconOpacities.map((anim, i) => Animated.timing(anim, { toValue: i === index ? 1 : 0, duration, easing: Easing.out(Easing.quad), useNativeDriver: true })),
    ]).start();
  }, [activeTranslateX, capsuleBaseX, slotWidth, iconOpacities]);

  React.useEffect(() => setOptimisticSelectedIndex(selectedTabIndex), [selectedTabIndex]);
  React.useEffect(() => animateCapsuleToIndex(optimisticSelectedIndex), [animateCapsuleToIndex, optimisticSelectedIndex]);

  const handleTabPressIn = React.useCallback((index: number) => {
    setOptimisticSelectedIndex(index);
    animateCapsuleToIndex(index);
    onSelectTab(index);
    Animated.spring(pressScales[index], { toValue: 0.92, useNativeDriver: true, speed: 26, bounciness: 0 }).start();
  }, [animateCapsuleToIndex, onSelectTab, pressScales]);

  return (
    <View style={styles.tabBarOuter}>
      <View
        style={[styles.rnTabBarWrap, { marginBottom: bottomInset, backgroundColor: navBg, borderColor: navBorder }]}
        onLayout={(e) => {
          const width = Math.round(e.nativeEvent.layout.width);
          if (width > 0 && width !== tabBarWidth) {
            const nextSlotWidth = Math.max(0, width - TAB_BAR_SIDE_PADDING * 2) / TAB_ITEMS.length;
            activeTranslateX.setValue(TAB_BAR_SIDE_PADDING + TAB_CAPSULE_INSET + nextSlotWidth * optimisticSelectedIndex);
            setTabBarWidth(width);
          }
        }}
      >
        {slotWidth > 0 && (
          <Animated.View pointerEvents="none" style={[styles.rnActiveCapsule, { width: capsuleWidth, backgroundColor: navCapsuleBg, borderColor: navCapsuleBorder, transform: [{ translateX: activeTranslateX }] }]} />
        )}
        {TAB_ITEMS.map((item, index) => (
          <TouchableOpacity key={index} style={styles.rnTabButton} activeOpacity={1} onPressIn={() => handleTabPressIn(index)} onPressOut={() => Animated.spring(pressScales[index], { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 6 }).start()}>
            <Animated.View style={{ transform: [{ scale: pressScales[index] }] }}>
              <View style={styles.tabIconWrap}>
                <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: iconOpacities[index].interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
                  <Ionicons name={item.inactiveIcon} size={27} color={navIconInactive} />
                </Animated.View>
                <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: iconOpacities[index] }]}>
                  <Ionicons name={item.activeIcon} size={27} color={navIconActive} />
                </Animated.View>
                {index === 1 && cacheBadgeCount > 0 && (
                  <View style={styles.cacheBadge}>
                    <Animated.Text style={styles.cacheBadgeText}>{cacheBadgeCount > 99 ? '99+' : String(cacheBadgeCount)}</Animated.Text>
                  </View>
                )}
              </View>
            </Animated.View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function RootNavigator({ isExpoGo: _isExpoGo }: RootNavigatorProps) {
  const colorScheme = useColorScheme();
  const theme = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const cardsNavigationRef = React.useMemo(() => createNavigationContainerRef<any>(), []);

  const cacheSwipeExclusionRangeRef = React.useRef<SwipeExclusionRange | null>(null);
  const swipeLockRef = React.useRef(false);
  const paginationEnabledRef = React.useRef(true);
  const [selectedTabIndex, setSelectedTabIndex] = React.useState(0);
  const selectedTabIndexRef = React.useRef(0);
  const [cacheBadgeCount, setCacheBadgeCount] = React.useState(0);
  const [tabRootRouteEnabledMap, setTabRootRouteEnabledMap] = React.useState<Record<number, boolean>>({ 0: true, 1: true, 2: true });
  const [tabBarForcedHidden, setTabBarForcedHidden] = React.useState(false);

  const cacheAddActionHandlerRef = React.useRef<(() => void) | null>(null);
  const fallbackTranslateY = React.useRef(new Animated.Value(0)).current;

  const tabOpacities = React.useRef([new Animated.Value(1), new Animated.Value(0), new Animated.Value(0)]).current;

  React.useEffect(() => {
    selectedTabIndexRef.current = selectedTabIndex;
  }, [selectedTabIndex]);

  const switchTabImmediately = React.useCallback((index: number, duration = 260) => {
    const nextIndex = Math.min(MAIN_TAB_ORDER.length - 1, Math.max(0, index));
    if (nextIndex === selectedTabIndexRef.current) return;
    selectedTabIndexRef.current = nextIndex;
    setSelectedTabIndex(nextIndex);
    Animated.parallel(tabOpacities.map((anim, i) => Animated.timing(anim, { toValue: i === nextIndex ? 1 : 0, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }))).start();
  }, [tabOpacities]);

  const setTabRootRouteEnabled = React.useCallback((index: number, enabled: boolean) => {
    setTabRootRouteEnabledMap((prev) => {
      if (prev[index] === enabled) return prev;
      return { ...prev, [index]: enabled };
    });
  }, []);

  const handleDeckRootRouteEnabledChange = React.useCallback(
    (enabled: boolean) => setTabRootRouteEnabled(0, enabled),
    [setTabRootRouteEnabled]
  );

  const handleCacheRootRouteEnabledChange = React.useCallback(
    (enabled: boolean) => setTabRootRouteEnabled(1, enabled),
    [setTabRootRouteEnabled]
  );

  const handleProfileRootRouteEnabledChange = React.useCallback(
    (enabled: boolean) => setTabRootRouteEnabled(2, enabled),
    [setTabRootRouteEnabled]
  );

  const shouldShowTabBar = (tabRootRouteEnabledMap[selectedTabIndex] ?? true) && !tabBarForcedHidden;

  React.useEffect(() => {
    const query = database.get<CachedItem>('cached_items').query(Q.where('deleted_at', null));
    query.fetch().then((items) => setCacheBadgeCount(items.length)).catch(() => setCacheBadgeCount(0));
    const sub = query.observe().subscribe((items) => setCacheBadgeCount(items.length));
    return () => sub.unsubscribe();
  }, []);

  React.useEffect(() => {
    const targetY = shouldShowTabBar ? 0 : 90;
    fallbackTranslateY.stopAnimation();
    Animated.timing(fallbackTranslateY, {
      toValue: targetY,
      useNativeDriver: true,
      duration: 300,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [shouldShowTabBar, fallbackTranslateY]);

  const tabSwipeContextValue = React.useMemo(
    () => ({
      setCacheSwipeExclusionRange: (range: SwipeExclusionRange | null) => {
        cacheSwipeExclusionRangeRef.current = range;
      },
      swipeLockRef,
      setPaginationEnabled: (enabled: boolean) => {
        paginationEnabledRef.current = enabled;
      },
      setPagerScrollEnabled: (enabled: boolean) => {
        paginationEnabledRef.current = enabled;
      },
      goToTab: (index: number, options?: { animation?: 'fade' | 'slide'; durationMs?: number }) => switchTabImmediately(index, options?.durationMs),
      setCacheAddActionHandler: (handler: (() => void) | null) => {
        cacheAddActionHandlerRef.current = handler;
      },
      triggerCacheAddAction: () => cacheAddActionHandlerRef.current?.(),
      setTabBarHidden: setTabBarForcedHidden,
      fallbackTranslateY,
    }),
    [fallbackTranslateY, switchTabImmediately]
  );

  return (
    <TabSwipeContext.Provider value={tabSwipeContextValue}>
      <View style={[styles.container, { backgroundColor: theme.screenBg }]}>
        <View style={styles.pager}>
          <Animated.View style={[styles.tabScene, { opacity: tabOpacities[0], zIndex: selectedTabIndex === 0 ? 3 : 1 }]} pointerEvents={selectedTabIndex === 0 ? 'auto' : 'none'}>
            <CardsStack navigationRef={cardsNavigationRef} onSwipeEnabledChange={handleDeckRootRouteEnabledChange} />
          </Animated.View>
          <Animated.View style={[styles.tabScene, { opacity: tabOpacities[1], zIndex: selectedTabIndex === 1 ? 3 : 1 }]} pointerEvents={selectedTabIndex === 1 ? 'auto' : 'none'}>
            <CacheStack onSwipeEnabledChange={handleCacheRootRouteEnabledChange} />
          </Animated.View>
          <Animated.View style={[styles.tabScene, { opacity: tabOpacities[2], zIndex: selectedTabIndex === 2 ? 3 : 1 }]} pointerEvents={selectedTabIndex === 2 ? 'auto' : 'none'}>
            <ProfileStack onSwipeEnabledChange={handleProfileRootRouteEnabledChange} />
          </Animated.View>
        </View>

        <Animated.View pointerEvents={shouldShowTabBar ? 'auto' : 'none'} style={[styles.tabBarAnimatedWrap, { transform: [{ translateY: fallbackTranslateY }] }]}>
          <LiquidTabBar
            selectedTabIndex={selectedTabIndex}
            onSelectTab={(index: number) => {
              if (index === 0 && selectedTabIndex === 0 && cardsNavigationRef.isReady()) {
                cardsNavigationRef.dispatch(StackActions.popToTop());
              } else {
                switchTabImmediately(index);
              }
            }}
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
  container: { flex: 1, backgroundColor: '#02213D' },
  pager: { flex: 1 },
  page: { flex: 1 },
  tabScene: { ...StyleSheet.absoluteFillObject },
  tabBarOuter: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', zIndex: 200 },
  tabBarAnimatedWrap: { position: 'absolute', bottom: -15, left: 0, right: 0, zIndex: 200 },
  rnTabBarWrap: { width: '75%', maxWidth: 360, minWidth: 250, height: TAB_BAR_HEIGHT, paddingHorizontal: TAB_BAR_SIDE_PADDING, borderRadius: TAB_BAR_RADIUS, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.34, shadowRadius: 20, elevation: 16, overflow: 'visible' },
  rnActiveCapsule: { position: 'absolute', left: 0, top: TAB_BAR_VERTICAL_INSET, height: TAB_CAPSULE_HEIGHT, borderRadius: TAB_CAPSULE_RADIUS, borderWidth: 1, shadowColor: '#89CCFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 10, elevation: 6 },
  rnTabButton: { flex: 1, height: TAB_CAPSULE_HEIGHT, borderRadius: TAB_CAPSULE_RADIUS, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  tabIconWrap: { position: 'relative', width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  cacheBadge: { position: 'absolute', top: -6, right: -10, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 999, backgroundColor: '#FF2D55', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  cacheBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', includeFontPadding: false, textAlignVertical: 'center' },
});
