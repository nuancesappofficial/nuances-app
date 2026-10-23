import React from 'react';
import {
  Animated,
  DeviceEventEmitter,
  Easing,
  Linking,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import {
  NavigationContainer,
  NavigationIndependentTree,
  DarkTheme,
  DefaultTheme,
  StackActions,
  createNavigationContainerRef,
} from '@react-navigation/native';
import {
  CardStyleInterpolators,
  TransitionPresets,
  createStackNavigator,
  type StackCardStyleInterpolator,
  type StackNavigationOptions,
} from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
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
import {
  TabSwipeContext,
  type MembershipPaywallTriggerSource,
  type SwipeExclusionRange,
} from '../contexts/TabSwipeContext';
import { database } from '../database';
import type CachedItem from '../database/models/CachedItem';
import { resolveThemeColors } from '../theme/colors';
import { getCurrentSessionUserId } from '../services/auth/userIdentity';
import SubscriptionService from '../services/subscription/SubscriptionService';
import { APP_STORE_REVIEW_URL } from '../constants/legalLinks';
import { useAppTour, TOUR_COMPLETION_GREETING_EVENT } from '../contexts/AppTourContext';
import TutorialHeaderOverlay from '../components/UI/shared/TutorialHeaderOverlay';
import TutorialOverlayMask from '../components/UI/shared/TutorialOverlayMask';
import { getFirstRunTutorialStartTab } from '../features/tour/firstRunJourney';
import {
  parsePaywallDevLink,
  type DevSamplePronunciation,
} from '../features/dev/paywallDevLinks';
import { clearPaywallSeenFlagsLocally } from '../features/subscription/paywallSeenFlags';
import {
  FREE_STARTER_LIMIT,
  type PendingPaywallCard,
  type StarterUsage,
} from '../features/subscription/paywallHero';
import { resolveInitialTabIndex } from './navigationStartTabCore';
import { traceFirstRun } from '../services/logging/firstRunTraceRuntime';

let didHandleInitialPaywallDevLink = false;

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

function getNotificationCacheCount(response: Notifications.NotificationResponse | null | undefined): number {
  const data = response?.notification.request.content.data;
  if (!data || (data.kind !== 'nuances-reminder' && data.kind !== 'nuances-share-receipt')) return 0;
  const rawCount = data.cacheCount;
  const count = typeof rawCount === 'number' ? rawCount : Number(rawCount);
  return Number.isFinite(count) ? count : 0;
}

function getAppNavTheme(
  colorScheme: 'light' | 'dark' | null | undefined,
  theme: ReturnType<typeof resolveThemeColors>
) {
  const isLight = colorScheme === 'light';
  const base = isLight ? DefaultTheme : DarkTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: theme.screenBg,
      card: theme.screenBg,
      text: theme.textOnBg,
      border: theme.borderSubtle,
      primary: ACTIVE_COLOR,
    },
  };
}

const IOS_CARD_SCREEN_OPTIONS: StackNavigationOptions = {
  presentation: 'card',
  gestureEnabled: true,
  gestureResponseDistance: 28,
  ...TransitionPresets.SlideFromRightIOS,
  cardOverlayEnabled: false,
};

const forStationaryRoot: StackCardStyleInterpolator = () => ({
  cardStyle: {
    transform: [{ translateX: 0 }],
  },
});

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

