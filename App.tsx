// App.tsx - Expo Go Compatible Version
// This version works in Expo Go by using mock data instead of WatermelonDB

import { StatusBar } from 'expo-status-bar';
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
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import React, { useCallback, useEffect, useReducer, useState } from 'react';
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
import VideoTourFlow from './src/screens/flow/VideoTourFlow';
import { type VideoPlayer } from 'expo-video';
import { FirstTourVideoPreloader } from './src/components/UI/shared/FirstTourVideoPreloader';
import LightPressable from './src/components/UI/shared/LightPressable';
import AnimatedSplashV2 from './src/components/UI/shared/AnimatedSplashV2';
import { useShareExtension } from './src/hooks/useShareExtension';
import { ShareExtensionProvider } from './src/contexts/ShareExtensionContext';
import { AppTourProvider } from './src/contexts/AppTourContext';
import {
  getCurrentSession,
  signIn,
  signInWithApple,
  signInWithGoogle,
  signOut,
  supabase,
} from './src/services/supabase/client';
import { enforceLocalDataScopeForUser } from './src/services/auth/localDataScope';
import { resetFreshTestAccount } from './src/features/auth/freshTestAccount';
import {
  beginFreshTestAccountReset,
  finishFreshTestAccountReset,
  waitForFreshTestAccountReset,
} from './src/features/auth/freshTestAccountGate';
import {
  isDevFreshUserSimulatorEnabled,
  simulateFreshUser,
} from './src/features/auth/devFreshUserSimulator';
import SubscriptionService from './src/services/subscription/SubscriptionService';
import ReminderNotificationService from './src/services/notifications/ReminderNotificationService';
import TipNotificationService from './src/services/notifications/TipNotificationService';
import { checkAppVersionUpdateStatus } from './src/services/appVersion/appVersionService';
import { syncIfNeeded } from './src/services/sync';
import {
  loadUserSettings,
  clearUserSettings,
  hasStoredUserSettings,
  getAIReplyLanguageForUILanguage,
  getNativeUILanguageFromDevice,
  normalizeAIBreakdownMode,
  normalizeLearningLanguages,
  normalizeNativeUILanguage,
  saveUserSettings,
} from './src/services/settings/userSettings';
import { prepareOCRLanguagesForLearningLanguages } from './src/services/ocr/languagePacks';
import { installUserMistakeAlertLogger } from './src/services/logging/userMistakeLog';
import { logDiagnosticEvent } from './src/services/logging/diagnosticsLog';
import { traceFirstRun } from './src/services/logging/firstRunTraceRuntime';
import { analytics } from './src/services/analytics';
import {
  initializeGrowthAnalytics,
  rememberGrowthAttributionFromUrl,
} from './src/services/analytics/growthAnalyticsRuntime';
import { processPendingCardImageUploads } from './src/services/cards/cardImageCloudQueue';
import { SCREEN_BG, resolveThemeColors } from './src/theme/colors';
import { tUI } from './src/i18n/uiLanguage';
import { setAppGroupActiveUserId } from './src/native/SharedDefaultsModule';
import {
  clearTourSeenLocally,
  hasSeenTourLocally,
  markTourSeenLocally,
} from './src/features/tour/tourSeen';
import { clearDefaultExperienceCardSeen } from './src/features/cache/defaultExperienceCard';
import {
  clearLocalAccountDataForUser,
  clearLocalAccountCaches,
} from './src/services/account/AccountDeletionService';
import { setActiveDevFreshUserId } from './src/features/auth/devFreshUserSimulatorCore';
import { VIDEO_TOUR_ENABLED } from './src/features/tour/tourMode';
import {
  advanceFirstRunJourney,
  createFirstRunJourney,
} from './src/features/tour/firstRunJourney';
import TourMotionLab from './src/screens/dev/TourMotionLab';
import TourCompletionGreetingLab from './src/screens/dev/TourCompletionGreetingLab';
import {
  createHiddenSignInCurtain,
  transitionSignInCurtain,
} from './src/features/auth/signInCurtain';

// Check if we're running in Expo Go
const isExpoGo = !('HermesInternal' in globalThis);
installUserMistakeAlertLogger();
void ReminderNotificationService.configure();
const APP_CUTOUT_ICON = require('./assets/app_icons/icon_cutout2.png');
const AUTH_REDIRECT_SCHEME = process.env.EXPO_PUBLIC_AUTH_REDIRECT_SCHEME || 'nuances';
const INTERNAL_TESTER_TOOLS_ENABLED =
  process.env.EXPO_PUBLIC_INTERNAL_TESTER_TOOLS === 'true';
const DEV_SIGNOUT_URL = `${AUTH_REDIRECT_SCHEME}://dev/signout`;
const DEV_RESET_ONBOARDING_URL = `${AUTH_REDIRECT_SCHEME}://dev/reset-onboarding`;
const DEV_SKIP_TOUR_URL = `${AUTH_REDIRECT_SCHEME}://dev/skip-tour`;
const DEV_TOUR_MOTION_LAB_URL = `${AUTH_REDIRECT_SCHEME}://dev/tour-motion-lab`;
const DEV_TOUR_COMPLETION_GREETING_URL = `${AUTH_REDIRECT_SCHEME}://dev/tour-completion-greeting`;
const DEV_REPLAY_TOUR_URL = `${AUTH_REDIRECT_SCHEME}://dev/replay-tour`;
const DEV_REPLAY_VIDEO_TOUR_URL = `${AUTH_REDIRECT_SCHEME}://dev/replay-video-tour`;

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

const STARTUP_REMOTE_GATE_TIMEOUT_MS = 5000;
const STARTUP_LOCAL_SCOPE_TIMEOUT_MS = 10000;
const NATIVE_BRIDGE_TIMEOUT_MS = 3000;
const STARTUP_WATCHDOG_TIMEOUT_MS = 15000;

