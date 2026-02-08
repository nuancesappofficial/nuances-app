import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useState } from 'react';

export default function App() {
  const [items, setItems] = useState<any[]>([]);

  const handleAddItem = () => {
    Alert.alert(
      '⚠️ Development Build Required',
      'This app requires a Development Build to use WatermelonDB.\n\n' +
      'Currently running in Expo Go which does not support custom native modules.\n\n' +
      'What you can see:\n' +
      '✅ UI is working\n' +
      '✅ All screens are built\n' +
      '✅ Database logic is ready\n\n' +
      'Next step: Create EAS Development Build to enable full functionality.',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📚 Nuances MVP</Text>
        <Text style={styles.headerSubtitle}>Demo Version (Expo Go)</Text>
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>🎉 App Successfully Loaded!</Text>
        
        <Text style={styles.sectionTitle}>✅ What's Working:</Text>
        <Text style={styles.bullet}>• UI/UX Design Complete</Text>
        <Text style={styles.bullet}>• Cache List Screen Built</Text>
        <Text style={styles.bullet}>• Add Item Screen Built</Text>
        <Text style={styles.bullet}>• WatermelonDB Integration Ready</Text>
        <Text style={styles.bullet}>• Supabase Backend Designed</Text>
        
        <Text style={styles.sectionTitle}>⚠️ Why Limited in Expo Go:</Text>
        <Text style={styles.description}>
          WatermelonDB requires native code (JSI interface) which Expo Go doesn't support.
        </Text>
        
        <Text style={styles.sectionTitle}>🚀 Next Step:</Text>
        <Text style={styles.description}>
          Create a Development Build using EAS Build to enable full database functionality.
        </Text>
        
        <Text style={styles.command}>
          npx eas build --profile development --platform ios
        </Text>
      </View>

      {/* Demo Button */}
      <TouchableOpacity style={styles.demoButton} onPress={handleAddItem}>
        <Text style={styles.demoButtonText}>📱 View Full Features Info</Text>
      </TouchableOpacity>

      {/* GitHub Link */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          All code is on GitHub! 🎯
        </Text>
        <Text style={styles.githubLink}>
          jeffenglishlearning-collab/nuances-app
        </Text>
      </View>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#4CAF50',
    padding: 20,
    paddingTop: 60,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginTop: 4,
  },
  infoCard: {
    margin: 16,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  bullet: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  command: {
    fontSize: 12,
    color: '#2196F3',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    fontFamily: 'monospace',
    marginTop: 8,
  },
  demoButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#2196F3',
    borderRadius: 12,
    alignItems: 'center',
  },
  demoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  footer: {
    alignItems: 'center',
    padding: 16,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  githubLink: {
    fontSize: 12,
    color: '#2196F3',
    fontFamily: 'monospace',
  },
});
