// App.tsx - Expo Go Compatible Version
// This version works in Expo Go by using mock data instead of WatermelonDB

import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import React, { useEffect, useState } from 'react';
import RootNavigator from './src/navigation/RootNavigator';
import { useShareExtension } from './src/hooks/useShareExtension';
import { ShareExtensionProvider } from './src/contexts/ShareExtensionContext';
import {
  completeOAuthFromUrl,
  getCurrentSession,
  signInWithGoogle,
  supabase,
} from './src/services/supabase/client';

// Check if we're running in Expo Go
const isExpoGo = !('HermesInternal' in globalThis);

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

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      if (isExpoGo) {
        console.log('✅ Running in Expo Go mode');
      }

      const { session } = await getCurrentSession();
      setUserId(session?.user?.id ?? null);

      setIsReady(true);
    } catch (error) {
      console.error('Initialization error:', error);
      setIsReady(true); // Continue anyway
    }
  };

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const handleOAuthCallback = React.useCallback(async (url: string) => {
    if (!url.includes('auth/callback')) return;
    const { error, handled } = await completeOAuthFromUrl(url);
    if (handled && error) {
      Alert.alert('登入失敗', error.message);
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

  const handleGoogleSignIn = React.useCallback(async () => {
    setAuthLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        Alert.alert(
          '登入失敗',
          `Google OAuth 問題：${error.message}\n\n請檢查 Supabase Google Provider 與 Google Cloud OAuth 設定。`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知錯誤';
      Alert.alert('登入失敗', message);
    } finally {
      setAuthLoading(false);
    }
  }, []);

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
    <ShareExtensionProvider>
      <ShareExtensionSync userId={userId}>
        {userId ? (
          <RootNavigator isExpoGo={isExpoGo} />
        ) : (
          <AuthGate onPressGoogle={handleGoogleSignIn} loading={authLoading} />
        )}
      </ShareExtensionSync>
      <StatusBar style="auto" />
    </ShareExtensionProvider>
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
