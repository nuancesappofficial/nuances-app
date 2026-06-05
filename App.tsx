// App.tsx - Expo Go Compatible Version
// This version works in Expo Go by using mock data instead of WatermelonDB

import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  Text,
  Alert,
  Linking,
  AppState,
  Modal,
  Image,
  useColorScheme,
  useWindowDimensions,
  type LayoutChangeEvent,
  type AppStateStatus,
} from 'react-native';
import React, { useEffect, useState } from 'react';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  runOnJS,
  SensorType,
  useAnimatedSensor,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import RootNavigator from './src/navigation/RootNavigator';
import OnboardingFlow from './src/screens/flow/OnboardingFlow';
import LightPressable from './src/components/UI/shared/LightPressable';
import AnimatedSplashV2 from './src/components/UI/shared/AnimatedSplashV2';
import { useShareExtension } from './src/hooks/useShareExtension';
import { ShareExtensionProvider } from './src/contexts/ShareExtensionContext';
import { AppTourProvider } from './src/contexts/AppTourContext';
import { purgeExpiredFreeCacheOnForeground } from './src/database/cacheLifecycle';
import {
  completeOAuthFromUrl,
  getCurrentUser,
  getCurrentSession,
  signInWithApple,
  signInWithGoogle,
  signOut,
  supabase,
} from './src/services/supabase/client';
import SubscriptionService from './src/services/subscription/SubscriptionService';
import { checkAppVersionUpdateStatus } from './src/services/appVersion/appVersionService';
import { SCREEN_BG, resolveThemeColors } from './src/theme/colors';

// Check if we're running in Expo Go
const isExpoGo = !('HermesInternal' in globalThis);
WebBrowser.maybeCompleteAuthSession();
const APP_CUTOUT_ICON = require('./assets/app_icons/icon_cutout2.png');
const AUTH_REDIRECT_SCHEME = process.env.EXPO_PUBLIC_AUTH_REDIRECT_SCHEME || 'nuances';
const DEV_SIGNOUT_URL = `${AUTH_REDIRECT_SCHEME}://dev/signout`;
const DEV_RESET_ONBOARDING_URL = `${AUTH_REDIRECT_SCHEME}://dev/reset-onboarding`;

