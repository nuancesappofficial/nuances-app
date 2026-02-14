import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import type CachedItem from '@database/models/CachedItem';
import { Q } from '@nozbe/watermelondb';

type Props = {
  navigation: any;
};

// Separate component to handle individual card items with hooks
function CardItem({ 
  item, 
  navigation, 
  onDelete 
}: { 
  item: Card; 
  navigation: any; 
  onDelete: (item: Card) => void;
}) {
  const [cachedItem, setCachedItem] = React.useState<CachedItem | null>(null);
  const isDue = new Date(item.nextReviewAt) <= new Date();

  // Fetch associated cachedItem if exists
  React.useEffect(() => {
    const fetchCachedItem = async () => {
      if (item.cachedItemId) {
        try {
          const cached = await database
            .get<CachedItem>('cached_items')
            .find(item.cachedItemId);
          setCachedItem(cached);
        } catch (error) {
          console.error('[CardsList] Error fetching cached item:', error);
        }
      }
    };
    fetchCachedItem();
  }, [item.cachedItemId]);

  return (
    <View style={styles.cardContainer}>
      <TouchableOpacity 
        onPress={() => navigation.navigate('CardReview', { card: item })}
        style={styles.cardContent}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.targetWord}>{item.targetWord}</Text>
          <View style={styles.cardHeaderRight}>
            {isDue && <View style={styles.dueBadge}><Text style={styles.dueBadgeText}>待複習</Text></View>}
            {/* 刪除按鈕 */}
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => onDelete(item)}
            >
              <Text style={styles.deleteButtonText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 圖片預覽 */}
        {cachedItem?.contentType === 'image' && cachedItem.imageStoragePath && (
          <View style={styles.imagePreviewContainer}>
            <Image
              source={{ uri: cachedItem.imageStoragePath }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          </View>
        )}

        {item.targetPhrase && (
          <Text style={styles.targetPhrase}>{item.targetPhrase}</Text>
        )}

        {/* 只顯示文字內容，過濾掉 file:// 路徑 */}
        {item.originalSentence && !item.originalSentence.startsWith('file://') && (
          <Text style={styles.originalSentence} numberOfLines={2}>
            {item.originalSentence}
          </Text>
        )}

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
            {JSON.parse(item.tags).slice(0, 3).map((tag: string, index: number) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function CardsListScreen({ navigation }: Props) {
  const [refreshing, setRefreshing] = React.useState(false);
  const [filter, setFilter] = React.useState<'all' | 'due'>('all');
  const [cards, setCards] = React.useState<Card[]>([]);

  // Query cards based on filter
  React.useEffect(() => {
    let query;
    
    if (filter === 'all') {
      query = database
        .get<Card>('cards')
        .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));
    } else {
      query = database
        .get<Card>('cards')
        .query(
          Q.where('deleted_at', null),
          Q.where('next_review_at', Q.lte(Date.now())),
          Q.sortBy('next_review_at', Q.asc)
        );
    }

    // Initial fetch
    const fetchInitial = async () => {
      try {
        const data = await query.fetch();
        setCards(data);
      } catch (error) {
        console.error('Error fetching cards:', error);
        setCards([]);
      }
    };

    fetchInitial();

    // Subscribe to changes
    const subscription = query.observe().subscribe((data) => {
      setCards(data);
    });

    return () => subscription.unsubscribe();
  }, [filter]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // 刪除卡片
  const handleDelete = async (item: Card) => {
    Alert.alert(
      '刪除卡片',
      '確定要刪除這張卡片嗎？這個操作無法復原。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: async () => {
            try {
              await database.write(async () => {
                await item.update((record) => {
                  record.deletedAt = new Date();
                });
              });
              console.log('[CardsList] Card deleted:', item.id);
            } catch (error) {
              console.error('[CardsList] Error deleting card:', error);
              Alert.alert('錯誤', '刪除失敗，請重試');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Card }) => {
    return <CardItem item={item} navigation={navigation} onDelete={handleDelete} />;
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

  const startReview = async () => {
    // Get the first due card
    const dueCards = await database
      .get<Card>('cards')
      .query(
        Q.where('deleted_at', null),
        Q.where('next_review_at', Q.lte(Date.now())),
        Q.sortBy('next_review_at', Q.asc)
      )
      .fetch();

    if (dueCards.length > 0) {
      navigation.navigate('CardReview', { card: dueCards[0] });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>📇 My Cards</Text>
          <Text style={styles.headerSubtitle}>
            {cards?.length || 0} cards total
          </Text>
        </View>
        {cards.filter(c => new Date(c.nextReviewAt) <= new Date()).length > 0 && (
          <TouchableOpacity
            style={styles.reviewButton}
            onPress={startReview}
          >
            <Text style={styles.reviewButtonText}>開始複習</Text>
          </TouchableOpacity>
        )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  reviewButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FF5722',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  reviewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
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
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  targetWord: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 18,
  },
  imagePreviewContainer: {
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 150,
    backgroundColor: '#f0f0f0',
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
