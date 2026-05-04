// App.tsx - Expo Go Compatible Version
// This version works in Expo Go by using mock data instead of WatermelonDB

import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Alert,
  Linking,
  AppState,
  Modal,
  useColorScheme,
  type AppStateStatus,
} from 'react-native';
import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RootNavigator from './src/navigation/RootNavigator';
import { useShareExtension } from './src/hooks/useShareExtension';
import { ShareExtensionProvider } from './src/contexts/ShareExtensionContext';
import { purgeExpiredFreeCacheOnForeground } from './src/database/cacheLifecycle';
import {
  completeOAuthFromUrl,
  getCurrentUser,
  getCurrentSession,
  signInWithGoogle,
  supabase,
} from './src/services/supabase/client';
import { resolveThemeColors } from './src/theme/colors';

// Check if we're running in Expo Go
const isExpoGo = !('HermesInternal' in globalThis);
WebBrowser.maybeCompleteAuthSession();

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

function AuthGate({ onPressGoogle, loading }: { onPressGoogle: () => void; loading: boolean }) {
  return (
    <View style={styles.authContainer}>
      <Text style={styles.authTitle}>Nuances</Text>
      <Text style={styles.authSubtitle}>先登入一次，之後測試不需要每次重登入。</Text>
      <TouchableOpacity
        style={[styles.googleButton, loading && styles.googleButtonDisabled]}
        onPress={onPressGoogle}
        disabled={loading}
      >
        <Text style={styles.googleButtonText}>
          {loading ? '連線中...' : '使用 Google 登入'}
        </Text>
      </TouchableOpacity>
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
  const [isReady, setIsReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [allowOfflineAccess, setAllowOfflineAccess] = useState(false);
  const lastHandledOAuthUrlRef = React.useRef<string | null>(null);
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);

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
        setUserId(user?.id ?? null);
      } else {
        setUserId(null);
      }

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
      setIsReady(true); // Continue anyway
    }
  };

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.access_token) {
        setUserId(null);
        return;
      }
      void (async () => {
        const { user } = await getCurrentUser();
        setUserId(user?.id ?? null);
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

    const { error, handled } = await completeOAuthFromUrl(url);
    if (handled && error) {
      Alert.alert('登入失敗', error.message);
      return;
    }
    if (handled && !error) {
      Alert.alert('登入成功', 'Google 帳號登入成功。');
    }
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleOAuthCallback(url);
    });

    Linking.getInitialURL().then((url) => {
      if (url) {
        void handleOAuthCallback(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [handleOAuthCallback]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      if (wasBackground && nextAppState === 'active' && userId) {
        void purgeExpiredFreeCacheOnForeground(userId).catch((error) => {
          console.error('[CacheLifecycle] Foreground cleanup failed:', error);
        });
      }
      appStateRef.current = nextAppState;
    });
    return () => {
      subscription.remove();
    };
  }, [userId]);

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

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading Nuances...</Text>
        {isExpoGo && (
          <Text style={styles.previewText}>
            📱 Expo Go Preview Mode{'\n'}
            (UI only - database disabled)
          </Text>
        )}
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ShareExtensionProvider>
          <ShareExtensionSync userId={userId}>
            {userId || allowOfflineAccess ? (
              <RootNavigator isExpoGo={isExpoGo} />
            ) : (
              <AuthGate onPressGoogle={handleGoogleSignIn} loading={authLoading} />
            )}
          </ShareExtensionSync>
          <StatusBar style="auto" />
        </ShareExtensionProvider>
        <GlobalThemeCrossFadeOverlay />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  previewText: {
    marginTop: 16,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  authTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#222',
    marginBottom: 12,
  },
  themeFadeOverlay: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
  },
  authSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  googleButton: {
    backgroundColor: '#1a73e8',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