function ShareExtensionSync({
  userId,
  children,
}: {
  userId: string | null;
  children: React.ReactNode;
}) {
  useShareExtension(userId);
  return <>{children}</>;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkOnboardingStatus(nextUserId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', nextUserId)
    .maybeSingle();

  if (error) {
    console.warn('[Onboarding] status lookup failed:', error.message);
    return false;
  }

  return data?.onboarding_completed === true;
}

function AuthGate({
  onPressGoogle,
  onPressApple,
  loading,
}: {
  onPressGoogle: () => void;
  onPressApple: () => void;
  loading: boolean;
}) {
  const colorScheme = useColorScheme();
  const isLight = colorScheme === 'light';
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [heroHeight, setHeroHeight] = React.useState<number>(windowHeight);
  const [actionTopY, setActionTopY] = React.useState<number | null>(null);
  const authIntroAnim = React.useRef(new Animated.Value(0)).current;
  const sensor = useAnimatedSensor(SensorType.GRAVITY, {
    interval: 16,
  });
  const stickerTiltDeg = ((0 % 5) - 2) * 1.2;
  const posX = useSharedValue(-2);
  const posY = useSharedValue(1);
  const velX = useSharedValue(0);
  const velY = useSharedValue(0);
  const lastEdgeMask = useSharedValue(0);
  const stageWidth = Math.max(220, windowWidth);
  const stickerBoxSize = 172;
  const EDGE_INSET_X = 4;
  const BOUNCE = 0.55;
  const FRICTION = 0.93;
  const GRAVITY_MULTIPLIER = 400;
  const effectiveHeroHeight = Math.max(320, heroHeight || windowHeight);
  const centerYOffset = effectiveHeroHeight / 2;
  const upperBound = -centerYOffset + stickerBoxSize / 2 + EDGE_INSET_X;
  const lowerBound =
    actionTopY == null
      ? centerYOffset - stickerBoxSize / 2 - EDGE_INSET_X
      : actionTopY - centerYOffset - stickerBoxSize / 2 - EDGE_INSET_X;
  const triggerBorderHaptic = React.useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);
  const handleHeroLayout = React.useCallback((event: LayoutChangeEvent) => {
    setHeroHeight(event.nativeEvent.layout.height);
  }, []);
  const handleActionStackLayout = React.useCallback((event: LayoutChangeEvent) => {
    setActionTopY(event.nativeEvent.layout.y);
  }, []);

  React.useEffect(() => {
    authIntroAnim.setValue(0);
    Animated.timing(authIntroAnim, {
      toValue: 1,
      duration: 760,
      delay: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [authIntroAnim]);

  useFrameCallback((frameInfo) => {
    'worklet';
    if (loading) {
      velX.value = 0;
      velY.value = 0;
      lastEdgeMask.value = 0;
      return;
    }
    if (frameInfo.timeSincePreviousFrame == null) return;
    const dt = frameInfo.timeSincePreviousFrame / 1000;

    const gx = sensor.sensor.value?.x ?? 0;
    const gy = sensor.sensor.value?.y ?? 0;
    const ax = gx * GRAVITY_MULTIPLIER;
    const ay = -gy * GRAVITY_MULTIPLIER;

    const limitLeft = -stageWidth / 2 + stickerBoxSize / 2 + EDGE_INSET_X;
    const limitRight = stageWidth / 2 - stickerBoxSize / 2 - EDGE_INSET_X;
    const limitUp = upperBound;
    const limitDown = Math.max(limitUp, lowerBound);

    velX.value += ax * dt;
    velY.value += ay * dt;
    velX.value *= Math.pow(FRICTION, dt * 60);
    velY.value *= Math.pow(FRICTION, dt * 60);

    let nextX = posX.value + velX.value * dt;
    let nextY = posY.value + velY.value * dt;
    let edgeMask = 0;

    if (nextX <= limitLeft) {
      nextX = limitLeft;
      velX.value = Math.abs(velX.value) * BOUNCE;
      edgeMask |= 1;
    } else if (nextX >= limitRight) {
      nextX = limitRight;
      velX.value = -Math.abs(velX.value) * BOUNCE;
      edgeMask |= 2;
    }
    if (nextY <= limitUp) {
      nextY = limitUp;
      velY.value = Math.abs(velY.value) * BOUNCE;
      edgeMask |= 4;
    } else if (nextY >= limitDown) {
      nextY = limitDown;
      velY.value = -Math.abs(velY.value) * BOUNCE;
      edgeMask |= 8;
    }

    if (edgeMask !== 0 && edgeMask !== lastEdgeMask.value) {
      lastEdgeMask.value = edgeMask;
      runOnJS(triggerBorderHaptic)();
    } else if (edgeMask === 0) {
      lastEdgeMask.value = 0;
    }

    posX.value = nextX;
    posY.value = nextY;
  }, true);

  const stickerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: posX.value },
        { translateY: posY.value },
        { rotateZ: `${stickerTiltDeg}deg` },
      ],
    };
  });
  const authTitleAnimatedStyle = {
    opacity: authIntroAnim,
    transform: [
      {
        translateY: authIntroAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-8, 0],
        }),
      },
    ],
  };
  const authActionsAnimatedStyle = {
    opacity: authIntroAnim,
    transform: [
      {
        translateY: authIntroAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };

  return (
    <View style={[styles.authContainer, { backgroundColor: '#02213D' }]}>
      <LinearGradient
        pointerEvents="none"
        colors={
          isLight
            ? ['rgba(78,175,244,0.16)', 'rgba(78,175,244,0.03)', 'transparent']
            : ['rgba(78,175,244,0.20)', 'rgba(78,175,244,0.06)', 'transparent']
        }
        style={styles.authBackdropGlow}
      />
      <View style={styles.authHeroStack} onLayout={handleHeroLayout}>
        <View style={styles.authStickerStage} pointerEvents="none">
          <Reanimated.View
            style={[
              styles.authStickerWrap,
              stickerAnimatedStyle,
              {
                shadowColor: isLight ? '#0F172A' : '#020617',
              },
            ]}
          >
            <Image source={APP_CUTOUT_ICON} style={styles.authStickerIcon} resizeMode="contain" />
          </Reanimated.View>
        </View>

        <Animated.View style={[styles.authTitleStage, { paddingTop: Math.max(insets.top + 6, 28) }, authTitleAnimatedStyle]}>
          <Text style={[styles.authTitle, { color: '#F8FAFC' }]}>Nuances</Text>
        </Animated.View>

        <Animated.View style={[styles.authActionStack, authActionsAnimatedStyle]} onLayout={handleActionStackLayout}>
          <LightPressable
            style={[styles.googleButton, loading && styles.googleButtonDisabled]}
            onPress={onPressApple}
            disabled={loading}
            pressedScale={0.985}
            pressedOpacity={0.96}
          >
            <View
              style={[
                styles.appleButtonSurface,
                {
                  backgroundColor: isLight ? '#FFFFFF' : '#F8FAFC',
                  borderColor: isLight ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.08)',
                },
              ]}
            >
              <View style={styles.authButtonContent}>
                <Ionicons name="logo-apple" size={20} color="#0F172A" />
                <Text style={styles.appleButtonText}>{loading ? '連線中...' : 'Continue with Apple'}</Text>
              </View>
            </View>
          </LightPressable>

          <LightPressable
            style={[styles.googleButton, loading && styles.googleButtonDisabled]}
            onPress={onPressGoogle}
            disabled={loading}
            pressedScale={0.985}
            pressedOpacity={0.96}
          >
            <LinearGradient
              colors={['#65B9F7', '#4EAFF4', '#2E7EC2']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.googleButtonGradient}
            >
              <View style={styles.authButtonContent}>
                <Ionicons name="logo-google" size={18} color="#F4EEF3" />
                <Text style={styles.googleButtonText}>{loading ? '連線中...' : 'Continue with Google'}</Text>
              </View>
            </LinearGradient>
          </LightPressable>
        </Animated.View>
      </View>
    </View>
  );
}

