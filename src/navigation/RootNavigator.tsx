import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
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

const RootStack = createNativeStackNavigator();
const VAULT_SPRING = {
  damping: 34,
  stiffness: 180,
  mass: 1,
  overshootClamping: true,
  restDisplacementThreshold: 0.4,
  restSpeedThreshold: 0.4,
};
const PROFILE_SPRING = {
  damping: 34,
  stiffness: 210,
  mass: 0.96,
  overshootClamping: true,
  restDisplacementThreshold: 0.4,
  restSpeedThreshold: 0.4,
};

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

type RootNavigatorProps = {
  isExpoGo?: boolean;
};

export default function RootNavigator({ isExpoGo: _isExpoGo }: RootNavigatorProps) {
  const { height: windowHeight } = useWindowDimensions();
  const cacheSwipeExclusionRangeRef = React.useRef<SwipeExclusionRange | null>(null);
  const cacheAddActionHandlerRef = React.useRef<(() => void) | null>(null);
  const deckNavigationRef = React.useRef<any>(null);
  const swipeLockRef = React.useRef(false);
  const [isProfileOverlayVisible, setIsProfileOverlayVisible] = React.useState(false);
  const [isCacheOverlayVisible, setIsCacheOverlayVisible] = React.useState(false);
  const [cacheOverlayEntryToken, setCacheOverlayEntryToken] = React.useState(0);
  const cacheVaultProgress = useSharedValue(0);
  const cacheDragY = useSharedValue(0);
  const profileOverlayProgress = useSharedValue(0);

  const setCacheSwipeExclusionRange = React.useCallback((range: SwipeExclusionRange | null) => {
    cacheSwipeExclusionRangeRef.current = range;
  }, []);

  const setPaginationEnabled = React.useCallback((_enabled: boolean) => {}, []);
  const setPagerScrollEnabled = React.useCallback((_enabled: boolean) => {}, []);
  const goToTab = React.useCallback((_index: number) => {}, []);

  const setCacheAddActionHandler = React.useCallback((handler: (() => void) | null) => {
    cacheAddActionHandlerRef.current = handler;
  }, []);

  const openProfileOverlay = React.useCallback(() => {
    setIsProfileOverlayVisible(true);
    profileOverlayProgress.value = 0;
    profileOverlayProgress.value = withSpring(1, PROFILE_SPRING);
  }, [profileOverlayProgress]);

  const closeProfileOverlay = React.useCallback(() => {
    profileOverlayProgress.value = withSpring(0, PROFILE_SPRING, (finished) => {
      if (!finished) return;
      runOnJS(setIsProfileOverlayVisible)(false);
    });
  }, [profileOverlayProgress]);

  const openCacheVault = React.useCallback(() => {
    closeProfileOverlay();
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.warn('[CacheVault] haptic trigger failed:', error);
    }
    cacheDragY.value = 0;
    setCacheOverlayEntryToken((prev) => prev + 1);
    setIsCacheOverlayVisible(true);
    cacheVaultProgress.value = withSpring(1, VAULT_SPRING);
  }, [cacheDragY, cacheVaultProgress, closeProfileOverlay]);

  const closeCacheVault = React.useCallback(() => {
    cacheVaultProgress.value = withSpring(0, VAULT_SPRING, (finished) => {
      if (!finished) return;
      runOnJS(setIsCacheOverlayVisible)(false);
    });
  }, [cacheVaultProgress]);

  const cacheOverlayNavigation = React.useMemo(
    () => ({
      navigate: (...args: any[]) => {
        closeCacheVault();
        const nav = deckNavigationRef.current;
        requestAnimationFrame(() => {
          nav?.navigate?.(...args);
        });
      },
      canGoBack: () => true,
      goBack: () => {
        closeCacheVault();
      },
    }),
    [closeCacheVault]
  );

  const profileOverlayNavigation = React.useMemo(
    () => ({
      navigate: (...args: any[]) => {
        closeProfileOverlay();
        const nav = deckNavigationRef.current;
        requestAnimationFrame(() => {
          nav?.navigate?.(...args);
        });
      },
      canGoBack: () => true,
      goBack: () => {
        closeProfileOverlay();
      },
    }),
    [closeProfileOverlay]
  );

  const cacheDismissGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(10)
        .failOffsetX([-16, 16])
        .onUpdate((event) => {
          if (event.translationY <= 0) return;
          cacheDragY.value = event.translationY;
        })
        .onEnd((event) => {
          const shouldClose = event.translationY > 150 || event.velocityY > 1000;
          if (shouldClose) {
            cacheDragY.value = 0;
            runOnJS(closeCacheVault)();
            return;
          }
          cacheDragY.value = withSpring(0, VAULT_SPRING);
        }),
    [cacheDragY, closeCacheVault]
  );

  const hubAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(cacheVaultProgress.value, [0, 1], [1, 0.92]);
    return {
      transform: [{ scale }],
    };
  });

  const cacheDimAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(cacheVaultProgress.value, [0, 1], [0, 0.42]),
    };
  });

  const cachePanelAnimatedStyle = useAnimatedStyle(() => {
    const baseTranslateY = interpolate(cacheVaultProgress.value, [0, 1], [windowHeight, 0]);
    return {
      transform: [{ translateY: baseTranslateY + cacheDragY.value }],
    };
  }, [windowHeight]);

  const profileOverlayRootStyle = useAnimatedStyle(() => {
    return {
      opacity: profileOverlayProgress.value,
    };
  });

  const profileOverlayContentStyle = useAnimatedStyle(() => {
    const translateY = interpolate(profileOverlayProgress.value, [0, 1], [20, 0]);
    const scale = interpolate(profileOverlayProgress.value, [0, 1], [0.985, 1]);
    return {
      opacity: profileOverlayProgress.value,
      transform: [{ translateY }, { scale }],
    };
  });

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
        <Animated.View style={[styles.hubLayer, hubAnimatedStyle]}>
          <NavigationContainer theme={APP_DARK_THEME}>
            <RootStack.Navigator initialRouteName="Deck" screenOptions={{ headerShown: false }}>
              <RootStack.Screen name="Deck">
                {(props) => {
                  deckNavigationRef.current = props.navigation;
                  return (
                    <DeckMainFlow
                      {...props}
                      onPressAvatar={openProfileOverlay}
                      onPressCacheFab={openCacheVault}
                    />
                  );
                }}
              </RootStack.Screen>
              <RootStack.Screen
                name="AlbumView"
                component={AlbumViewFlow}
                options={{
                  presentation: 'card',
                  animation: 'simple_push',
                  animationDuration: 520,
                }}
              />
              <RootStack.Screen name="CardDetail" component={CardDetailFlow} options={{ presentation: 'card' }} />
              <RootStack.Screen name="DayView" component={DayViewFlow} options={{ presentation: 'card' }} />
              <RootStack.Screen name="CardReview" component={ReviewFlow} options={{ presentation: 'card' }} />
              <RootStack.Screen name="Profile" component={ProfileMainFlow} />
              <RootStack.Screen name="CacheList" component={CacheScreenFlow} />
              <RootStack.Screen
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
              <RootStack.Screen
                name="CreateCard"
                component={CreateCardFlow}
                options={{ presentation: 'modal' }}
              />
            </RootStack.Navigator>
          </NavigationContainer>
        </Animated.View>

        <View style={styles.cacheOverlayRoot} pointerEvents={isCacheOverlayVisible ? 'auto' : 'none'}>
            <Animated.View style={[styles.cacheDim, cacheDimAnimatedStyle]} />

            <Animated.View style={[styles.cacheVaultWrap, cachePanelAnimatedStyle]}>
              <View style={styles.cacheVaultHandleBarWrap}>
                <GestureDetector gesture={cacheDismissGesture}>
                  <View style={styles.cacheVaultHandleBarHitbox}>
                    <View style={styles.cacheVaultHandleBar} />
                  </View>
                </GestureDetector>
              </View>

              <View style={styles.cacheVaultContent}>
                <CacheScreenFlow
                  navigation={cacheOverlayNavigation}
                  onRequestClose={closeCacheVault}
                  entryAnimationToken={cacheOverlayEntryToken}
                />
              </View>

              <TouchableOpacity style={styles.cacheVaultCloseButton} activeOpacity={0.82} onPress={closeCacheVault}>
                <Text style={styles.cacheVaultCloseLabel}>✕</Text>
              </TouchableOpacity>
            </Animated.View>
        </View>

        <Animated.View
          style={[styles.profileOverlayRoot, profileOverlayRootStyle]}
          pointerEvents={isProfileOverlayVisible ? 'auto' : 'none'}
        >
            <BlurView intensity={78} tint="dark" style={styles.profileOverlayBlur} />
            <View style={styles.profileOverlayTint} />

            <Animated.View style={[styles.profileOverlayContent, profileOverlayContentStyle]}>
              <ProfileMainFlow
                navigation={profileOverlayNavigation}
                overlayMode
                onRequestClose={closeProfileOverlay}
              />
            </Animated.View>

            <TouchableOpacity
              style={styles.profileOverlayCloseButton}
              activeOpacity={0.82}
              onPress={closeProfileOverlay}
            >
              <Text style={styles.profileOverlayCloseLabel}>✕</Text>
            </TouchableOpacity>
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
  hubLayer: {
    flex: 1,
  },
  cacheOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 970,
  },
  cacheDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#05060A',
  },
  cacheVaultWrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 48,
    bottom: 14,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: '#0A0A0A',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  cacheVaultHandleBarWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    alignItems: 'center',
  },
  cacheVaultHandleBarHitbox: {
    width: '100%',
    paddingTop: 10,
    paddingBottom: 12,
    alignItems: 'center',
  },
  cacheVaultHandleBar: {
    width: 54,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  cacheVaultContent: {
    flex: 1,
  },
  cacheVaultCloseButton: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 45,
  },
  cacheVaultCloseLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 16,
  },
  profileOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  profileOverlayBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  profileOverlayTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 10, 16, 0.22)',
  },
  profileOverlayContent: {
    ...StyleSheet.absoluteFillObject,
  },
  profileOverlayCloseButton: {
    position: 'absolute',
    top: 54,
    right: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileOverlayCloseLabel: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
});
