import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator, Alert } from 'react-native';
import { useEffect, useState } from 'react';
import { database } from './src/database';
import { supabase } from './src/services/supabase/client';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [dbStatus, setDbStatus] = useState('Initializing...');
  const [supabaseStatus, setSupabaseStatus] = useState('Checking...');

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Test WatermelonDB
      setDbStatus('Testing WatermelonDB...');
      const profiles = await database.get('profiles').query().fetch();
      setDbStatus(`✅ WatermelonDB OK (${profiles.length} profiles)`);

      // Test Supabase connection
      setSupabaseStatus('Testing Supabase...');
      const { data, error } = await supabase.from('profiles').select('count');
      
      if (error) {
        setSupabaseStatus(`⚠️ Supabase: ${error.message}`);
        console.warn('Supabase connection warning:', error);
      } else {
        setSupabaseStatus('✅ Supabase Connected');
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
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.statusText}>{dbStatus}</Text>
        <Text style={styles.statusText}>{supabaseStatus}</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎉 Nuances App</Text>
      <Text style={styles.subtitle}>MVP Development Started</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>{dbStatus}</Text>
        <Text style={styles.statusText}>{supabaseStatus}</Text>
      </View>

      <Text style={styles.infoText}>
        Ready to build amazing features! 🚀
      </Text>
      
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 30,
  },
  statusContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    marginVertical: 20,
    minWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusText: {
    fontSize: 14,
    color: '#444',
    marginVertical: 5,
    fontFamily: 'monospace',
  },
  infoText: {
    fontSize: 16,
    color: '#888',
    marginTop: 20,
    textAlign: 'center',
  },
});
