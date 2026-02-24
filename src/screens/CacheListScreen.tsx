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
  AppState,
  AppStateStatus,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { database } from '@database/index';
import type CachedItem from '@database/models/CachedItem';
import { Q } from '@nozbe/watermelondb';
import { pasteTextFromClipboard } from '@services/clipboard/clipboardService';
import { getCurrentAuthUserId } from '@services/auth/userIdentity';
import { getSyncErrorMessage, syncWithRetry } from '@services/sync';
import { loadUserSettings } from '@services/settings/userSettings';
import SubscriptionService from '@services/subscription/SubscriptionService';
import { useShareExtensionSnackbar } from '../contexts/ShareExtensionContext';

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

const SNACKBAR_DURATION = 2500;
const CREATE_CARD_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FREE_CACHE_ITEM_LIMIT = 10;
const FREE_CACHE_TTL_MS = 10 * 60 * 1000;
const PREMIUM_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getDisplayExpiry(item: CachedItem, isPremiumUser: boolean): number {
  const expiresAt = item.expiresAt ? new Date(item.expiresAt).getTime() : NaN;
  if (Number.isFinite(expiresAt)) return expiresAt;
  const createdAt = new Date(item.createdAt).getTime();
  const ttl = isPremiumUser ? PREMIUM_CACHE_TTL_MS : FREE_CACHE_TTL_MS;
  return createdAt + ttl;
}

