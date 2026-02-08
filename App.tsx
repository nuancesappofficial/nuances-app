import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Alert,
  Text,
} from 'react-native';
import { useEffect, useState } from 'react';
import { database } from './src/database';
import { supabase } from './src/services/supabase/client';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Test WatermelonDB
      const profiles = await database.get('profiles').query().fetch();
      console.log(`✅ WatermelonDB initialized (${profiles.length} profiles)`);

      // Test Supabase connection (optional for MVP)
      try {
        const { error } = await supabase.from('profiles').select('count');
        if (error) {
          console.warn('Supabase connection warning:', error.message);
        } else {
          console.log('✅ Supabase connected');
        }
      } catch (err) {
        console.warn('Supabase not configured yet, continuing with local DB');
      }

      setIsReady(true);
    } catch (error) {
      console.error('Initialization error:', error);
      Alert.alert(
        'Initialization Error',
        error instanceof Error ? error.message : 'Unknown error'
      );
      setIsReady(true); // Continue anyway
    }
  };

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading Nuances...</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <>
      <RootNavigator />
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
});

