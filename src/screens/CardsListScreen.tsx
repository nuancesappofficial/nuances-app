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
import type Card from '@database/models/Card';
import { Q } from '@nozbe/watermelondb';

export default function CardsListScreen() {
  const [refreshing, setRefreshing] = React.useState(false);
  const [filter, setFilter] = React.useState<'all' | 'due'>('all');

  // Query cards
  const allCardsQuery = database
    .get<Card>('cards')
    .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

  const dueCardsQuery = database
    .get<Card>('cards')
    .query(
      Q.where('deleted_at', null),
      Q.where('next_review_at', Q.lte(Date.now())),
      Q.sortBy('next_review_at', Q.asc)
    );

  const cards = useDatabase(filter === 'all' ? allCardsQuery : dueCardsQuery);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const renderItem = ({ item }: { item: Card }) => {
    const isDue = new Date(item.nextReviewAt) <= new Date();

    return (
      <TouchableOpacity style={styles.cardContainer}>
        <View style={styles.cardHeader}>
          <Text style={styles.targetWord}>{item.targetWord}</Text>
          {isDue && <View style={styles.dueBadge}><Text style={styles.dueBadgeText}>待複習</Text></View>}
        </View>

        {item.targetPhrase && (
          <Text style={styles.targetPhrase}>{item.targetPhrase}</Text>
        )}

        <Text style={styles.originalSentence} numberOfLines={2}>
          {item.originalSentence}
        </Text>

        <Text style={styles.definition} numberOfLines={2}>
          {item.definition}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.srsInfo}>
            複習次數: {item.repetitions} | 間隔: {item.intervalDays}天
          </Text>
          {item.lastReviewedAt && (
            <Text style={styles.lastReview}>
              上次: {new Date(item.lastReviewedAt).toLocaleDateString()}
            </Text>
          )}
        </View>

        {item.tags && item.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {item.tags.slice(0, 3).map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📇</Text>
      <Text style={styles.emptyTitle}>No cards yet</Text>
      <Text style={styles.emptyText}>
        Create cards from your cached items to start learning!
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📇 My Cards</Text>
        <Text style={styles.headerSubtitle}>
          {cards?.length || 0} cards total
        </Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
            All Cards
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'due' && styles.filterTabActive]}
          onPress={() => setFilter('due')}
        >
          <Text style={[styles.filterTabText, filter === 'due' && styles.filterTabTextActive]}>
            Due for Review
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={cards}
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
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  filterTabActive: {
    backgroundColor: '#2196F3',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
  },
  cardContainer: {
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  targetWord: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  dueBadge: {
    backgroundColor: '#FF5722',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  dueBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  targetPhrase: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  originalSentence: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  definition: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  srsInfo: {
    fontSize: 12,
    color: '#999',
  },
  lastReview: {
    fontSize: 12,
    color: '#999',
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 8,
  },
  tag: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 11,
    color: '#2196F3',
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
