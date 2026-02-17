// App.tsx - Expo Go Compatible Version
// This version works in Expo Go by using mock data instead of WatermelonDB

import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import React, { useEffect, useState } from 'react';
import RootNavigator from './src/navigation/RootNavigator';
import { useShareExtension } from './src/hooks/useShareExtension';
import { ShareExtensionProvider } from './src/contexts/ShareExtensionContext';

// Check if we're running in Expo Go
const isExpoGo = !global.HermesInternal;

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

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      if (isExpoGo) {
        // In Expo Go, skip database initialization
        console.log('✅ Running in Expo Go mode (UI preview only)');
        setUserId('demo-user'); // Demo user for Expo Go
      } else {
        // In Development Build, initialize database
        const { database } = await import('./src/database');
        
        const profiles = await database.get('profiles').query().fetch();
        console.log(`✅ WatermelonDB initialized (${profiles.length} profiles)`);

        // 設定當前用戶 ID（實際應從 auth 取得）
        if (profiles.length > 0) {
          setUserId(profiles[0].userId);
        } else {
          setUserId('demo-user');
        }

        // 測試數據已停用 - 使用真實用戶數據
        // 如需測試數據，請手動調用 seedTestData()
      }

      setIsReady(true);
    } catch (error) {
      console.error('Initialization error:', error);
      setIsReady(true); // Continue anyway
    }
  };

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
        <RootNavigator isExpoGo={isExpoGo} />
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
});