function GlobalThemeCrossFadeOverlay() {
  const colorScheme = useColorScheme();
  const previousColorSchemeRef = React.useRef(colorScheme);
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const [overlayColor, setOverlayColor] = React.useState<string | null>(null);

  React.useEffect(() => {
    const previousColorScheme = previousColorSchemeRef.current;
    if (previousColorScheme === colorScheme) return;

    const previousTheme = resolveThemeColors(previousColorScheme);
    previousColorSchemeRef.current = colorScheme;
    setOverlayColor(previousTheme.screenBg);
    overlayOpacity.stopAnimation();
    overlayOpacity.setValue(1);
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 260,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setOverlayColor(null);
    });
  }, [colorScheme, overlayOpacity]);

  if (!overlayColor) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent presentationStyle="overFullScreen">
      <Animated.View
        pointerEvents="none"
        style={[styles.themeFadeOverlay, { backgroundColor: overlayColor, opacity: overlayOpacity }]}
      />
    </Modal>
  );
}

export default function App() {
  const colorScheme = useColorScheme();
  const [isReady, setIsReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [allowOfflineAccess, setAllowOfflineAccess] = useState(false);
  const [showBootCurtain, setShowBootCurtain] = useState(true);
  const [showSignInCurtain, setShowSignInCurtain] = useState(false);
  const [signInCurtainReady, setSignInCurtainReady] = useState(false);
  const lastHandledOAuthUrlRef = React.useRef<string | null>(null);
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);
  const promptedVersionKeyRef = React.useRef<string | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      if (isExpoGo) {
        console.log('✅ Running in Expo Go mode');
      }

      const { session } = await withTimeout(getCurrentSession(), 6000, 'getCurrentSession');
      if (session?.access_token) {
        const { user } = await withTimeout(getCurrentUser(), 6000, 'getCurrentUser');
        await SubscriptionService.ensureTrialEnrollment();
        if (user?.id) {
          await SubscriptionService.syncEntitlements(user.id);
        }
        const nextUserId = user?.id ?? null;
        setUserId(nextUserId);
        if (nextUserId) {
          const completed = await withTimeout(
            checkOnboardingStatus(nextUserId),
            6000,
            'checkOnboardingStatus'
          );
          setNeedsOnboarding(!completed);
        } else {
          setNeedsOnboarding(false);
        }
        setOnboardingChecked(true);
      } else {
        setUserId(null);
        setNeedsOnboarding(false);
        setOnboardingChecked(true);
      }

      void checkForAppVersionUpdate();
      setIsReady(true);
    } catch (error) {
      console.error('Initialization error:', error);
      // 網路不可用時不要卡在 Loading/Auth Gate，先讓使用者進離線模式瀏覽本機資料。
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const isNetworkTimeout =
        message.includes('timed out') ||
        message.includes('network request failed') ||
        message.includes('network request timed out') ||
        message.includes('authretryablefetcherror');
      if (isNetworkTimeout) {
        setAllowOfflineAccess(true);
      }
      setUserId(null);
      setNeedsOnboarding(false);
      setOnboardingChecked(true);
      setIsReady(true); // Continue anyway
      void checkForAppVersionUpdate();
    }
  };

  const checkForAppVersionUpdate = React.useCallback(async () => {
    const status = await checkAppVersionUpdateStatus();
    if (!status) return;

    const promptKey = [
      status.currentVersion,
      status.latestVersion || 'latest',
      status.minimumSupportedVersion || 'minimum',
      status.isRequired ? 'required' : 'optional',
    ].join(':');
    if (!status.isRequired && promptedVersionKeyRef.current === promptKey) return;
    promptedVersionKeyRef.current = promptKey;

    const openUpdateUrl = () => {
      if (!status.updateUrl) {
        Alert.alert('Update unavailable', 'The App Store update link is not configured yet.');
        return;
      }
      void Linking.openURL(status.updateUrl).catch((error) => {
        console.warn('[AppVersion] failed to open update URL:', error);
        Alert.alert('Update unavailable', 'Unable to open the App Store update page. Please try again later.');
      });
    };

    const actions = status.isRequired
      ? [{ text: 'Update App', onPress: openUpdateUrl }]
      : [
          { text: 'Later', style: 'cancel' as const },
          { text: 'Update App', onPress: openUpdateUrl },
        ];

    Alert.alert(status.title, status.message, actions, { cancelable: !status.isRequired });
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.access_token) {
        setUserId(null);
        setNeedsOnboarding(false);
        setOnboardingChecked(true);
        setShowSignInCurtain(false);
        setSignInCurtainReady(false);
        return;
      }
      void (async () => {
        try {
          setOnboardingChecked(false);
          const { user } = await getCurrentUser();
          await SubscriptionService.ensureTrialEnrollment();
          if (user?.id) {
            await SubscriptionService.syncEntitlements(user.id);
          }
          const nextUserId = user?.id ?? null;
          setUserId(nextUserId);
          if (nextUserId) {
            const completed = await checkOnboardingStatus(nextUserId);
            setNeedsOnboarding(!completed);
          } else {
            setNeedsOnboarding(false);
          }
          setOnboardingChecked(true);
          setSignInCurtainReady(true);
        } catch (error) {
          console.error('[App] auth state entitlement bootstrap failed:', error);
          setOnboardingChecked(true);
          setSignInCurtainReady(true);
        }
      })();
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const handleOAuthCallback = React.useCallback(async (url: string) => {
    if (!url.includes('auth/callback')) return;
    if (lastHandledOAuthUrlRef.current === url) return;
    lastHandledOAuthUrlRef.current = url;

    setShowSignInCurtain(true);
    setSignInCurtainReady(false);
    const { error, handled } = await completeOAuthFromUrl(url);
    if (handled && error) {
      setShowSignInCurtain(false);
      setSignInCurtainReady(false);
      Alert.alert('登入失敗', error.message);
      return;
    }
    if (handled && !error) {
      return;
    }
    setShowSignInCurtain(false);
    setSignInCurtainReady(false);
  }, []);

  const handleDeveloperCommand = React.useCallback(async (url: string) => {
    if (!__DEV__) return false;
    if (url.startsWith(DEV_RESET_ONBOARDING_URL)) {
      try {
        const { user } = await getCurrentUser();
        if (!user?.id) {
          Alert.alert('無法重設 onboarding', '目前沒有登入中的使用者。');
          return true;
        }

        const { error } = await supabase
          .from('profiles')
          .update({
            native_language: 'zh-TW',
            english_level: null,
            learning_goal: null,
            onboarding_completed: false,
            has_seen_tour: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (error) throw error;

        setUserId(user.id);
        setAllowOfflineAccess(false);
        setNeedsOnboarding(true);
        setOnboardingChecked(true);
        Alert.alert('Onboarding 已重設', '目前帳號會重新進入 onboarding flow。');
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知錯誤';
        Alert.alert('重設 onboarding 失敗', message);
      }
      return true;
    }

    if (!url.startsWith(DEV_SIGNOUT_URL)) return false;

    try {
      await signOut();
      setAllowOfflineAccess(false);
      setUserId(null);
      setNeedsOnboarding(false);
      setOnboardingChecked(true);
      setShowSignInCurtain(false);
      setSignInCurtainReady(false);
      Alert.alert('已登出', '已切回 auth 畫面。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知錯誤';
      Alert.alert('登出失敗', message);
    }
    return true;
  }, []);

  const handleIncomingUrl = React.useCallback(
    async (url: string) => {
      const handledDevCommand = await handleDeveloperCommand(url);
      if (handledDevCommand) return;
      await handleOAuthCallback(url);
    },
    [handleDeveloperCommand, handleOAuthCallback]
  );

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleIncomingUrl(url);
    });

    Linking.getInitialURL().then((url) => {
      if (url) {
        void handleIncomingUrl(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [handleIncomingUrl]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      if (wasBackground && nextAppState === 'active' && userId) {
        void checkForAppVersionUpdate();
        void SubscriptionService.syncEntitlements(userId).catch((error) => {
          console.error('[Subscription] Foreground entitlement sync failed:', error);
        });
        void purgeExpiredFreeCacheOnForeground(userId).catch((error) => {
          console.error('[CacheLifecycle] Foreground cleanup failed:', error);
        });
      }
      if (wasBackground && nextAppState === 'active' && !userId) {
        void checkForAppVersionUpdate();
      }
      appStateRef.current = nextAppState;
    });
    return () => {
      subscription.remove();
    };
  }, [checkForAppVersionUpdate, userId]);

  const handleGoogleSignIn = React.useCallback(async () => {
    setAuthLoading(true);
    try {
      const { data, redirectTo, error } = await signInWithGoogle();
      if (error) {
        Alert.alert(
          '登入失敗',
          `Google OAuth 問題：${error.message}\n\n請檢查 Supabase Google Provider 與 Google Cloud OAuth 設定。`
        );
        return;
      }

      const authUrl = data?.url?.trim();
      if (!authUrl) {
        Alert.alert('登入失敗', 'Google OAuth URL 取得失敗');
        return;
      }

      const authResult = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
      if (authResult.type === 'success' && authResult.url) {
        await handleOAuthCallback(authResult.url);
      } else if (authResult.type !== 'cancel' && authResult.type !== 'dismiss') {
        Alert.alert('登入失敗', `Google OAuth 未完成（${authResult.type}）`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知錯誤';
      Alert.alert('登入失敗', message);
    } finally {
      setAuthLoading(false);
    }
  }, [handleOAuthCallback]);

  const handleAppleSignIn = React.useCallback(async () => {
    setAuthLoading(true);
    try {
      const { data, redirectTo, error } = await signInWithApple();
      if (error) {
        Alert.alert(
          '登入失敗',
          `Apple OAuth 問題：${error.message}\n\n請檢查 Supabase Apple Provider 與 Apple Services 設定。`
        );
        return;
      }

      const authUrl = data?.url?.trim();
      if (!authUrl) {
        Alert.alert('登入失敗', 'Apple OAuth URL 取得失敗');
        return;
      }

      const authResult = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
      if (authResult.type === 'success' && authResult.url) {
        await handleOAuthCallback(authResult.url);
      } else if (authResult.type !== 'cancel' && authResult.type !== 'dismiss') {
        Alert.alert('登入失敗', `Apple OAuth 未完成（${authResult.type}）`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知錯誤';
      Alert.alert('登入失敗', message);
    } finally {
      setAuthLoading(false);
    }
  }, [handleOAuthCallback]);

  const handleBootCurtainOpened = React.useCallback(() => {
    setShowBootCurtain(false);
  }, []);

  const handleSignInCurtainOpened = React.useCallback(() => {
    setShowSignInCurtain(false);
    setSignInCurtainReady(false);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {isReady ? (
          <ShareExtensionProvider>
            <AppTourProvider>
              <ShareExtensionSync userId={userId}>
                {userId && !onboardingChecked ? (
                  <View style={styles.bootLoadingBase} />
                ) : userId && needsOnboarding ? (
                  <OnboardingFlow
                    userId={userId}
                    onComplete={() => {
                      setNeedsOnboarding(false);
                      setOnboardingChecked(true);
                    }}
                  />
                ) : userId || allowOfflineAccess ? (
                  <RootNavigator isExpoGo={isExpoGo} />
                ) : (
                  <AuthGate
                    onPressGoogle={handleGoogleSignIn}
                    onPressApple={handleAppleSignIn}
                    loading={authLoading}
                  />
                )}
              </ShareExtensionSync>
              <StatusBar style={colorScheme === 'light' ? 'dark' : 'light'} />
            </AppTourProvider>
          </ShareExtensionProvider>
        ) : (
          <View style={styles.bootLoadingBase} />
        )}
        {showBootCurtain ? (
          <AnimatedSplashV2 ready={isReady} onAnimationComplete={handleBootCurtainOpened} />
        ) : null}
        {showSignInCurtain ? (
          <AnimatedSplashV2
            ready={signInCurtainReady}
            onAnimationComplete={handleSignInCurtainOpened}
          />
        ) : null}
        <GlobalThemeCrossFadeOverlay />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  bootLoadingBase: {
    flex: 1,
    backgroundColor: SCREEN_BG,
  },
  authContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authBackdropGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '58%',
  },
  authHeroStack: {
    flex: 1,
    alignItems: 'center',
    width: '100%',
    paddingTop: 12,
    paddingBottom: 30,
    zIndex: 1,
  },
  authTitleStage: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 2,
  },
  authTitle: {
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 38,
    letterSpacing: -0.9,
  },
  themeFadeOverlay: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
  },
  authActionStack: {
    width: '100%',
    marginTop: 'auto',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
    zIndex: 2,
  },
  authStickerStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  authStickerWrap: {
    width: 172,
    height: 172,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  authStickerIcon: {
    width: '100%',
    height: '100%',
  },
  googleButton: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  appleButtonSurface: {
    minHeight: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderWidth: 1,
  },
  appleButtonText: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
  },
  googleButtonGradient: {
    minHeight: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    color: '#F4EEF3',
    fontSize: 17,
    fontWeight: '700',
  },
  authButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
});
