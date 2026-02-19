// App.tsx - Expo Go Compatible Version
// This version works in Expo Go by using mock data instead of WatermelonDB

import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { useEffect, useState } from 'react';
import RootNavigator from './src/navigation/RootNavigator';

// Check if we're running in Expo Go
const isExpoGo = !('HermesInternal' in globalThis);

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      if (isExpoGo) {
        // In Expo Go, skip database initialization
        console.log('✅ Running in Expo Go mode (UI preview only)');
      } else {
        // In Development Build, initialize database
        const { database } = await import('./src/database');
        const profiles = await database.get('profiles').query().fetch();
        console.log(`✅ WatermelonDB initialized (${profiles.length} profiles)`);
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
    <>
      <RootNavigator isExpoGo={isExpoGo} />
      <StatusBar style="auto" />
    </>
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
