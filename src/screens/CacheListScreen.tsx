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
import type CachedItem from '@database/models/CachedItem';
import { Q } from '@nozbe/watermelondb';

/** WatermelonDB @json 讀出時可能已是陣列，避免對陣列做 JSON.parse 導致閃退 */
function getAnnotationsArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }
  return [];
}

type Props = {
  navigation: any;
};

export default function CacheListScreen({ navigation }: Props) {
  const [refreshing, setRefreshing] = React.useState(false);
  const [cachedItems, setCachedItems] = React.useState<CachedItem[]>([]);

  // Query cached items (not deleted, not converted, ordered by creation date)
  React.useEffect(() => {
    const query = database
      .get<CachedItem>('cached_items')
      .query(
        Q.where('deleted_at', null),
        Q.where('converted_to_card', false), // 只顯示未轉換的項目
        Q.sortBy('created_at', Q.desc)
      );

    // Initial fetch
    const fetchInitial = async () => {
      try {
        const data = await query.fetch();
        console.log('[CacheList] Fetched items (excluding converted):', data.length);
        setCachedItems(data);
      } catch (error) {
        console.error('Error fetching cached items:', error);
        setCachedItems([]);
      }
    };

    fetchInitial();

    // Subscribe to changes
    const subscription = query.observe().subscribe((data) => {
      console.log('[CacheList] Updated items:', data.length);
      setCachedItems(data);
    });

    return () => subscription.unsubscribe();
  }, []);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Trigger sync here in the future
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // 刪除快取項目
  const handleDelete = async (item: CachedItem) => {
    Alert.alert(
      '刪除快取',
      '確定要刪除這個快取項目嗎？',
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
              console.log('[CacheList] Item deleted:', item.id);
            } catch (error) {
              console.error('[CacheList] Error deleting item:', error);
              Alert.alert('錯誤', '刪除失敗，請重試');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: CachedItem }) => (
    <View style={styles.itemContainer}>
      <View style={styles.itemHeader}>
        <Text style={styles.contentType}>{item.contentType.toUpperCase()}</Text>
        {item.sourceApp && (
          <Text style={styles.sourceApp}>{item.sourceApp}</Text>
        )}
        {/* 刪除按鈕 */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item)}
        >
          <Text style={styles.deleteButtonText}>🗑️</Text>
        </TouchableOpacity>
      </View>

      {/* 圖片預覽 */}
      {item.contentType === 'image' && item.imageStoragePath && (
        <View style={styles.imagePreviewContainer}>
          <Image
            source={{ uri: item.imageStoragePath }}
            style={styles.previewImage}
            resizeMode="cover"
          />
          {getAnnotationsArray(item.imageAnnotations).length > 0 && (
            <View style={styles.annotationBadge}>
              <Text style={styles.annotationBadgeText}>
                ✏️ {getAnnotationsArray(item.imageAnnotations).length} 個單字
              </Text>
            </View>
          )}
        </View>
      )}

      <Text style={styles.contentText} numberOfLines={3}>
        {item.contentText || (item.contentType === 'image' ? '圖片內容' : item.contentUrl) || 'No content'}
      </Text>

      {item.userKeywords && (
        <Text style={styles.keywords}>🔑 {item.userKeywords}</Text>
      )}

      <View style={styles.itemFooter}>
        <View style={styles.itemFooterLeft}>
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
        
        {/* 創建卡片按鈕 */}
        {!item.convertedToCard && (
          <TouchableOpacity
            style={styles.createCardButton}
            onPress={() => navigation.navigate('CreateCard', { cachedItem: item })}
          >
            <Text style={styles.createCardButtonText}>📇 創建卡片</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
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
        <View>
          <Text style={styles.headerTitle}>📚 My Cache</Text>
          <Text style={styles.headerSubtitle}>
            {cachedItems?.length || 0} items
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddCacheItem')}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
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
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  addButtonText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
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
    flex: 1,
    marginLeft: 8,
  },
  deleteButton: {
    padding: 4,
    marginLeft: 8,
  },
  deleteButtonText: {
    fontSize: 18,
  },
  imagePreviewContainer: {
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#f0f0f0',
  },
  annotationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  annotationBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
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
  itemFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'wrap',
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
  createCardButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  createCardButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
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
