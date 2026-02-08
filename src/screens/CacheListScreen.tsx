import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { database } from '@database/index';
import { useDatabase } from '@hooks/useDatabase';
import type CachedItem from '@database/models/CachedItem';
import { Q } from '@nozbe/watermelondb';

export default function CacheListScreen() {
  const [refreshing, setRefreshing] = React.useState(false);

  // Query cached items (not deleted, ordered by creation date)
  const cachedItemsQuery = database
    .get<CachedItem>('cached_items')
    .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

  const cachedItems = useDatabase(cachedItemsQuery);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Trigger sync here in the future
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const renderItem = ({ item }: { item: CachedItem }) => (
    <TouchableOpacity style={styles.itemContainer}>
      <View style={styles.itemHeader}>
        <Text style={styles.contentType}>{item.contentType.toUpperCase()}</Text>
        {item.sourceApp && (
          <Text style={styles.sourceApp}>{item.sourceApp}</Text>
        )}
      </View>

      <Text style={styles.contentText} numberOfLines={3}>
        {item.contentText || item.contentUrl || 'No content'}
      </Text>

      {item.userKeywords && (
        <Text style={styles.keywords}>🔑 {item.userKeywords}</Text>
      )}

      <View style={styles.itemFooter}>
        <Text style={styles.timestamp}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
        {item.aiAnalysisCompleted && (
          <Text style={styles.badge}>✓ AI Analyzed</Text>
        )}
        {item.convertedToCard && (
          <Text style={styles.badge}>📇 Card Created</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📦</Text>
      <Text style={styles.emptyTitle}>No cached items yet</Text>
      <Text style={styles.emptyText}>
        Share content from other apps to start building your vocabulary!
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📚 My Cache</Text>
        <Text style={styles.headerSubtitle}>
          {cachedItems?.length || 0} items
        </Text>
      </View>

      <FlatList
        data={cachedItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
  },
  itemContainer: {
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
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  contentType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  sourceApp: {
    fontSize: 12,
    color: '#999',
  },
  contentText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },
  keywords: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  badge: {
    fontSize: 11,
    color: '#2196F3',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});