function formatRemainingTime(targetTs: number, nowTs: number): string {
  const diffMs = targetTs - nowTs;
  if (diffMs <= 0) return '已到期';
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}天 ${hours}小時`;
  if (hours > 0) return `${hours}小時 ${minutes}分`;
  return `${minutes}分`;
}

export default function CacheListScreen({ navigation }: Props) {
  const [refreshing, setRefreshing] = React.useState(false);
  const [cachedItems, setCachedItems] = React.useState<CachedItem[]>([]);
  const [isPremiumUser, setIsPremiumUser] = React.useState(false);
  const [nowTs, setNowTs] = React.useState(Date.now());
  const [snackbarVisible, setSnackbarVisible] = React.useState(false);
  const [clipboardMode, setClipboardMode] = React.useState<'active' | 'passive'>('passive');
  const snackbarOpacity = React.useRef(new Animated.Value(0)).current;
  const lastProcessedClipboard = React.useRef<string>('');
  const appState = React.useRef(AppState.currentState);
  const isScreenFocused = React.useRef(false);
  const isCheckingClipboard = React.useRef(false);
  const lastCheckTime = React.useRef(0);
  const isSyncing = React.useRef(false);
  const { consumeShareSnackbar } = useShareExtensionSnackbar();

  const [snackbarMessage, setSnackbarMessage] = React.useState('卡片已建立');

  const hasValidCreateCardDraft = React.useCallback(async (item: CachedItem): Promise<boolean> => {
    try {
      const key = `create_card_draft:${item.userId}:${item.id}`;
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { updatedAt?: number };
      if (typeof parsed.updatedAt !== 'number') return false;
      return Date.now() - parsed.updatedAt <= CREATE_CARD_DRAFT_TTL_MS;
    } catch {
      return false;
    }
  }, []);

  const handleOpenCachedItem = React.useCallback(
    async (item: CachedItem) => {
      const isExpired = Date.now() > getDisplayExpiry(item, isPremiumUser);
      if (!isPremiumUser && isExpired) {
        Alert.alert(
          '此快取已到期',
          '升級訂閱即可重新使用已到期快取。',
          [
            { text: '稍後', style: 'cancel' },
            {
              text: '前往設定',
              onPress: () => navigation.navigate('Settings'),
            },
          ]
        );
        return;
      }

      const hasDraft = await hasValidCreateCardDraft(item);
      if (hasDraft) {
        navigation.navigate('CreateCard', { cachedItem: item });
        return;
      }

      if (item.contentType === 'image') {
        navigation.navigate('AddCacheItem', {
          cachedItem: item,
          openCropOnLoad: false,
        });
        return;
      }

      navigation.navigate('CreateCard', { cachedItem: item });
    },
    [hasValidCreateCardDraft, isPremiumUser, navigation]
  );

  const showSnackbar = React.useCallback((message?: string) => {
    setSnackbarMessage(message ?? '卡片已建立');
    setSnackbarVisible(true);
    Animated.sequence([
      Animated.timing(snackbarOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(SNACKBAR_DURATION),
      Animated.timing(snackbarOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setSnackbarVisible(false));
  }, [snackbarOpacity]);

  // 僅在用戶手動點擊「貼上」時讀取剪貼簿，避免自動觸發 iOS 貼上權限彈窗。
  const checkClipboard = React.useCallback(async (interactive = false) => {
    const now = Date.now();
    if (isCheckingClipboard.current || now - lastCheckTime.current < 1000) {
      return;
    }

    isCheckingClipboard.current = true;
    lastCheckTime.current = now;

    try {
      // 直接讀取剪貼簿 → 觸發 iOS「Nuances 想要貼上...」（問題1）
      const currentText = await Clipboard.getStringAsync();

      if (!currentText || currentText.trim().length === 0) {
        if (interactive) {
          Alert.alert('剪貼簿是空的', '目前沒有可貼上的文字內容。');
        }
        return;
      }

      if (currentText === lastProcessedClipboard.current) {
        if (interactive) {
          Alert.alert('已是最新內容', '這段文字已經貼上過了。');
        }
        return;
      }

      // 用戶點允許且為新內容 → 儲存並顯示 Snackbar
      lastProcessedClipboard.current = currentText;
      const userId = await getCurrentAuthUserId();
      if (!userId) {
        if (interactive) {
          Alert.alert('需要登入', '請先登入後再使用貼上功能。');
        }
        return;
      }
      const result = await pasteTextFromClipboard(userId);

      if (result.success) {
        showSnackbar('已從剪貼簿新增 1 筆快取');
      } else if (interactive) {
        Alert.alert('貼上失敗', result.message || '無法將剪貼簿內容加入快取。');
      }
    } catch (error) {
      console.error('[CacheList] Clipboard error:', error);
      if (interactive) {
        Alert.alert('貼上失敗', '剪貼簿讀取失敗，請稍後再試。');
      }
    } finally {
      setTimeout(() => {
        isCheckingClipboard.current = false;
      }, 1000);
    }
  }, [showSnackbar]);

  const handlePastePress = React.useCallback(() => {
    if (!isPremiumUser && cachedItems.length >= FREE_CACHE_ITEM_LIMIT) {
      Alert.alert('訪客方案已達上限', '升級訂閱即可新增更多快取。', [
        { text: '稍後', style: 'cancel' },
        { text: '前往設定', onPress: () => navigation.navigate('Settings') },
      ]);
      return;
    }
    void checkClipboard(true);
  }, [cachedItems.length, checkClipboard, isPremiumUser, navigation]);

  const tryShowShareSnackbar = React.useCallback(() => {
    const message = consumeShareSnackbar();
    if (message) showSnackbar(message);
  }, [consumeShareSnackbar, showSnackbar]);

  const runSync = React.useCallback(
    async (interactive: boolean): Promise<boolean> => {
      if (isSyncing.current) return false;

      const userId = await getCurrentAuthUserId();
      if (!userId) return false;

      isSyncing.current = true;
      try {
        const result = await syncWithRetry(2);
        if (!result.success && interactive) {
          const readableMessage = getSyncErrorMessage(result.error ?? result.message);
          Alert.alert('同步失敗', readableMessage, [
            { text: '稍後', style: 'cancel' },
            {
              text: '重試',
              onPress: () => {
                void runSync(true);
              },
            },
          ]);
          return false;
        }
        return result.success;
      } finally {
        isSyncing.current = false;
      }
    },
    []
  );

  const shareSnackbarTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshClipboardMode = React.useCallback(async () => {
    const settings = await loadUserSettings();
    setClipboardMode(settings.clipboardMode);
  }, []);

  React.useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const refreshEntitlement = React.useCallback(async () => {
    const userId = await getCurrentAuthUserId();
    if (!userId) {
      setIsPremiumUser(false);
      return;
    }
    try {
      const premium = await SubscriptionService.isPremium(userId);
      setIsPremiumUser(premium);
    } catch (error) {
      console.warn('[CacheList] refresh entitlement failed:', error);
      setIsPremiumUser(false);
    }
  }, []);

  // 監聽 App 從背景回到前景（當畫面在焦點上時）
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        isScreenFocused.current &&
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        void refreshClipboardMode();
        void runSync(false);
        void (async () => {
          const settings = await loadUserSettings();
          if (settings.clipboardMode === 'active') {
            await checkClipboard(false);
          }
        })();
        // Share Extension 處理為非同步，延遲 1.2s 後再檢查，確保 useShareExtension 已完成入庫
        shareSnackbarTimerRef.current = setTimeout(tryShowShareSnackbar, 1200);
      }
      appState.current = nextAppState;
    });
    return () => {
      if (shareSnackbarTimerRef.current) {
        clearTimeout(shareSnackbarTimerRef.current);
        shareSnackbarTimerRef.current = null;
      }
      subscription.remove();
    };
  }, [checkClipboard, clipboardMode, refreshClipboardMode, runSync, tryShowShareSnackbar]);

  // 監聽畫面聚焦（Tab 切換或首次進入），僅處理 focus state 與分享結果提示。
  useFocusEffect(
    React.useCallback(() => {
      isScreenFocused.current = true;
      void refreshClipboardMode();
      void refreshEntitlement();
      void (async () => {
        const settings = await loadUserSettings();
        if (settings.clipboardMode === 'active') {
          await checkClipboard(false);
        }
      })();
      const shareTimer = setTimeout(() => {
        const message = consumeShareSnackbar();
        if (message) showSnackbar(message);
      }, 600);
      return () => {
        isScreenFocused.current = false;
        clearTimeout(shareTimer);
      };
    }, [checkClipboard, consumeShareSnackbar, refreshClipboardMode, refreshEntitlement, showSnackbar])
  );

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

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await runSync(true);
    } finally {
      setRefreshing(false);
    }
  }, [runSync]);

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
                await item.markAsDeleted();
              });
              console.log('[CacheList] Item deleted:', item.id);
              void runSync(false);
            } catch (error) {
              console.error('[CacheList] Error deleting item:', error);
              Alert.alert('錯誤', '刪除失敗，請重試');
            }
          },
        },
      ]
    );
  };

  const handleClearCache = async () => {
    if (!cachedItems || cachedItems.length === 0) {
      Alert.alert('沒有可清除的快取', '目前快取列表是空的。');
      return;
    }

    Alert.alert(
      '清除全部快取',
      `確定要清除目前 ${cachedItems.length} 筆快取嗎？此動作無法復原。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除',
          style: 'destructive',
          onPress: async () => {
            try {
              await database.write(async () => {
                for (const item of cachedItems) {
                  await item.markAsDeleted();
                }
              });
              showSnackbar('已清除全部快取');
              void runSync(false);
            } catch (error) {
              console.error('[CacheList] clear cache failed:', error);
              Alert.alert('錯誤', '清除快取失敗，請稍後再試。');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: CachedItem }) => (
    <TouchableOpacity
      style={styles.itemContainer}
      activeOpacity={0.85}
      onPress={() => {
        void handleOpenCachedItem(item);
      }}
    >
      <View style={styles.itemHeader}>
        <Text style={styles.contentType}>{item.contentType.toUpperCase()}</Text>
        <Text style={styles.ttlBadge}>
          ⏳ {formatRemainingTime(getDisplayExpiry(item, isPremiumUser), nowTs)}
        </Text>
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
        
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => navigation.navigate('AddCacheItem', { cachedItem: item })}
        >
          <Text style={styles.editButtonText}>✏️ 編輯</Text>
        </TouchableOpacity>
      </View>

      {/* 點擊提示 */}
      <Text style={styles.editHint}>點擊卡片可直接建立卡片</Text>
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
      <View style={[styles.usageBanner, !isPremiumUser && cachedItems.length >= FREE_CACHE_ITEM_LIMIT && styles.usageBannerWarning]}>
        <Text style={styles.usageBannerText}>
          Cache 使用量：{cachedItems.length}/{isPremiumUser ? '∞' : FREE_CACHE_ITEM_LIMIT}
        </Text>
      </View>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>📚 My Cache</Text>
          <Text style={styles.headerSubtitle}>
            {cachedItems?.length || 0} items
          </Text>
        </View>
        <View style={styles.headerActions}>
          {clipboardMode === 'passive' && (
            <TouchableOpacity
              style={styles.pasteButton}
              onPress={handlePastePress}
            >
              <Text style={styles.pasteButtonText}>貼上</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.clearCacheButton}
            onPress={() => {
              void handleClearCache();
            }}
          >
            <Text style={styles.clearCacheButtonText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              if (!isPremiumUser && cachedItems.length >= FREE_CACHE_ITEM_LIMIT) {
                Alert.alert('訪客方案已達上限', '升級訂閱即可新增更多快取。', [
                  { text: '稍後', style: 'cancel' },
                  { text: '前往設定', onPress: () => navigation.navigate('Settings') },
                ]);
                return;
              }
              navigation.navigate('AddCacheItem');
            }}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
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

      {snackbarVisible && (
        <Animated.View
          style={[styles.snackbar, { opacity: snackbarOpacity }]}
          pointerEvents="none"
        >
          <Text style={styles.snackbarText}>✅ {snackbarMessage}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  usageBanner: {
    backgroundColor: '#e8f5e9',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#c8e6c9',
  },
  usageBannerWarning: {
    backgroundColor: '#ffebee',
    borderBottomColor: '#ffcdd2',
  },
  usageBannerText: {
    fontSize: 13,
    color: '#2e7d32',
    fontWeight: '600',
    textAlign: 'center',
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pasteButton: {
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
  clearCacheButton: {
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ef9a9a',
    backgroundColor: '#ffebee',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearCacheButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#c62828',
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
  ttlBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1565c0',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
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
  editButton: {
    backgroundColor: '#f1f3f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
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
  snackbar: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: '#323232',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snackbarText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  editHint: {
    fontSize: 11,
    color: '#bbb',
    textAlign: 'right',
    marginTop: 6,
    fontStyle: 'italic',
  },
});
