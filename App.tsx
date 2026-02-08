import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Alert,
  Modal,
  TouchableOpacity,
  Text,
} from 'react-native';
import { useEffect, useState } from 'react';
import { database } from './src/database';
import { supabase } from './src/services/supabase/client';
import CacheListScreen from './src/screens/CacheListScreen';
import AddCacheItemScreen from './src/screens/AddCacheItemScreen';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const handleItemSaved = () => {
    setRefreshKey((prev) => prev + 1);
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
    <View style={styles.container}>
      <CacheListScreen key={refreshKey} />

      {/* Floating Add Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddModal(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Add Item Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <AddCacheItemScreen
          onClose={() => setShowAddModal(false)}
          onSaved={handleItemSaved}
        />
      </Modal>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  fabText: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '300',
  },
});