const CacheStack = React.memo(function CacheStack({
  onSwipeEnabledChange,
  navigationRef,
  theme,
  navTheme,
}: {
  onSwipeEnabledChange: (enabled: boolean) => void;
  navigationRef: ReturnType<typeof createNavigationContainerRef<any>>;
  theme: ReturnType<typeof resolveThemeColors>;
  navTheme: ReturnType<typeof getAppNavTheme>;
}) {
  const swipeRestoreTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeRafId1Ref = React.useRef<number | null>(null);
  const swipeRafId2Ref = React.useRef<number | null>(null);

  const cancelSwipeRafs = React.useCallback(() => {
    if (swipeRafId1Ref.current !== null) cancelAnimationFrame(swipeRafId1Ref.current);
    if (swipeRafId2Ref.current !== null) cancelAnimationFrame(swipeRafId2Ref.current);
    swipeRafId1Ref.current = null;
    swipeRafId2Ref.current = null;
  }, []);

  const updateSwipeState = React.useCallback(
    (immediateIfRoot = false) => {
      if (!navigationRef.isReady()) return;
      const state = navigationRef.getRootState();
      const routeName = getActiveRouteName(state);
      const isRootRoute = routeName === 'CacheList' || routeName === null;
      if (swipeRestoreTimerRef.current) {
        clearTimeout(swipeRestoreTimerRef.current);
        swipeRestoreTimerRef.current = null;
      }
      cancelSwipeRafs();

      if (!isRootRoute) {
        onSwipeEnabledChange(false);
      } else if (immediateIfRoot) {
        // Transition physically ended: cushion with 2 RAFs before triggering TabBar translation
        swipeRafId1Ref.current = requestAnimationFrame(() => {
          swipeRafId2Ref.current = requestAnimationFrame(() => {
            onSwipeEnabledChange(true);
          });
        });
      } else {
        // Pop transition started: keep swipe disabled, set 650ms fallback in case transitionEnd doesn't fire
        swipeRestoreTimerRef.current = setTimeout(() => {
          swipeRestoreTimerRef.current = null;
          onSwipeEnabledChange(true);
        }, 650);
      }
    },
    [cancelSwipeRafs, navigationRef, onSwipeEnabledChange]
  );

  React.useEffect(() => {
    return () => {
      if (swipeRestoreTimerRef.current) {
        clearTimeout(swipeRestoreTimerRef.current);
        swipeRestoreTimerRef.current = null;
      }
      cancelSwipeRafs();
    };
  }, [cancelSwipeRafs]);

  return (
    <NavigationIndependentTree>
      <NavigationContainer
        ref={navigationRef}
        theme={navTheme}
        onReady={() => onSwipeEnabledChange(true)}
        onStateChange={() => updateSwipeState(false)}
      >
        <CacheStackNav.Navigator
          screenOptions={{
            headerShown: false,
            gestureEnabled: false,
            cardStyle: { backgroundColor: theme.screenBg },
          }}
          screenListeners={{
            transitionStart: () => updateSwipeState(false),
            transitionEnd: () => updateSwipeState(true),
          }}
        >
          <CacheStackNav.Screen
            name="CacheList"
            component={CacheScreenFlow}
            options={{
              ...IOS_CARD_SCREEN_OPTIONS,
              cardStyleInterpolator:
                Platform.OS === 'android' ? forStationaryRoot : CardStyleInterpolators.forHorizontalIOS,
              gestureEnabled: Platform.OS === 'ios',
            }}
          />
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
            options={IOS_CARD_SCREEN_OPTIONS}
          />
          <CacheStackNav.Screen
            name="CardDetail"
            component={SyncCardDetailFlow}
            options={{
              ...IOS_CARD_SCREEN_OPTIONS,
              gestureEnabled: Platform.OS === 'ios',
            }}
          />
        </CacheStackNav.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
});

const CardsStack = React.memo(function CardsStack({
  onSwipeEnabledChange,
  navigationRef,
  theme,
  navTheme,
}: {
  onSwipeEnabledChange: (enabled: boolean) => void;
  navigationRef: ReturnType<typeof createNavigationContainerRef<any>>;
  theme: ReturnType<typeof resolveThemeColors>;
  navTheme: ReturnType<typeof getAppNavTheme>;
}) {
  const swipeRestoreTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeRafId1Ref = React.useRef<number | null>(null);
  const swipeRafId2Ref = React.useRef<number | null>(null);

  const cancelSwipeRafs = React.useCallback(() => {
    if (swipeRafId1Ref.current !== null) cancelAnimationFrame(swipeRafId1Ref.current);
    if (swipeRafId2Ref.current !== null) cancelAnimationFrame(swipeRafId2Ref.current);
    swipeRafId1Ref.current = null;
    swipeRafId2Ref.current = null;
  }, []);

  const updateSwipeState = React.useCallback(
    (immediateIfRoot = false) => {
      if (!navigationRef.isReady()) return;
      const state = navigationRef.getRootState();
      const routeName = getActiveRouteName(state);
      const isRootRoute = routeName === 'CardsList' || routeName === 'Deck' || routeName === null;
      if (swipeRestoreTimerRef.current) {
        clearTimeout(swipeRestoreTimerRef.current);
        swipeRestoreTimerRef.current = null;
      }
      cancelSwipeRafs();

      if (!isRootRoute) {
        onSwipeEnabledChange(false);
      } else if (immediateIfRoot) {
        // Transition physically ended: cushion with 2 RAFs before triggering TabBar translation
        swipeRafId1Ref.current = requestAnimationFrame(() => {
          swipeRafId2Ref.current = requestAnimationFrame(() => {
            onSwipeEnabledChange(true);
          });
        });
      } else {
        // Pop transition started: keep swipe disabled, set 650ms fallback in case transitionEnd doesn't fire
        swipeRestoreTimerRef.current = setTimeout(() => {
          swipeRestoreTimerRef.current = null;
          onSwipeEnabledChange(true);
        }, 650);
      }
    },
    [cancelSwipeRafs, navigationRef, onSwipeEnabledChange]
  );

  React.useEffect(() => {
    return () => {
      if (swipeRestoreTimerRef.current) {
        clearTimeout(swipeRestoreTimerRef.current);
        swipeRestoreTimerRef.current = null;
      }
      cancelSwipeRafs();
    };
  }, [cancelSwipeRafs]);

  return (
    <NavigationIndependentTree>
      <NavigationContainer
        ref={navigationRef}
        theme={navTheme}
        onReady={() => onSwipeEnabledChange(true)}
        onStateChange={() => updateSwipeState(false)}
      >
        <CardsStackNav.Navigator
          screenOptions={{
            headerShown: false,
            gestureEnabled: Platform.OS === 'ios',
            cardStyle: { backgroundColor: theme.screenBg },
          }}
          screenListeners={{
            transitionStart: () => updateSwipeState(false),
            transitionEnd: () => updateSwipeState(true),
          }}
        >
          <CardsStackNav.Screen
            name="CardsList"
            component={DeckMainFlow}
            options={{
              ...IOS_CARD_SCREEN_OPTIONS,
              gestureEnabled: Platform.OS === 'ios',
            }}
          />
          <CardsStackNav.Screen
            name="Deck"
            component={DeckMainFlow}
            options={{
              ...IOS_CARD_SCREEN_OPTIONS,
              gestureEnabled: Platform.OS === 'ios',
            }}
          />
          <CardsStackNav.Screen
            name="AlbumView"
            component={SyncAlbumViewFlow}
            options={{
              ...IOS_CARD_SCREEN_OPTIONS,
              gestureEnabled: Platform.OS === 'ios',
            }}
          />
          <CardsStackNav.Screen
            name="CardDetail"
            component={SyncCardDetailFlow}
            options={{
              ...IOS_CARD_SCREEN_OPTIONS,
              gestureEnabled: Platform.OS === 'ios',
            }}
          />
          <CardsStackNav.Screen
            name="DayView"
            component={SyncDayViewFlow}
            options={{
              ...IOS_CARD_SCREEN_OPTIONS,
              gestureEnabled: Platform.OS === 'ios',
            }}
          />
          <CardsStackNav.Screen
            name="CardReview"
            component={SyncReviewFlow}
            options={{
              ...IOS_CARD_SCREEN_OPTIONS,
              gestureEnabled: Platform.OS === 'ios',
            }}
          />
        </CardsStackNav.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
});

const ProfileStack = React.memo(function ProfileStack({
  onSwipeEnabledChange,
  navigationRef,
  onReplayVideoTutorial,
  onDevAccountDelete,
  theme,
  navTheme,
}: {
  onSwipeEnabledChange: (enabled: boolean) => void;
  navigationRef: ReturnType<typeof createNavigationContainerRef<any>>;
  onReplayVideoTutorial: () => void;
  onDevAccountDelete?: () => Promise<void>;
  theme: ReturnType<typeof resolveThemeColors>;
  navTheme: ReturnType<typeof getAppNavTheme>;
}) {
  const swipeRestoreTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeRafId1Ref = React.useRef<number | null>(null);
  const swipeRafId2Ref = React.useRef<number | null>(null);

  const cancelSwipeRafs = React.useCallback(() => {
    if (swipeRafId1Ref.current !== null) cancelAnimationFrame(swipeRafId1Ref.current);
    if (swipeRafId2Ref.current !== null) cancelAnimationFrame(swipeRafId2Ref.current);
    swipeRafId1Ref.current = null;
    swipeRafId2Ref.current = null;
  }, []);

  const updateSwipeState = React.useCallback(
    (immediateIfRoot = false) => {
      if (!navigationRef.isReady()) return;
      const state = navigationRef.getRootState();
      const routeName = getActiveRouteName(state);
      const isRootRoute = routeName === 'ProfileHome' || routeName === null;
      if (swipeRestoreTimerRef.current) {
        clearTimeout(swipeRestoreTimerRef.current);
        swipeRestoreTimerRef.current = null;
      }
      cancelSwipeRafs();

      if (!isRootRoute) {
        onSwipeEnabledChange(false);
      } else if (immediateIfRoot) {
        // Transition physically ended: cushion with 2 RAFs before triggering TabBar translation
        swipeRafId1Ref.current = requestAnimationFrame(() => {
          swipeRafId2Ref.current = requestAnimationFrame(() => {
            onSwipeEnabledChange(true);
          });
        });
      } else {
        // Pop transition started: keep swipe disabled, set 650ms fallback in case transitionEnd doesn't fire
        swipeRestoreTimerRef.current = setTimeout(() => {
          swipeRestoreTimerRef.current = null;
          onSwipeEnabledChange(true);
        }, 650);
      }
    },
    [cancelSwipeRafs, navigationRef, onSwipeEnabledChange]
  );

  React.useEffect(() => {
    return () => {
      if (swipeRestoreTimerRef.current) {
        clearTimeout(swipeRestoreTimerRef.current);
        swipeRestoreTimerRef.current = null;
      }
      cancelSwipeRafs();
    };
  }, [cancelSwipeRafs]);

  const renderProfileHome = React.useCallback(
    (props: any) => (
      <ProfileMainFlow
        {...props}
        onReplayVideoTutorial={onReplayVideoTutorial}
        onDevAccountDelete={onDevAccountDelete}
      />
    ),
    [onReplayVideoTutorial, onDevAccountDelete]
  );

  return (
    <NavigationIndependentTree>
      <NavigationContainer
        ref={navigationRef}
        theme={navTheme}
        onReady={() => onSwipeEnabledChange(true)}
        onStateChange={() => updateSwipeState(false)}
      >
        <ProfileStackNav.Navigator
          screenOptions={{
            headerShown: false,
            gestureEnabled: false,
            cardStyle: { backgroundColor: theme.screenBg },
          }}
          screenListeners={{
            transitionStart: () => updateSwipeState(false),
            transitionEnd: () => updateSwipeState(true),
          }}
        >
          <ProfileStackNav.Screen name="ProfileHome">
            {renderProfileHome}
          </ProfileStackNav.Screen>
          <ProfileStackNav.Screen name="ProfileSettings" component={SyncProfileSettingsFlow} options={IOS_CARD_SCREEN_OPTIONS} />
          <ProfileStackNav.Screen name="ProfileSettingOptions" component={SyncProfileSettingOptionsFlow} options={IOS_CARD_SCREEN_OPTIONS} />
          <ProfileStackNav.Screen name="CardDetail" component={SyncCardDetailFlow} options={{ presentation: 'card', gestureEnabled: true, gestureResponseDistance: 28 }} />
        </ProfileStackNav.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
});

type RootNavigatorProps = {
  isExpoGo?: boolean;
  onReplayVideoTutorial?: () => void;
  startTutorialOnMount?: boolean;
  onTutorialStarted?: () => void;
  onDevAccountDelete?: () => Promise<void>;
  initialTabIndex?: number;
};

const LiquidTabBar = React.memo(function LiquidTabBar({
  selectedTabIndex,
  onSelectTab,
  cacheBadgeCount,
  navBg,
  navBorder,
  navIconActive,
  navIconInactive,
  navCapsuleBg,
  navCapsuleBorder,
}: any) {
  const insets = useSafeAreaInsets();
  // iOS 的外框往下推了 15pt 來貼近 Home 條；沒有 Home 條的手機（iPhone SE，底部安全區域是 0）
  // 要補回這 15pt，否則 nav bar 會有一截掉到螢幕外。
  const bottomInset =
    insets.bottom > 0 ? insets.bottom : Platform.OS === 'ios' ? 8 + 15 : 8;
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
    if (duration === 0) {
      activeTranslateX.setValue(capsuleBaseX + slotWidth * index);
      iconOpacities.forEach((anim, i) => anim.setValue(i === index ? 1 : 0));
      return;
    }
    Animated.parallel([
      Animated.timing(activeTranslateX, { toValue: capsuleBaseX + slotWidth * index, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ...iconOpacities.map((anim, i) => Animated.timing(anim, { toValue: i === index ? 1 : 0, duration, easing: Easing.out(Easing.quad), useNativeDriver: true })),
    ]).start();
  }, [activeTranslateX, capsuleBaseX, slotWidth, iconOpacities]);

  const prevSelectedIndexRef = React.useRef(selectedTabIndex);

  React.useEffect(() => {
    setOptimisticSelectedIndex(selectedTabIndex);
    if (prevSelectedIndexRef.current !== selectedTabIndex) {
      prevSelectedIndexRef.current = selectedTabIndex;
      animateCapsuleToIndex(selectedTabIndex);
    }
  }, [animateCapsuleToIndex, selectedTabIndex]);

  const handleTabPressIn = React.useCallback((index: number) => {
    prevSelectedIndexRef.current = index;
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
});

export default function RootNavigator({
  isExpoGo: _isExpoGo,
  onReplayVideoTutorial,
  startTutorialOnMount = false,
  onTutorialStarted,
  onDevAccountDelete,
  initialTabIndex: initialTabIndexProp,
}: RootNavigatorProps) {
  const appTour = useAppTour();
  const appTourRef = React.useRef(appTour);
  React.useEffect(() => {
    appTourRef.current = appTour;
  }, [appTour]);

  const didStartRequestedTutorialRef = React.useRef(false);
  const colorScheme = useColorScheme();
  const theme = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const navTheme = React.useMemo(() => getAppNavTheme(colorScheme, theme), [colorScheme, theme]);
  const cardsNavigationRef = React.useMemo(() => createNavigationContainerRef<any>(), []);
  const cacheNavigationRef = React.useMemo(() => createNavigationContainerRef<any>(), []);
  const profileNavigationRef = React.useMemo(() => createNavigationContainerRef<any>(), []);

  const cacheSwipeExclusionRangeRef = React.useRef<SwipeExclusionRange | null>(null);
  const swipeLockRef = React.useRef(false);
  const paginationEnabledRef = React.useRef(true);
  const initialTabIndex = resolveInitialTabIndex({
    startTutorialOnMount,
    initialTabIndexProp,
  });
  const [selectedTabIndex, setSelectedTabIndex] = React.useState(initialTabIndex);
  const [settledTabIndex, setSettledTabIndex] = React.useState(initialTabIndex);
  const selectedTabIndexRef = React.useRef(initialTabIndex);
  const [cacheBadgeCount, setCacheBadgeCount] = React.useState(0);
  const [tabRootRouteEnabledMap, setTabRootRouteEnabledMap] = React.useState<Record<number, boolean>>({ 0: true, 1: true, 2: true });
  const [tabBarForcedHidden, setTabBarForcedHidden] = React.useState(false);

  const cacheAddActionHandlerRef = React.useRef<(() => void) | null>(null);
  const fallbackTranslateY = React.useRef(new Animated.Value(0)).current;

  const tabOpacities = React.useRef(
    initialTabIndex === 1
      ? [new Animated.Value(0), new Animated.Value(1), new Animated.Value(0)]
      : initialTabIndex === 2
      ? [new Animated.Value(0), new Animated.Value(0), new Animated.Value(1)]
      : [new Animated.Value(1), new Animated.Value(0), new Animated.Value(0)]
  ).current;

  React.useEffect(() => {
    selectedTabIndexRef.current = selectedTabIndex;
  }, [selectedTabIndex]);

  const switchTabImmediately = React.useCallback(
    (index: number, duration = 180) => {
      const nextIndex = Math.min(MAIN_TAB_ORDER.length - 1, Math.max(0, index));
      const fromIndex = selectedTabIndexRef.current;
      if (nextIndex === fromIndex) return;

      selectedTabIndexRef.current = nextIndex;
      setSelectedTabIndex(nextIndex);

      if (duration === 0) {
        [0, 1, 2].forEach((i) => {
          tabOpacities[i].stopAnimation();
          tabOpacities[i].setValue(i === nextIndex ? 1 : 0);
        });
        setSettledTabIndex(nextIndex);
        return;
      }

      // Do NOT call stopAnimation() or setValue() here!
      // Animated.timing with useNativeDriver: true automatically hijacks the in-flight
      // native UI-thread value seamlessly without any 1-frame JS/UI sync glitch.
      Animated.parallel(
        [0, 1, 2].map((i) =>
          Animated.timing(tabOpacities[i], {
            toValue: i === nextIndex ? 1 : 0,
            duration,
            easing:
              i === nextIndex
                ? Easing.out(Easing.quad)
                : Easing.in(Easing.cubic),
            useNativeDriver: true,
          })
        )
      ).start(({ finished }) => {
        if (finished && selectedTabIndexRef.current === nextIndex) {
          setSettledTabIndex(nextIndex);
        }
      });
    },
    [tabOpacities]
  );

  const handleProfileReplayTutorial = React.useCallback(() => {
    switchTabImmediately(1);
    if (!appTourRef.current.isActive) {
      appTourRef.current.startTour('replay');
    }
  }, [switchTabImmediately]);

  const onTutorialStartedRef = React.useRef(onTutorialStarted);
  React.useEffect(() => {
    onTutorialStartedRef.current = onTutorialStarted;
  }, [onTutorialStarted]);

  React.useEffect(() => {
    if (!startTutorialOnMount || didStartRequestedTutorialRef.current) return;
    didStartRequestedTutorialRef.current = true;
    const tutorialTab = getFirstRunTutorialStartTab({ stage: 'tutorial' });
    switchTabImmediately(tutorialTab === 'cache' ? 1 : 0, 0);
    traceFirstRun('tutorial', 'start_requested', {
      startTab: tutorialTab,
    });
    console.log(
      `[FirstRunTrace] tutorial.switch_tab target=${tutorialTab === 'cache' ? 1 : 0} selectedTabIndex=${selectedTabIndexRef.current}`
    );

    if (!appTour.isActive) {
      appTour.startTour('first_run');
    }
    traceFirstRun('tutorial', 'started', { startTab: tutorialTab });
    onTutorialStartedRef.current?.();
    console.log(
      `[FirstRunTrace] tutorial.started step=${appTour.step} selectedTabIndex=${selectedTabIndexRef.current}`
    );
  }, [
    appTour,
    startTutorialOnMount,
    switchTabImmediately,
  ]);

  const openMembershipPaywall = React.useCallback((options?:
    | {
        returnTo?: 'settings' | 'create-card';
        source?: 'settings' | 'create_card' | 'review' | 'card_detail' | 'unknown';
        tier?: 'lite' | 'pro';
        triggerSource?: MembershipPaywallTriggerSource;
        devStarterUsage?: Partial<StarterUsage>;
        devSampleIntroCards?: boolean;
        devSamplePronunciation?: DevSamplePronunciation;
        pendingCard?: PendingPaywallCard;
      }
    | 'lite'
    | 'pro') => {
    const normalizedOptions =
      typeof options === 'string' ? { tier: options } : options;
    if (SubscriptionService.isPremiumBypassEnabled()) {
      traceFirstRun('paywall', 'suppressed_by_dev_bypass', {
        source: normalizedOptions?.source ?? 'unknown',
      });
      console.log('[Membership] Premium bypass active; paywall suppressed.');
      return;
    }

    traceFirstRun('paywall', 'open_requested', {
      source: normalizedOptions?.source ?? 'unknown',
      returnTo: normalizedOptions?.returnTo ?? 'settings',
    });

    setTabBarForcedHidden(false);
    switchTabImmediately(2);

    let attempts = 0;
    const navigateToMembership = () => {
      if (!profileNavigationRef.isReady()) {
        attempts += 1;
        if (attempts > 20) {
          traceFirstRun('paywall', 'navigation_failed', { attempts });
          return;
        }
        requestAnimationFrame(navigateToMembership);
        return;
      }
      profileNavigationRef.navigate('ProfileSettingOptions', {
        kind: 'membership',
        returnTo: normalizedOptions?.returnTo ?? 'settings',
        source: normalizedOptions?.source ?? 'unknown',
        tier: normalizedOptions?.tier,
        initialTab: normalizedOptions?.tier,
        triggerSource: normalizedOptions?.triggerSource ?? 'user_initiated',
        devStarterUsage: normalizedOptions?.devStarterUsage,
        devSampleIntroCards: normalizedOptions?.devSampleIntroCards,
        devSamplePronunciation: normalizedOptions?.devSamplePronunciation,
        pendingCard: normalizedOptions?.pendingCard,
      });
      traceFirstRun('paywall', 'screen_navigated', {
        source: normalizedOptions?.source ?? 'unknown',
      });
    };

    setTimeout(navigateToMembership, 280);
  }, [profileNavigationRef, switchTabImmediately]);

  React.useEffect(() => {
    if (!__DEV__) return undefined;

    const openPaywallFromDevLink = (url: string) => {
      const devLink = parsePaywallDevLink(url);
      if (!devLink) return;
      // kind（截圖卡）保留給之後的切片。
      console.log('[Membership] Dev paywall link:', devLink);
      if (devLink.kind === 'reset') {
        void getCurrentSessionUserId()
          .then((userId) => clearPaywallSeenFlagsLocally(userId))
          .then(() =>
            console.log('[Membership] Paywall results intro and exit screen reset.')
          )
          .catch((error) =>
            console.warn('[Membership] Paywall reset failed:', error)
          );
        return;
      }
      if (devLink.kind === 'paywall-21') {
        openMembershipPaywall({
          returnTo: 'create-card',
          source: 'create_card',
          triggerSource: 'lite_card_cap',
          devStarterUsage: { cardsUsed: FREE_STARTER_LIMIT },
          devSampleIntroCards: true,
          devSamplePronunciation: devLink.pronunciation,
          pendingCard: { word: devLink.word, sourceLabel: devLink.sourceLabel },
        });
        return;
      }
      openMembershipPaywall({
        returnTo: 'settings',
        source: 'settings',
        triggerSource: 'user_initiated',
        devStarterUsage: {
          cardsUsed: devLink.cardsUsed,
          pronunciationUsed: devLink.pronunciationUsed,
        },
      });
    };

    const subscription = Linking.addEventListener('url', ({ url }) =>
      openPaywallFromDevLink(url)
    );
    // RootNavigator 會隨帳號重新掛載；冷啟動網址只處理一次，避免換帳號後又跳 paywall。
    if (!didHandleInitialPaywallDevLink) {
      didHandleInitialPaywallDevLink = true;
      Linking.getInitialURL()
        .then((url) => {
          if (url) openPaywallFromDevLink(url);
        })
        .catch(() => undefined);
    }

    return () => {
      subscription.remove();
    };
  }, [openMembershipPaywall]);

  const resetCacheStackToRoot = React.useCallback(() => {
    if (!cacheNavigationRef.isReady()) return;
    if (!cacheNavigationRef.canGoBack()) return;
    cacheNavigationRef.dispatch(StackActions.popToTop());
  }, [cacheNavigationRef]);

  const routeToCacheRoot = React.useCallback(() => {
    setTabBarForcedHidden(false);
    switchTabImmediately(1);

    let attempts = 0;
    const popCacheRootWhenReady = () => {
      if (!cacheNavigationRef.isReady()) {
        attempts += 1;
        if (attempts > 20) return;
        requestAnimationFrame(popCacheRootWhenReady);
        return;
      }
      resetCacheStackToRoot();
    };

    setTimeout(popCacheRootWhenReady, 280);
  }, [cacheNavigationRef, resetCacheStackToRoot, switchTabImmediately]);

  const routeToDeckRoot = React.useCallback(() => {
    setTabBarForcedHidden(false);
    switchTabImmediately(0);

    let attempts = 0;
    const popDeckRootWhenReady = () => {
      if (!cardsNavigationRef.isReady()) {
        attempts += 1;
        if (attempts > 20) return;
        requestAnimationFrame(popDeckRootWhenReady);
        return;
      }
      if (cardsNavigationRef.canGoBack()) {
        cardsNavigationRef.dispatch(StackActions.popToTop());
      }
    };

    setTimeout(popDeckRootWhenReady, 280);
  }, [cardsNavigationRef, switchTabImmediately]);

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      TOUR_COMPLETION_GREETING_EVENT,
      () => {
        resetCacheStackToRoot();
        routeToDeckRoot();
      }
    );
    return () => sub.remove();
  }, [resetCacheStackToRoot, routeToDeckRoot]);

  const handledNotificationResponseIdRef = React.useRef<string | null>(null);

  const handleReminderNotificationResponse = React.useCallback(
    (response: Notifications.NotificationResponse | null | undefined) => {
      const requestId = response?.notification.request.identifier;
      if (!requestId || handledNotificationResponseIdRef.current === requestId) return;
      const data = response?.notification.request.content.data;
      if (data?.kind === 'nuances-tip') {
        handledNotificationResponseIdRef.current = requestId;
        if (data.target === 'cache') {
          routeToCacheRoot();
        } else if (data.target === 'deck') {
          routeToDeckRoot();
        } else if (data.target === 'rate') {
          void Linking.openURL(APP_STORE_REVIEW_URL).catch((error) => {
            console.warn('[Tips] failed to open App Store review:', error);
          });
        }
        try {
          Notifications.clearLastNotificationResponse();
        } catch {
          // Some runtimes may not expose the native clear hook yet.
        }
        return;
      }
      if (data?.kind === 'nuances-reminder' && data.target === 'cache') {
        handledNotificationResponseIdRef.current = requestId;
        routeToCacheRoot();
        try {
          Notifications.clearLastNotificationResponse();
        } catch {
          // Some runtimes may not expose the native clear hook yet.
        }
        return;
      }
      if (data?.kind === 'nuances-reminder' && data.target === 'deck') {
        handledNotificationResponseIdRef.current = requestId;
        routeToDeckRoot();
        try {
          Notifications.clearLastNotificationResponse();
        } catch {
          // Some runtimes may not expose the native clear hook yet.
        }
        return;
      }
      if (getNotificationCacheCount(response) <= 0) return;

      handledNotificationResponseIdRef.current = requestId;
      routeToCacheRoot();
      try {
        Notifications.clearLastNotificationResponse();
      } catch {
        // Some runtimes may not expose the native clear hook yet.
      }
    },
    [routeToCacheRoot, routeToDeckRoot]
  );

  React.useEffect(() => {
    try {
      handleReminderNotificationResponse(Notifications.getLastNotificationResponse());
    } catch {
      // Native notifications may be unavailable in tests or unsupported runtimes.
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleReminderNotificationResponse(response);
    });

    return () => {
      subscription.remove();
    };
  }, [handleReminderNotificationResponse]);

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

  const didCheckInitialCacheTabRef = React.useRef(false);

  React.useEffect(() => {
    let unsubscribed = false;
    let subscription: { unsubscribe: () => void } | null = null;

    void (async () => {
      try {
        const userId = await getCurrentSessionUserId();
        if (!userId || unsubscribed) {
          setCacheBadgeCount(0);
          return;
        }
        const query = database
          .get<CachedItem>('cached_items')
          .query(Q.where('user_id', userId), Q.where('deleted_at', null));
        const count = await query.fetchCount();
        if (unsubscribed) return;
        setCacheBadgeCount(count);

        // If cold start has cache items and not in interactive tutorial, start on Cache tab
        if (!didCheckInitialCacheTabRef.current) {
          didCheckInitialCacheTabRef.current = true;
          if (count > 0 && !startTutorialOnMount && selectedTabIndexRef.current === 0) {
            switchTabImmediately(1, 0);
          }
        }

        subscription = query.observeCount().subscribe((nextCount) => setCacheBadgeCount(nextCount));
      } catch {
        if (!unsubscribed) {
          setCacheBadgeCount(0);
        }
      }
    })();

    return () => {
      unsubscribed = true;
      subscription?.unsubscribe();
    };
  }, [startTutorialOnMount, switchTabImmediately]);

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

  const handleSelectTab = React.useCallback(
    (index: number) => {
      if (
        index === 0 &&
        selectedTabIndexRef.current === 0 &&
        cardsNavigationRef.isReady() &&
        cardsNavigationRef.canGoBack()
      ) {
        cardsNavigationRef.dispatch(StackActions.popToTop());
      } else if (index === 1) {
        if (selectedTabIndexRef.current === 1 && cacheNavigationRef.isReady() && cacheNavigationRef.canGoBack()) {
          resetCacheStackToRoot();
        } else {
          switchTabImmediately(index);
        }
      } else {
        switchTabImmediately(index);
      }
    },
    [cardsNavigationRef, cacheNavigationRef, resetCacheStackToRoot, switchTabImmediately]
  );

  const isCacheSettledActive = settledTabIndex === 1;

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
      openMembershipPaywall,
      setCacheAddActionHandler: (handler: (() => void) | null) => {
        cacheAddActionHandlerRef.current = handler;
      },
      triggerCacheAddAction: () => cacheAddActionHandlerRef.current?.(),
      setTabBarHidden: setTabBarForcedHidden,
      fallbackTranslateY,
      isCacheTabActive: isCacheSettledActive,
    }),
    [fallbackTranslateY, isCacheSettledActive, openMembershipPaywall, switchTabImmediately]
  );

  return (
    <TabSwipeContext.Provider value={tabSwipeContextValue}>
      <View style={[styles.container, { backgroundColor: theme.screenBg }]}>
        <View style={styles.pager}>
          <Animated.View
            collapsable={false}
            style={[
              styles.tabScene,
              {
                opacity: tabOpacities[0],
              },
            ]}
            pointerEvents={selectedTabIndex === 0 ? 'auto' : 'none'}
          >
            <CardsStack
              theme={theme}
              navTheme={navTheme}
              navigationRef={cardsNavigationRef}
              onSwipeEnabledChange={handleDeckRootRouteEnabledChange}
            />
          </Animated.View>
          <Animated.View
            collapsable={false}
            style={[
              styles.tabScene,
              {
                opacity: tabOpacities[1],
              },
            ]}
            pointerEvents={selectedTabIndex === 1 ? 'auto' : 'none'}
          >
            <CacheStack
              theme={theme}
              navTheme={navTheme}
              navigationRef={cacheNavigationRef}
              onSwipeEnabledChange={handleCacheRootRouteEnabledChange}
            />
          </Animated.View>
          <Animated.View
            collapsable={false}
            style={[
              styles.tabScene,
              {
                opacity: tabOpacities[2],
              },
            ]}
            pointerEvents={selectedTabIndex === 2 ? 'auto' : 'none'}
          >
            <ProfileStack
              theme={theme}
              navTheme={navTheme}
              navigationRef={profileNavigationRef}
              onSwipeEnabledChange={handleProfileRootRouteEnabledChange}
              onReplayVideoTutorial={handleProfileReplayTutorial}
              onDevAccountDelete={onDevAccountDelete}
            />
          </Animated.View>
        </View>

        <Animated.View pointerEvents={shouldShowTabBar ? 'auto' : 'none'} style={[styles.tabBarAnimatedWrap, { transform: [{ translateY: fallbackTranslateY }] }]}>
          <LiquidTabBar
            selectedTabIndex={selectedTabIndex}
            onSelectTab={handleSelectTab}
            cacheBadgeCount={cacheBadgeCount}
            navBg={theme.navBg}
            navBorder={theme.navBorder}
            navIconActive={theme.navActive}
            navIconInactive={theme.navInactive}
            navCapsuleBg={theme.navCapsuleBg}
            navCapsuleBorder={theme.navCapsuleBorder}
          />
        </Animated.View>
        <TutorialOverlayMask />
        <TutorialHeaderOverlay />
      </View>
    </TabSwipeContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02213D' },
  pager: { flex: 1, overflow: 'hidden' },
  page: { flex: 1 },
  tabScene: { ...StyleSheet.absoluteFillObject },
  tabBarOuter: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', zIndex: 200 },
  tabBarAnimatedWrap: { position: 'absolute', bottom: Platform.OS === 'android' ? 0 : -15, left: 0, right: 0, zIndex: 200 },
  rnTabBarWrap: { width: '75%', maxWidth: 360, minWidth: 250, height: TAB_BAR_HEIGHT, paddingHorizontal: TAB_BAR_SIDE_PADDING, borderRadius: TAB_BAR_RADIUS, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.34, shadowRadius: 20, elevation: 16, overflow: 'visible' },
  rnActiveCapsule: { position: 'absolute', left: 0, top: TAB_BAR_VERTICAL_INSET, height: TAB_CAPSULE_HEIGHT, borderRadius: TAB_CAPSULE_RADIUS, borderWidth: 1, shadowColor: '#89CCFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 10, elevation: 6 },
  rnTabButton: { flex: 1, height: TAB_CAPSULE_HEIGHT, borderRadius: TAB_CAPSULE_RADIUS, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  tabIconWrap: { position: 'relative', width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  cacheBadge: { position: 'absolute', top: -6, right: -10, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 999, backgroundColor: '#FF2D55', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  cacheBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', includeFontPadding: false, textAlignVertical: 'center' },
});