async function checkOnboardingStatus(nextUserId: string): Promise<boolean> {
  const { data, error } = await withTimeout(
    Promise.resolve(
      supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', nextUserId)
        .maybeSingle()
    ),
    STARTUP_REMOTE_GATE_TIMEOUT_MS,
    'checkOnboardingStatus'
  );

  if (error) {
    console.warn('[Onboarding] status lookup failed:', error.message);
    return false;
  }

  return data?.onboarding_completed === true;
}

async function shouldShowVideoTour(nextUserId: string): Promise<boolean> {
  if (!VIDEO_TOUR_ENABLED) return false;
  if (await hasSeenTourLocally(nextUserId)) return false;
  const { data, error } = await withTimeout(
    Promise.resolve(
      supabase
        .from('profiles')
        .select('has_seen_tour')
        .eq('id', nextUserId)
        .maybeSingle()
    ),
    STARTUP_REMOTE_GATE_TIMEOUT_MS,
    'shouldShowVideoTour'
  );

  if (error) {
    console.warn('[VideoTour] status lookup failed:', error.message);
    return false;
  }

  return data?.has_seen_tour !== true;
}

async function syncProfileSettingsToLocal(nextUserId: string): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .select('ai_breakdown_mode, target_language, native_language')
    .eq('id', nextUserId)
    .maybeSingle();

  if (error) {
    console.warn('[Settings] profile settings sync failed:', error.message);
    return;
  }

  if (!data?.ai_breakdown_mode && !data?.target_language && !data?.native_language) return;
  const normalizedMode = normalizeAIBreakdownMode(data.ai_breakdown_mode);
  const normalizedLearningLanguages = normalizeLearningLanguages(data.target_language);
  const hasLocalSettings = await hasStoredUserSettings();
  const settings = await loadUserSettings();
  const profileUILanguage = data.native_language
    ? normalizeNativeUILanguage(data.native_language)
    : null;
  const resolvedUILanguage = hasLocalSettings
    ? settings.uiLanguage
    : profileUILanguage || settings.uiLanguage;
  const resolvedAIReplyLanguage = getAIReplyLanguageForUILanguage(resolvedUILanguage);
  const shouldUpdateMode = settings.personalization.aiBreakdownMode !== normalizedMode;
  const shouldUpdateLearningLanguages =
    normalizedLearningLanguages.join(',') !== settings.learningLanguages.join(',');
  const shouldUpdateNativeLanguage =
    settings.uiLanguage !== resolvedUILanguage ||
    settings.aiReplyLanguage !== resolvedAIReplyLanguage;
  if (!shouldUpdateMode && !shouldUpdateLearningLanguages && !shouldUpdateNativeLanguage) {
    void prepareOCRLanguagesForLearningLanguages(
      settings.imageTextLanguages,
      settings.imageTextLanguageMode
    );
    if (profileUILanguage !== settings.uiLanguage) {
      void supabase
        .from('profiles')
        .upsert(
          {
            id: nextUserId,
            native_language: settings.uiLanguage,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .then(({ error: syncError }) => {
          if (syncError) {
            console.warn('[Settings] profile language repair failed:', syncError.message);
          }
        });
    }
    return;
  }

  const nextSettings = {
    ...settings,
    uiLanguage: resolvedUILanguage,
    aiReplyLanguage: resolvedAIReplyLanguage,
    learningLanguages: normalizedLearningLanguages,
    personalization: {
      ...settings.personalization,
      aiBreakdownMode: normalizedMode,
    },
  };
  await saveUserSettings(nextSettings);
  if (profileUILanguage !== resolvedUILanguage) {
    void supabase
      .from('profiles')
      .upsert(
        {
          id: nextUserId,
          native_language: resolvedUILanguage,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .then(({ error: syncError }) => {
        if (syncError) {
          console.warn('[Settings] profile language repair failed:', syncError.message);
        }
      });
  }
  void prepareOCRLanguagesForLearningLanguages(
    nextSettings.imageTextLanguages,
    nextSettings.imageTextLanguageMode
  );
}

function triggerBackgroundCardSync(reason: 'startup' | 'auth' | 'foreground') {
  const work = syncIfNeeded({
    maxAgeMs: reason === 'foreground' ? 2 * 60 * 1000 : 15 * 1000,
    maxAttempts: 2,
  });
  return work
    .then((result) => {
      if (!result.success) {
        console.warn(`[Sync] ${reason} sync failed:`, result.message || result.error);
      }
      return result.success;
    })
    .catch((error) => {
      console.warn(`[Sync] ${reason} sync crashed:`, error);
      return false;
    });
}

function triggerBackgroundAccountRefresh(
  userId: string,
  reason: 'startup' | 'auth'
): void {
  void SubscriptionService.syncEntitlements(userId)
    .catch((error) => {
      console.warn(`[Subscription] ${reason} background refresh failed:`, error);
    });
  void syncProfileSettingsToLocal(userId).catch((error) => {
    console.warn(`[Settings] ${reason} background refresh failed:`, error);
  });
  void ReminderNotificationService.evaluateAndSchedule({
    allowSoftPrompt: false,
    markAppActive: true,
  }).catch((error) => {
    console.warn(`[Reminders] ${reason} schedule failed:`, error);
  });
  void TipNotificationService.reconcile().catch((error) => {
    console.warn(`[Tips] ${reason} schedule failed:`, error);
  });
}

function AuthGate({
  onPressGoogle,
  onPressApple,
  onPressTestAccount,
  loading,
}: {
  onPressGoogle: () => void;
  onPressApple: () => void;
  onPressTestAccount?: () => void;
  loading: boolean;
}) {
  const colorScheme = useColorScheme();
  const isLight = colorScheme === 'light';
  const uiLanguage = getNativeUILanguageFromDevice();
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
          {(__DEV__ || INTERNAL_TESTER_TOOLS_ENABLED) && onPressTestAccount ? (
            <LightPressable
              style={[styles.devTestAccountButton, loading && styles.googleButtonDisabled]}
              onPress={onPressTestAccount}
              disabled={loading}
              pressedScale={0.98}
              pressedOpacity={0.9}
            >
              <Ionicons name="flask-outline" size={15} color="#D9F1FF" />
              <Text style={styles.devTestAccountButtonText}>
                {loading ? 'Connecting…' : 'Fresh Test Account (Dev)'}
              </Text>
            </LightPressable>
          ) : null}
        </Animated.View>

        <Animated.View style={[styles.authActionStack, authActionsAnimatedStyle]} onLayout={handleActionStackLayout}>
          {Platform.OS === 'ios' ? (
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
                  <Text
                    style={styles.appleButtonText}
                  >
                    {loading ? tUI(uiLanguage, 'auth.connecting') : tUI(uiLanguage, 'auth.continueWithApple')}
                  </Text>
                </View>
              </View>
            </LightPressable>
          ) : null}

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
                <Text
                  style={styles.googleButtonText}
                >
                  {loading ? tUI(uiLanguage, 'auth.connecting') : tUI(uiLanguage, 'auth.continueWithGoogle')}
                </Text>
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
  const [videoTourChecked, setVideoTourChecked] = useState(false);
  const [needsVideoTour, setNeedsVideoTour] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [allowOfflineAccess, setAllowOfflineAccess] = useState(false);
  const [showBootCurtain, setShowBootCurtain] = useState(true);
  const [signInCurtain, dispatchSignInCurtain] = useReducer(
    transitionSignInCurtain,
    undefined,
    createHiddenSignInCurtain
  );
  const [showVideoTourCurtain, setShowVideoTourCurtain] = useState(false);
  const [showTourMotionLab, setShowTourMotionLab] = useState(false);
  const [showTourCompletionGreetingLab, setShowTourCompletionGreetingLab] =
    useState(false);
  const [manualVideoTourRequested, setManualVideoTourRequested] = useState(false);
  const [startTutorialAfterVideoTour, setStartTutorialAfterVideoTour] = useState(false);
  const videoTourEntryOpacity = React.useRef(new Animated.Value(1)).current;
  const preloadedFirstPlayerRef = React.useRef<VideoPlayer | null>(null);
  const handleFirstTourPlayerReady = useCallback((player: VideoPlayer) => {
    preloadedFirstPlayerRef.current = player;
  }, []);
  const promptedVersionKeyRef = React.useRef<string | null>(null);
  const authTransitionIdRef = React.useRef(0);
  const activeUserIdRef = React.useRef<string | null>(null);
  const analyticsAppOpenedRef = React.useRef(false);
  const startupGateStateRef = React.useRef({
    isReady: false,
    userId: null as string | null,
    onboardingChecked: false,
    videoTourChecked: false,
  });
  startupGateStateRef.current = { isReady, userId, onboardingChecked, videoTourChecked };

  useEffect(() => {
    if (!isReady) return;

    if (!userId) {
      analytics.reset();
      if (!analyticsAppOpenedRef.current) {
        analyticsAppOpenedRef.current = true;
        analytics.track('app_opened', { auth_state: 'anonymous' });
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      let email: string | undefined;
      try {
        const { session } = await getCurrentSession();
        if (session?.user?.id === userId) {
          email = session.user.email;
        }
      } catch (error) {
        console.warn('[Analytics] Failed to load identity properties:', error);
      }
      if (cancelled) return;

      analytics.identify(userId, { email });
      if (!analyticsAppOpenedRef.current) {
        analyticsAppOpenedRef.current = true;
        analytics.track('app_opened', { auth_state: 'authenticated' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isReady, userId]);

  useEffect(() => {
    traceFirstRun('app_start', 'app_component_mounted', {
      appState: AppState.currentState,
    });
    void logDiagnosticEvent({
      severity: 'info',
      category: 'app_lifecycle',
      event: 'app_component_mounted',
      context: { initialAppState: AppState.currentState, isExpoGo },
    });
    void initializeGrowthAnalytics(Linking.getInitialURL);
    initializeApp();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const gate = startupGateStateRef.current;
      const surfaceReady = gate.isReady && (
        !gate.userId || (gate.onboardingChecked && gate.videoTourChecked)
      );
      if (surfaceReady) return;

      void logDiagnosticEvent({
        severity: 'error',
        category: 'app_lifecycle',
        event: 'startup_gate_watchdog_released',
        userId: gate.userId,
        context: {
          timeoutMs: STARTUP_WATCHDOG_TIMEOUT_MS,
          ...gate,
        },
      });
      setNeedsOnboarding(false);
      setOnboardingChecked(true);
      setNeedsVideoTour(false);
      setVideoTourChecked(true);
      dispatchSignInCurtain('session-ready');
      setIsReady(true);
    }, STARTUP_WATCHDOG_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, []);

  const initializeApp = async () => {
    const startupTransitionId = authTransitionIdRef.current;
    const stopForNewerAuthTransition = (): boolean => {
      if (authTransitionIdRef.current === startupTransitionId) return false;
      return true;
    };

    try {
      void logDiagnosticEvent({
        severity: 'info',
        category: 'app_lifecycle',
        event: 'app_initialization_started',
      });
      if (isExpoGo) {
        console.log('✅ Running in Expo Go mode');
      }

      const { session } = await withTimeout(getCurrentSession(), 6000, 'getCurrentSession');
      if (stopForNewerAuthTransition()) return;
      if (session?.access_token) {
        void logDiagnosticEvent({
          severity: 'info',
          category: 'auth',
          event: 'startup_session_restored',
          context: { hasUser: Boolean(session.user?.id) },
        });
        // getSession() restores the persisted local session. Network validation,
        // RevenueCat and profile refresh must never block a normal cold start.
        const user = session.user;
        if (user?.id) {
          const localScopeStartedAt = Date.now();
          await withTimeout(
            enforceLocalDataScopeForUser(user.id),
            STARTUP_LOCAL_SCOPE_TIMEOUT_MS,
            'enforceLocalDataScopeForUser'
          );
          void logDiagnosticEvent({
            severity: 'info',
            category: 'app_lifecycle',
            event: 'startup_local_scope_ready',
            userId: user.id,
            context: { durationMs: Date.now() - localScopeStartedAt },
          });
          if (stopForNewerAuthTransition()) return;
          await withTimeout(
            setAppGroupActiveUserId(user.id),
            NATIVE_BRIDGE_TIMEOUT_MS,
            'setAppGroupActiveUserId(startup)'
          );
          if (stopForNewerAuthTransition()) return;
          activeUserIdRef.current = user.id;
          setUserId(user.id);
          setNeedsOnboarding(false);
          setOnboardingChecked(true);
          setNeedsVideoTour(false);
          setVideoTourChecked(false);
          setIsReady(true);

          void triggerBackgroundCardSync('startup').then((synced) =>
            synced ? processPendingCardImageUploads(user.id) : undefined
          );
          triggerBackgroundAccountRefresh(user.id, 'startup');
          void checkOnboardingStatus(user.id).then((completed) => {
            if (activeUserIdRef.current !== user.id) return;
            setNeedsOnboarding(!completed);
            void shouldShowVideoTour(user.id)
              .then((showVideoTour) => {
                if (activeUserIdRef.current !== user.id) return;
                setNeedsVideoTour(showVideoTour);
                setVideoTourChecked(true);
              })
              .catch((error) => {
                console.warn('[VideoTour] background status check failed:', error);
                if (activeUserIdRef.current !== user.id) return;
                setNeedsVideoTour(false);
                setVideoTourChecked(true);
              });
          }).catch((error) => {
            console.warn('[App] background onboarding check failed:', error);
            if (activeUserIdRef.current === user.id) {
              setNeedsVideoTour(false);
              setVideoTourChecked(true);
            }
          });
        }
      } else {
        void logDiagnosticEvent({
          severity: 'info',
          category: 'auth',
          event: 'startup_session_missing',
        });
        await withTimeout(
          setAppGroupActiveUserId(null),
          NATIVE_BRIDGE_TIMEOUT_MS,
          'setAppGroupActiveUserId(clear-startup)'
        );
        // A missing startup session can be transient. Keep local rows intact and
        // hide them behind the auth gate until a user identity is confirmed.
        activeUserIdRef.current = null;
        setUserId(null);
        setNeedsOnboarding(false);
        setOnboardingChecked(true);
        setNeedsVideoTour(false);
        setVideoTourChecked(true);
      }

      void checkForAppVersionUpdate();
      setIsReady(true);
      void logDiagnosticEvent({
        severity: 'info',
        category: 'app_lifecycle',
        event: 'app_initialization_completed',
        context: { hasSession: Boolean(session?.access_token) },
      });
    } catch (error) {
      void logDiagnosticEvent({
        severity: 'error',
        category: 'app_lifecycle',
        event: 'app_initialization_failed',
        message: error instanceof Error ? error.message : String(error),
        context: { error },
      });
      console.error('Initialization error:', error);
      // 網路不可用時不要卡在 Loading/Auth Gate，先讓使用者進離線模式瀏覽本機資料。
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const isNetworkTimeout =
        message.includes('timed out') ||
        message.includes('network request failed') ||
        message.includes('network request timed out') ||
        message.includes('authretryablefetcherror');
      if (isNetworkTimeout) {
        setAllowOfflineAccess(false);
      }
      activeUserIdRef.current = null;
      setUserId(null);
      setNeedsOnboarding(false);
      setOnboardingChecked(true);
      setNeedsVideoTour(false);
      setVideoTourChecked(true);
      setIsReady(true); // Continue anyway
      void checkForAppVersionUpdate();
    }
  };

  const checkForAppVersionUpdate = React.useCallback(async () => {
    if (__DEV__) return;
    const status = await checkAppVersionUpdateStatus();
    if (!status) return;
    void logDiagnosticEvent({
      severity: 'info',
      category: 'app_lifecycle',
      event: 'app_version_policy_checked',
      context: {
        isRequired: status.isRequired,
        hasUpdateUrl: Boolean(status.updateUrl),
        currentBuildNumber: status.currentBuildNumber,
        latestBuildNumber: status.latestBuildNumber,
      },
    });
    const settings = await loadUserSettings().catch(() => null);
    const uiLanguage = settings?.uiLanguage ?? 'en';

    const promptKey = [
      status.currentVersion,
      status.currentBuildNumber ?? 'current-build',
      status.latestVersion || 'latest',
      status.latestBuildNumber ?? 'latest-build',
      status.minimumSupportedVersion || 'minimum',
      status.minimumSupportedBuildNumber ?? 'minimum-build',
      status.isRequired ? 'required' : 'optional',
    ].join(':');
    if (!status.isRequired && promptedVersionKeyRef.current === promptKey) return;
    promptedVersionKeyRef.current = promptKey;

    const openUpdateUrl = () => {
      if (!status.updateUrl) {
        Alert.alert(
          tUI(uiLanguage, 'appVersion.updateUnavailableTitle'),
          tUI(uiLanguage, 'appVersion.updateUnavailableNoUrl')
        );
        return;
      }
      void Linking.openURL(status.updateUrl).catch((error) => {
        console.warn('[AppVersion] failed to open update URL:', error);
        Alert.alert(
          tUI(uiLanguage, 'appVersion.updateUnavailableTitle'),
          tUI(uiLanguage, 'appVersion.updateUnavailableOpenFailed')
        );
      });
    };

    const actions = status.isRequired
      ? [{ text: tUI(uiLanguage, 'appVersion.updateAction'), onPress: openUpdateUrl }]
      : [
          { text: tUI(uiLanguage, 'appVersion.laterAction'), style: 'cancel' as const },
          { text: tUI(uiLanguage, 'appVersion.updateAction'), onPress: openUpdateUrl },
        ];

    Alert.alert(
      tUI(uiLanguage, status.isRequired ? 'appVersion.updateRequiredTitle' : 'appVersion.updateAvailableTitle'),
      tUI(uiLanguage, status.isRequired ? 'appVersion.updateRequiredBody' : 'appVersion.updateAvailableBody'),
      actions,
      { cancelable: !status.isRequired }
    );
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      traceFirstRun('auth', 'state_changed', {
        authEvent: event,
        hasSession: Boolean(session?.access_token),
        hasUser: Boolean(session?.user?.id),
      });
      void logDiagnosticEvent({
        severity: 'info',
        category: 'auth',
        event: 'auth_state_changed',
        context: {
          authEvent: event,
          hasSession: Boolean(session?.access_token),
          hasUser: Boolean(session?.user?.id),
        },
      });
      const transitionId = authTransitionIdRef.current + 1;
      authTransitionIdRef.current = transitionId;
      const isStaleTransition = () => authTransitionIdRef.current !== transitionId;

      if (!session?.access_token) {
        // Hide the previous account immediately. Cleanup may touch many local
        // rows/files and must not leave the old navigator interactive.
        setAllowOfflineAccess(false);
        activeUserIdRef.current = null;
        setUserId(null);
        setNeedsOnboarding(false);
        setOnboardingChecked(true);
        setNeedsVideoTour(false);
        setVideoTourChecked(true);
        dispatchSignInCurtain('sign-in-aborted');
        setIsReady(true);
        void (async () => {
          try {
            await Promise.allSettled([
              withTimeout(
                setAppGroupActiveUserId(null),
                NATIVE_BRIDGE_TIMEOUT_MS,
                'setAppGroupActiveUserId(sign-out)'
              ),
              withTimeout(
                ReminderNotificationService.cancelAll(),
                NATIVE_BRIDGE_TIMEOUT_MS,
                'cancelReminderNotifications(sign-out)'
              ),
              withTimeout(
                TipNotificationService.cancelScheduled(),
                NATIVE_BRIDGE_TIMEOUT_MS,
                'cancelTipNotifications(sign-out)'
              ),
            ]);
          } catch (error) {
            console.warn('[App] local auth suspension failed:', error);
          }
        })();
        return;
      }
      const incomingUserId = session.user.id;
      if (
        activeUserIdRef.current === incomingUserId &&
        (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')
      ) {
        return;
      }
      const isAccountSwitch = Boolean(
        activeUserIdRef.current && activeUserIdRef.current !== incomingUserId
      );
      if (isAccountSwitch) {
        // Unmount account A before any asynchronous cleanup/bootstrap for B.
        activeUserIdRef.current = null;
        setUserId(null);
        setNeedsVideoTour(false);
        setVideoTourChecked(false);
      }
      void (async () => {
        try {
          setOnboardingChecked(false);
          const nextUserId = incomingUserId;
          if (nextUserId) {
            await waitForFreshTestAccountReset();
            if (isStaleTransition()) return;
            if (isAccountSwitch) {
              await withTimeout(
                setAppGroupActiveUserId(null),
                NATIVE_BRIDGE_TIMEOUT_MS,
                'setAppGroupActiveUserId(account-switch-clear)'
              );
              if (isStaleTransition()) return;
              await Promise.allSettled([
                withTimeout(
                  ReminderNotificationService.cancelAll(),
                  NATIVE_BRIDGE_TIMEOUT_MS,
                  'cancelReminderNotifications(account-switch)'
                ),
                withTimeout(
                  TipNotificationService.cancelScheduled(),
                  NATIVE_BRIDGE_TIMEOUT_MS,
                  'cancelTipNotifications(account-switch)'
                ),
              ]);
              if (isStaleTransition()) return;
            }
            await withTimeout(
              enforceLocalDataScopeForUser(nextUserId),
              STARTUP_LOCAL_SCOPE_TIMEOUT_MS,
              'enforceLocalDataScopeForUser(auth-transition)'
            );
            if (isStaleTransition()) return;
            await withTimeout(
              setAppGroupActiveUserId(nextUserId),
              NATIVE_BRIDGE_TIMEOUT_MS,
              'setAppGroupActiveUserId(auth-transition)'
            );
            if (isStaleTransition()) return;
            // The authenticated navigator can now be selected safely. Do not
            // let subscription/profile bootstrap expose the AuthGate.
            activeUserIdRef.current = nextUserId;
            setUserId(nextUserId);
            traceFirstRun('auth', 'local_identity_ready');
            // Keep card backup independent from subscription service failures.
            void triggerBackgroundCardSync('auth').then((synced) =>
              synced ? processPendingCardImageUploads(nextUserId) : undefined
            );
            triggerBackgroundAccountRefresh(nextUserId, 'auth');
          }
          setAllowOfflineAccess(false);
          if (nextUserId) {
            setNeedsOnboarding(false);
            setOnboardingChecked(false);
            setNeedsVideoTour(false);
            setVideoTourChecked(false);
            const completed = await checkOnboardingStatus(nextUserId);
            if (isStaleTransition()) return;
            traceFirstRun('auth', 'onboarding_status_resolved', { completed });
            setNeedsOnboarding(!completed);
            setOnboardingChecked(true);
            if (completed) {
              const showVideoTour = await shouldShowVideoTour(nextUserId);
              if (isStaleTransition()) return;
              setNeedsVideoTour(showVideoTour);
            }
            setVideoTourChecked(true);
            dispatchSignInCurtain('session-ready');
            setIsReady(true);
            return;
          } else {
            setNeedsOnboarding(false);
            setNeedsVideoTour(false);
            setVideoTourChecked(true);
          }
          activeUserIdRef.current = nextUserId;
          setUserId(nextUserId);
          setOnboardingChecked(true);
          dispatchSignInCurtain('session-ready');
          setIsReady(true);
        } catch (error) {
          void logDiagnosticEvent({
            severity: 'error',
            category: 'auth',
            event: 'auth_bootstrap_failed',
            message: error instanceof Error ? error.message : String(error),
            context: { error },
          });
          console.error('[App] auth state entitlement bootstrap failed:', error);
          if (!isStaleTransition()) {
            setOnboardingChecked(true);
            setNeedsVideoTour(false);
            setVideoTourChecked(true);
            dispatchSignInCurtain('session-ready');
            setIsReady(true);
          }
        }
      })();
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const resetOnboardingAndTutorialForCurrentUser = React.useCallback(async () => {
    const { session } = await getCurrentSession();
    const user = session?.user;
    if (!user?.id) {
      Alert.alert('無法重設 onboarding', '目前沒有登入中的使用者。');
      return;
    }

    const settings = await loadUserSettings();
    const { error } = await supabase
      .from('profiles')
      .update({
        native_language: settings.uiLanguage,
        english_level: null,
        learning_goal: null,
        ai_breakdown_mode: 'context',
        onboarding_completed: false,
        has_seen_tour: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) throw error;
    await clearTourSeenLocally(user.id);
    await clearDefaultExperienceCardSeen(user.id);
    await saveUserSettings({
      ...settings,
      personalization: {
        ...settings.personalization,
        aiBreakdownMode: 'context',
      },
    });

    activeUserIdRef.current = user.id;
    setUserId(user.id);
    setAllowOfflineAccess(false);
    setNeedsOnboarding(true);
    setOnboardingChecked(true);
    setNeedsVideoTour(VIDEO_TOUR_ENABLED);
    setManualVideoTourRequested(false);
    setVideoTourChecked(true);
  }, []);

  const handleDeveloperCommand = React.useCallback(async (url: string) => {
    if (!__DEV__) return false;
    if (url.startsWith(DEV_TOUR_MOTION_LAB_URL)) {
      setShowTourMotionLab(true);
      return true;
    }
    if (url.startsWith(DEV_TOUR_COMPLETION_GREETING_URL)) {
      setShowTourCompletionGreetingLab(true);
      return true;
    }
    if (url.startsWith(DEV_REPLAY_TOUR_URL)) {
      return true;
    }
    if (url.startsWith(DEV_REPLAY_VIDEO_TOUR_URL)) {
      try {
        const { session } = await getCurrentSession();
        const user = session?.user;
        if (!user?.id) {
          Alert.alert('無法重播 video tutorial', '目前沒有登入中的使用者。');
          return true;
        }
        await clearTourSeenLocally(user.id);
        const { error } = await supabase
          .from('profiles')
          .update({
            has_seen_tour: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);
        if (error) throw error;
        activeUserIdRef.current = user.id;
        setUserId(user.id);
        setNeedsOnboarding(false);
        setOnboardingChecked(true);
        setNeedsVideoTour(true);
        setVideoTourChecked(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知錯誤';
        Alert.alert('重播 video tutorial 失敗', message);
      }
      return true;
    }
    if (url.startsWith(DEV_RESET_ONBOARDING_URL)) {
      try {
        await resetOnboardingAndTutorialForCurrentUser();
        Alert.alert('Onboarding 已重設', '目前帳號會重新進入 onboarding flow。');
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知錯誤';
        Alert.alert('重設 onboarding 失敗', message);
      }
      return true;
    }

    if (url.startsWith(DEV_SKIP_TOUR_URL)) {
      try {
        const { session } = await getCurrentSession();
        const user = session?.user;
        if (!user?.id) {
          Alert.alert('無法跳過 tutorial', '目前沒有登入中的使用者。');
          return true;
        }

        const { error } = await supabase
          .from('profiles')
          .update({
            has_seen_tour: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (error) throw error;
        await markTourSeenLocally(user.id);
        setNeedsVideoTour(false);
        setVideoTourChecked(true);
        Alert.alert('Tutorial 已跳過', '目前帳號不會再自動播放 global tour。');
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知錯誤';
        Alert.alert('跳過 tutorial 失敗', message);
      }
      return true;
    }

    if (!url.startsWith(DEV_SIGNOUT_URL)) return false;

    try {
      await signOut();
      setAllowOfflineAccess(false);
        activeUserIdRef.current = null;
        setUserId(null);
        setNeedsOnboarding(false);
        setOnboardingChecked(true);
        setNeedsVideoTour(false);
        setVideoTourChecked(true);
        dispatchSignInCurtain('sign-in-aborted');
      Alert.alert('已登出', '已切回 auth 畫面。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知錯誤';
      Alert.alert('登出失敗', message);
    }
    return true;
  }, [resetOnboardingAndTutorialForCurrentUser]);

  const handleIncomingUrl = React.useCallback(
    async (url: string) => {
      await rememberGrowthAttributionFromUrl(url);
      await handleDeveloperCommand(url);
    },
    [handleDeveloperCommand]
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

  const handleGoogleSignIn = React.useCallback(async () => {
    traceFirstRun('auth', 'sign_in_started', { provider: 'google' });
    dispatchSignInCurtain('sign-in-started');
    setAuthLoading(true);
    try {
      const { data, error, cancelled } = await signInWithGoogle();
      if (cancelled) {
        traceFirstRun('auth', 'sign_in_cancelled', { provider: 'google' });
        dispatchSignInCurtain('sign-in-aborted');
        return;
      }
      if (error) {
        traceFirstRun('auth', 'sign_in_failed', {
          provider: 'google',
          error,
        });
        dispatchSignInCurtain('sign-in-aborted');
        Alert.alert(
          '登入失敗',
          `Google 登入問題：${error.message}\n\n請檢查 Google iOS／Web Client ID 與 Supabase Google Provider 設定。`
        );
        return;
      }
      if (!data?.session?.access_token) {
        dispatchSignInCurtain('sign-in-aborted');
        Alert.alert('登入失敗', 'Google 登入完成，但沒有建立 app session。');
        return;
      }
      dispatchSignInCurtain('sign-in-returned');
      traceFirstRun('auth', 'provider_returned_session', {
        provider: 'google',
      });
    } catch (error) {
      traceFirstRun('auth', 'sign_in_crashed', {
        provider: 'google',
        error,
      });
      dispatchSignInCurtain('sign-in-aborted');
      const message = error instanceof Error ? error.message : '未知錯誤';
      Alert.alert('登入失敗', message);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const handleAppleSignIn = React.useCallback(async () => {
    traceFirstRun('auth', 'sign_in_started', { provider: 'apple' });
    dispatchSignInCurtain('sign-in-started');
    setAuthLoading(true);
    try {
      const { data, error } = await signInWithApple();
      if (error) {
        traceFirstRun('auth', 'sign_in_failed', {
          provider: 'apple',
          error,
        });
        dispatchSignInCurtain('sign-in-aborted');
        Alert.alert(
          '登入失敗',
          `Apple 登入問題：${error.message}\n\n請檢查原生 Apple Sign In capability 與 Supabase Apple provider 設定。`
        );
        return;
      }
      if (!data?.session?.access_token) {
        dispatchSignInCurtain('sign-in-aborted');
        Alert.alert('登入失敗', 'Apple 登入完成，但沒有建立 app session。');
        return;
      }
      dispatchSignInCurtain('sign-in-returned');
      traceFirstRun('auth', 'provider_returned_session', {
        provider: 'apple',
      });
    } catch (error) {
      traceFirstRun('auth', 'sign_in_crashed', {
        provider: 'apple',
        error,
      });
      dispatchSignInCurtain('sign-in-aborted');
      const message = error instanceof Error ? error.message : '未知錯誤';
      Alert.alert('登入失敗', message);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const handleTestAccountSignIn = React.useCallback(async () => {
    const devSimulatorEnabled = isDevFreshUserSimulatorEnabled();
    const email = process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL;
    const password = process.env.EXPO_PUBLIC_TEST_ACCOUNT_PASSWORD;
    if (!__DEV__ && !INTERNAL_TESTER_TOOLS_ENABLED) {
      Alert.alert('Test account unavailable', 'Dev test account is not available in this build.');
      return;
    }
    if (!devSimulatorEnabled && (!email || !password)) {
      Alert.alert('Test account unavailable', 'Dev test account credentials are not configured.');
      return;
    }

    traceFirstRun('auth', 'sign_in_started', {
      provider: devSimulatorEnabled ? 'dev_fresh_user_simulator' : 'dev_test_account',
    });
    beginFreshTestAccountReset();
    dispatchSignInCurtain('sign-in-started');
    setAuthLoading(true);
    try {
      if (devSimulatorEnabled) {
        // Dev-only: simulate a brand-new user locally without real credentials.
        const session = await simulateFreshUser();
        const nextUserId = session.user.id;
        await withTimeout(
          setAppGroupActiveUserId(nextUserId),
          NATIVE_BRIDGE_TIMEOUT_MS,
          'setAppGroupActiveUserId(dev-fresh-user)'
        );
        activeUserIdRef.current = nextUserId;
        setUserId(nextUserId);
        setAllowOfflineAccess(false);
        setNeedsOnboarding(true);
        setOnboardingChecked(true);
        setNeedsVideoTour(VIDEO_TOUR_ENABLED);
        setManualVideoTourRequested(false);
        setVideoTourChecked(true);
        setIsReady(true);
        traceFirstRun('auth', 'dev_fresh_user_simulator_ready', { userId: nextUserId });
        // The local simulator does not emit Supabase's session-ready event.
        dispatchSignInCurtain('session-ready');
        dispatchSignInCurtain('sign-in-returned');
      } else {
        const { data, error } = await signIn(email, password);
        if (error || !data?.session?.access_token) {
          throw error ?? new Error('Test account did not return a session.');
        }
        const reset = await resetFreshTestAccount();
        await Promise.all([
          clearTourSeenLocally(reset.user_id),
          clearDefaultExperienceCardSeen(reset.user_id),
        ]);
        traceFirstRun('auth', 'dev_test_account_reset_completed', {
          userId: reset.user_id,
        });
        traceFirstRun('auth', 'provider_returned_session', {
          provider: 'dev_test_account',
        });
        dispatchSignInCurtain('sign-in-returned');
      }
    } catch (error) {
      traceFirstRun('auth', 'sign_in_failed', {
        provider: devSimulatorEnabled ? 'dev_fresh_user_simulator' : 'dev_test_account',
        error,
      });
      dispatchSignInCurtain('sign-in-aborted');
      Alert.alert(
        'Test account sign-in failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      finishFreshTestAccountReset();
      setAuthLoading(false);
    }
  }, []);

  const handleBootCurtainOpened = React.useCallback(() => {
    setShowBootCurtain(false);
  }, []);

  const handleDevAccountDelete = React.useCallback(async () => {
    if (!activeUserIdRef.current || !isDevFreshUserSimulatorEnabled()) return;
    const userId = activeUserIdRef.current;
    // Mirror the full local cleanup that simulateFreshUser performs, so a
    // deleted simulated account leaves no AsyncStorage cache or user settings
    // behind (not just the WatermelonDB rows).
    try {
      await clearLocalAccountDataForUser(userId);
    } catch (error) {
      console.warn('[DevAccountDelete] local database cleanup failed:', error);
    }
    try {
      await clearLocalAccountCaches(userId);
    } catch (error) {
      console.warn('[DevAccountDelete] local cache cleanup failed:', error);
    }
    try {
      await clearUserSettings();
    } catch (error) {
      console.warn('[DevAccountDelete] local settings cleanup failed:', error);
    }
    await setAppGroupActiveUserId(null);
    setActiveDevFreshUserId(null);
    activeUserIdRef.current = null;
    setUserId(null);
    setIsReady(true);
  }, []);

  const handleSignInCurtainOpened = React.useCallback(() => {
    dispatchSignInCurtain('animation-completed');
  }, []);

  const handleVideoTourCurtainOpened = React.useCallback(() => {
    setShowVideoTourCurtain(false);
  }, []);

  React.useEffect(() => {
    if (!userId || (!needsVideoTour && !manualVideoTourRequested)) return;
    videoTourEntryOpacity.stopAnimation();
    videoTourEntryOpacity.setValue(0);
    Animated.timing(videoTourEntryOpacity, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [manualVideoTourRequested, needsVideoTour, userId, videoTourEntryOpacity]);

  const shouldRenderVideoTour = Boolean(
    VIDEO_TOUR_ENABLED &&
    userId &&
    !needsOnboarding &&
    (needsVideoTour || manualVideoTourRequested)
  );
  const appSurfaceReady = Boolean(
    isReady && (!userId || (onboardingChecked && videoTourChecked))
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {isReady ? (
          <ShareExtensionProvider>
            <AppTourProvider>
              <ShareExtensionSync userId={userId}>
                {showTourCompletionGreetingLab ? (
                  <TourCompletionGreetingLab
                    onClose={() => setShowTourCompletionGreetingLab(false)}
                  />
                ) : showTourMotionLab ? (
                  <TourMotionLab onClose={() => setShowTourMotionLab(false)} />
                ) : userId && (!onboardingChecked || !videoTourChecked) ? (
                  <AnimatedSplashV2 ready={false} showLogo={false} />
                ) : shouldRenderVideoTour && userId ? (
                  <Animated.View style={[styles.videoTourEntry, { opacity: videoTourEntryOpacity }]}>
                    <VideoTourFlow
                      userId={userId}
                      markSeenOnComplete={!manualVideoTourRequested}
                      preloadedFirstPlayer={
                        preloadedFirstPlayerRef.current ?? undefined
                      }
                      onComplete={() => {
                        traceFirstRun('video_tour', 'completed');
                        if (!manualVideoTourRequested && !needsOnboarding) {
                          setShowVideoTourCurtain(true);
                        }
                        if (!manualVideoTourRequested) {
                          const nextJourney = advanceFirstRunJourney(
                            { stage: 'video-tour' },
                            'video-tour-completed'
                          );
                          setStartTutorialAfterVideoTour(
                            nextJourney.stage === 'tutorial'
                          );
                        }
                        setNeedsVideoTour(false);
                        setManualVideoTourRequested(false);
                        setVideoTourChecked(true);
                        preloadedFirstPlayerRef.current?.release();
                        preloadedFirstPlayerRef.current = null;
                      }}
                    />
                  </Animated.View>
                ) : userId && needsOnboarding ? (
                  <>
                    <OnboardingFlow
                      userId={userId}
                      onComplete={() => {
                        traceFirstRun('onboarding', 'completed_and_routed');
                        const nextJourney = advanceFirstRunJourney(
                          createFirstRunJourney(),
                          'onboarding-completed'
                        );
                        setNeedsOnboarding(false);
                        setOnboardingChecked(true);
                        setNeedsVideoTour(
                          VIDEO_TOUR_ENABLED &&
                            nextJourney.stage === 'video-tour'
                        );
                        setStartTutorialAfterVideoTour(
                          !VIDEO_TOUR_ENABLED
                        );
                        setVideoTourChecked(true);
                        if (
                          nextJourney.stage !== 'video-tour' &&
                          preloadedFirstPlayerRef.current
                        ) {
                          preloadedFirstPlayerRef.current.release();
                          preloadedFirstPlayerRef.current = null;
                        }
                      }}
                    />
                    <FirstTourVideoPreloader
                      enabled={VIDEO_TOUR_ENABLED}
                      onPlayerReady={handleFirstTourPlayerReady}
                    />
                  </>
                ) : userId ? (
                  <RootNavigator
                    key={`${userId}:${
                      startTutorialAfterVideoTour ? 'interactive-tutorial' : 'app'
                    }`}
                    isExpoGo={isExpoGo}
                    startTutorialOnMount={startTutorialAfterVideoTour}
                    onTutorialStarted={() => setStartTutorialAfterVideoTour(false)}
                    onDevAccountDelete={handleDevAccountDelete}
                    onReplayVideoTutorial={() => {
                      if (VIDEO_TOUR_ENABLED) {
                        setManualVideoTourRequested(true);
                        return;
                      }
                      Alert.alert(
                        'Tutorial 暫時關閉',
                        'Video tutorial 目前在 TestFlight 上造成原生播放器 crash，已暫時關閉。'
                      );
                    }}
                  />
                ) : (
                  <AuthGate
                    onPressGoogle={handleGoogleSignIn}
                    onPressApple={handleAppleSignIn}
                    onPressTestAccount={handleTestAccountSignIn}
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
          <AnimatedSplashV2 ready={appSurfaceReady} onAnimationComplete={handleBootCurtainOpened} />
        ) : null}
        {signInCurtain.visible ? (
          <AnimatedSplashV2
            ready={signInCurtain.ready}
            onAnimationComplete={handleSignInCurtainOpened}
          />
        ) : null}
        {showVideoTourCurtain ? (
          <AnimatedSplashV2
            ready={true}
            onAnimationComplete={handleVideoTourCurtainOpened}
          />
        ) : null}
        <GlobalThemeCrossFadeOverlay />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  videoTourEntry: {
    flex: 1,
  },
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
  devTestAccountButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(78,175,244,0.18)',
    borderColor: 'rgba(217,241,255,0.45)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  devTestAccountButtonText: {
    color: '#D9F1FF',
    fontSize: 13,
    fontWeight: '700',
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
