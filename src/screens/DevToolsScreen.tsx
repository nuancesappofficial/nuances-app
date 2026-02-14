// 開發工具畫面 - 用於測試和數據管理
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { clearAllData, clearTestDataOnly } from '../database/clearData';
import { seedTestData } from '../database/seedTestData';
import { database } from '../database';

type Props = {
  navigation: any;
};

export default function DevToolsScreen({ navigation }: Props) {
  const [stats, setStats] = React.useState({
    profiles: 0,
    cachedItems: 0,
    cards: 0,
    reviewHistory: 0,
  });
  const [loading, setLoading] = React.useState(false);

  const loadStats = async () => {
    try {
      const profiles = await database.get('profiles').query().fetch();
      const cachedItems = await database.get('cached_items').query().fetch();
      const cards = await database.get('cards').query().fetch();
      const reviewHistory = await database.get('review_history').query().fetch();

      setStats({
        profiles: profiles.length,
        cachedItems: cachedItems.length,
        cards: cards.length,
        reviewHistory: reviewHistory.length,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  React.useEffect(() => {
    loadStats();
  }, []);

  const handleClearAll = () => {
    Alert.alert(
      '確認清除',
      '將清除所有數據（包括用戶數據）。此操作不可撤銷！',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            const result = await clearAllData();
            setLoading(false);
            
            if (result.success) {
              Alert.alert('成功', '所有數據已清除');
              loadStats();
            } else {
              Alert.alert('錯誤', '清除失敗');
            }
          },
        },
      ]
    );
  };

  const handleClearTestData = () => {
    Alert.alert(
      '確認清除',
      '將清除測試數據（test-user-001 和 demo-user）。保留其他用戶數據。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            const result = await clearTestDataOnly();
            setLoading(false);
            
            if (result.success) {
              Alert.alert('成功', '測試數據已清除');
              loadStats();
            } else {
              Alert.alert('錯誤', '清除失敗');
            }
          },
        },
      ]
    );
  };

  const handleSeedData = () => {
    Alert.alert(
      '確認植入',
      '將植入測試數據（4 個快取項目 + 5 張卡片）',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '植入',
          onPress: async () => {
            setLoading(true);
            const result = await seedTestData();
            setLoading(false);
            
            if (result.success) {
              Alert.alert('成功', '測試數據已植入');
              loadStats();
            } else {
              Alert.alert('錯誤', '植入失敗');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>開發工具</Text>
        <TouchableOpacity onPress={loadStats} style={styles.refreshButton}>
          <Text style={styles.refreshButtonText}>🔄</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* 數據統計 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 數據統計</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.profiles}</Text>
              <Text style={styles.statLabel}>Profiles</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.cachedItems}</Text>
              <Text style={styles.statLabel}>快取項目</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.cards}</Text>
              <Text style={styles.statLabel}>卡片</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.reviewHistory}</Text>
              <Text style={styles.statLabel}>複習記錄</Text>
            </View>
          </View>
        </View>

        {/* 數據管理 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🗑️ 數據管理</Text>
          
          <TouchableOpacity
            style={[styles.button, styles.buttonWarning]}
            onPress={handleClearTestData}
            disabled={loading}
          >
            <Text style={styles.buttonText}>清除測試數據</Text>
            <Text style={styles.buttonSubtext}>
              刪除 test-user-001 和 demo-user 的數據
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonDanger]}
            onPress={handleClearAll}
            disabled={loading}
          >
            <Text style={styles.buttonText}>清除所有數據</Text>
            <Text style={styles.buttonSubtext}>⚠️ 不可撤銷！</Text>
          </TouchableOpacity>
        </View>

        {/* 測試數據 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌱 測試數據</Text>
          
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={handleSeedData}
            disabled={loading}
          >
            <Text style={styles.buttonText}>植入測試數據</Text>
            <Text style={styles.buttonSubtext}>
              4 個快取項目 + 5 張卡片
            </Text>
          </TouchableOpacity>
        </View>

        {/* 說明 */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 提示：此畫面僅用於開發和測試。正式版本將移除。
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: '#333',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  refreshButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonText: {
    fontSize: 20,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonPrimary: {
    backgroundColor: '#4CAF50',
  },
  buttonWarning: {
    backgroundColor: '#FF9800',
  },
  buttonDanger: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  buttonSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
  infoBox: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
});
