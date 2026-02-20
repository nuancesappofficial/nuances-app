import React from 'react';
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import type CachedItem from '@database/models/CachedItem';

type Props = {
  navigation: any;
};

type LevelFilter = 'all' | 'a2' | 'b1' | 'b2' | 'c1';
type SmartView = {
  name: string;
  query: string;
  dueOnly: boolean;
  source: string | null;
  tag: string | null;
  level: LevelFilter;
};

const SMART_VIEW_STORAGE_KEY = 'cards_smart_view_1';
const RECENT_ERROR_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function getTagsArray(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags.filter((tag): tag is string => typeof tag === 'string');
  }
  if (typeof tags === 'string') {
    const trimmed = tags.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((tag): tag is string => typeof tag === 'string');
      }
    } catch {
      return trimmed
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function detectLevel(card: Card): LevelFilter {
  const tags = getTagsArray(card.tags).map((tag) => tag.toLowerCase());
  if (tags.includes('a2')) return 'a2';
  if (tags.includes('b1')) return 'b1';
  if (tags.includes('b2')) return 'b2';
  if (tags.includes('c1')) return 'c1';
  return 'all';
}

function includesIgnoreCase(source: string, search: string): boolean {
  return source.toLowerCase().includes(search.toLowerCase());
}

function CardItem({
  item,
  navigation,
  onDelete,
  recentErrorCount,
  selectionMode,
  selected,
  onToggleSelect,
}: {
  item: Card;
  navigation: any;
  onDelete: (item: Card) => void;
  recentErrorCount: number;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [cachedItem, setCachedItem] = React.useState<CachedItem | null>(null);
  const isDue = new Date(item.nextReviewAt) <= new Date();
  const tags = getTagsArray(item.tags);

  React.useEffect(() => {
    const fetchCachedItem = async () => {
      if (!item.cachedItemId) return;
      try {
        const cached = await database
          .get<CachedItem>('cached_items')
          .find(item.cachedItemId);
        setCachedItem(cached);
      } catch {
        setCachedItem(null);
      }
    };
    void fetchCachedItem();
  }, [item.cachedItemId]);

  const handlePressCard = () => {
    if (selectionMode) {
      onToggleSelect();
      return;
    }
    navigation.navigate('CardReview', {
      cardId: item.id,
      cardIds: [item.id],
      queueIndex: 0,
    });
  };

  return (
    <View style={styles.cardContainer}>
      <TouchableOpacity onPress={handlePressCard} style={styles.cardContent} activeOpacity={0.85}>
        <View style={styles.cardHeader}>
          {selectionMode && (
            <TouchableOpacity style={styles.checkbox} onPress={onToggleSelect}>
              <Text style={styles.checkboxText}>{selected ? '✓' : ''}</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.targetWord}>{item.targetWord}</Text>
          <View style={styles.cardHeaderRight}>
            {isDue && (
              <View style={styles.dueBadge}>
                <Text style={styles.dueBadgeText}>待複習</Text>
              </View>
            )}
            {!selectionMode && (
              <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(item)}>
                <Text style={styles.deleteButtonText}>🗑️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {cachedItem?.contentType === 'image' && cachedItem.imageStoragePath && (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: cachedItem.imageStoragePath }} style={styles.previewImage} resizeMode="cover" />
          </View>
        )}

        {item.targetPhrase && <Text style={styles.targetPhrase}>{item.targetPhrase}</Text>}
        {item.originalSentence && !item.originalSentence.startsWith('file://') && (
          <Text style={styles.originalSentence} numberOfLines={2}>
            {item.originalSentence}
          </Text>
        )}
        <Text style={styles.definition} numberOfLines={2}>
          {item.definition}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>來源: {item.sourceApp || '-'}</Text>
          <Text style={styles.metaText}>近7天錯誤: {recentErrorCount}</Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.srsInfo}>間隔: {item.intervalDays}天</Text>
          <Text style={styles.lastReview}>
            Next: {new Date(item.nextReviewAt).toLocaleDateString()}
          </Text>
        </View>

        {tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {tags.slice(0, 3).map((tag, index) => (
              <View key={`${item.id}-${tag}-${index}`} style={styles.tag}>
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
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [query, setQuery] = React.useState('');
  const [dueOnly, setDueOnly] = React.useState(false);
  const [sourceFilter, setSourceFilter] = React.useState<string | null>(null);
  const [tagFilter, setTagFilter] = React.useState<string | null>(null);
  const [levelFilter, setLevelFilter] = React.useState<LevelFilter>('all');
  const [recentErrorMap, setRecentErrorMap] = React.useState<Record<string, number>>({});
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedCardIds, setSelectedCardIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const queryCards = database
      .get<Card>('cards')
      .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

    const load = async () => {
      try {
        const data = await queryCards.fetch();
        setAllCards(data);
      } catch (error) {
        console.error('[CardsList] load cards failed:', error);
        setAllCards([]);
      }
    };
    void load();

    const sub = queryCards.observe().subscribe((data) => {
      setAllCards(data);
    });
    return () => sub.unsubscribe();
  }, []);

  React.useEffect(() => {
    const loadRecentErrorMap = async () => {
      try {
        const recent = await database
          .get('review_history')
          .query(Q.where('reviewed_at', Q.gte(Date.now() - RECENT_ERROR_WINDOW_MS)))
          .fetch();
        const map: Record<string, number> = {};
        for (const row of recent as any[]) {
          const rating = Number(row.rating);
          if (!row.cardId || !Number.isFinite(rating)) continue;
          if (rating <= 2) {
            map[row.cardId] = (map[row.cardId] ?? 0) + 1;
          }
        }
        setRecentErrorMap(map);
      } catch (error) {
        console.error('[CardsList] load review history failed:', error);
      }
    };
    void loadRecentErrorMap();
  }, [allCards.length]);

  const sourceOptions = React.useMemo(() => {
    return Array.from(new Set(allCards.map((card) => card.sourceApp).filter(Boolean) as string[])).sort();
  }, [allCards]);

  const tagOptions = React.useMemo(() => {
    const tags = allCards.flatMap((card) => getTagsArray(card.tags));
    return Array.from(new Set(tags)).sort();
  }, [allCards]);

  const filteredCards = React.useMemo(() => {
    return allCards.filter((card) => {
      if (dueOnly && new Date(card.nextReviewAt) > new Date()) return false;
      if (sourceFilter && card.sourceApp !== sourceFilter) return false;
      if (tagFilter && !getTagsArray(card.tags).includes(tagFilter)) return false;
      if (levelFilter !== 'all' && detectLevel(card) !== levelFilter) return false;
      if (query.trim()) {
        const q = query.trim();
        const haystack = [card.targetWord, card.targetPhrase, card.originalSentence, card.definition]
          .filter(Boolean)
          .join(' ');
        if (!includesIgnoreCase(haystack, q)) return false;
      }
      return true;
    });
  }, [allCards, dueOnly, levelFilter, query, sourceFilter, tagFilter]);

  const dueCount = React.useMemo(
    () => allCards.filter((card) => new Date(card.nextReviewAt) <= new Date()).length,
    [allCards]
  );

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const handleDelete = async (item: Card) => {
    Alert.alert('刪除卡片', '確定要刪除這張卡片嗎？', [
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
          } catch (error) {
            console.error('[CardsList] delete card failed:', error);
            Alert.alert('錯誤', '刪除失敗，請重試');
          }
        },
      },
    ]);
  };

  const toggleSelectCard = (cardId: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedCardIds(new Set());
    setSelectionMode(false);
  };

  const applyBatchTag = async () => {
    if (selectedCardIds.size === 0) return;
    Alert.prompt(
      '批次加 Tag',
      '輸入要新增的 tag（例如: ielts）',
      async (value) => {
        const tag = value?.trim();
        if (!tag) return;
        try {
          await database.write(async () => {
            for (const card of allCards) {
              if (!selectedCardIds.has(card.id)) continue;
              await card.update((record) => {
                const existing = getTagsArray(record.tags);
                if (!existing.includes(tag)) {
                  record.tags = [...existing, tag];
                }
              });
            }
          });
          clearSelection();
        } catch (error) {
          console.error('[CardsList] batch add tag failed:', error);
        }
      },
      'plain-text'
    );
  };

  const applyBatchDelete = async () => {
    if (selectedCardIds.size === 0) return;
    Alert.alert('批次刪除', `確定刪除 ${selectedCardIds.size} 張卡片？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          try {
            await database.write(async () => {
              for (const card of allCards) {
                if (!selectedCardIds.has(card.id)) continue;
                await card.update((record) => {
                  record.deletedAt = new Date();
                });
              }
            });
            clearSelection();
          } catch (error) {
            console.error('[CardsList] batch delete failed:', error);
          }
        },
      },
    ]);
  };

  const applyBatchRescheduleToday = async () => {
    if (selectedCardIds.size === 0) return;
    try {
      await database.write(async () => {
        for (const card of allCards) {
          if (!selectedCardIds.has(card.id)) continue;
          await card.update((record) => {
            record.nextReviewAt = new Date();
          });
        }
      });
      clearSelection();
    } catch (error) {
      console.error('[CardsList] batch reschedule failed:', error);
    }
  };

  const saveSmartView = async () => {
    const view: SmartView = {
      name: '自訂檢視',
      query,
      dueOnly,
      source: sourceFilter,
      tag: tagFilter,
      level: levelFilter,
    };
    await AsyncStorage.setItem(SMART_VIEW_STORAGE_KEY, JSON.stringify(view));
    Alert.alert('已儲存', 'Smart View 已儲存');
  };

  const applySmartView = async () => {
    const raw = await AsyncStorage.getItem(SMART_VIEW_STORAGE_KEY);
    if (!raw) {
      Alert.alert('尚未儲存', '請先儲存一個 Smart View');
      return;
    }
    try {
      const view = JSON.parse(raw) as SmartView;
      setQuery(view.query ?? '');
      setDueOnly(Boolean(view.dueOnly));
      setSourceFilter(view.source ?? null);
      setTagFilter(view.tag ?? null);
      setLevelFilter(view.level ?? 'all');
    } catch {
      Alert.alert('錯誤', 'Smart View 讀取失敗');
    }
  };

  const startReview = async () => {
    const dueCards = allCards.filter((card) => new Date(card.nextReviewAt) <= new Date());
    if (dueCards.length === 0) {
      Alert.alert('沒有待複習卡片', '目前沒有需要複習的卡片。');
      return;
    }
    navigation.navigate('CardReview', {
      cardId: dueCards[0].id,
      cardIds: dueCards.map((card) => card.id),
      queueIndex: 0,
    });
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📇</Text>
      <Text style={styles.emptyTitle}>No cards found</Text>
      <Text style={styles.emptyText}>調整篩選條件或先建立新卡片。</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>📇 My Cards</Text>
          <Text style={styles.headerSubtitle}>{filteredCards.length} / {allCards.length} cards</Text>
        </View>
        <View style={styles.headerActions}>
          {dueCount > 0 && (
            <TouchableOpacity style={styles.reviewButton} onPress={startReview}>
              <Text style={styles.reviewButtonText}>開始複習</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.batchToggleButton, selectionMode && styles.batchToggleButtonActive]}
            onPress={() => {
              if (selectionMode) {
                clearSelection();
              } else {
                setSelectionMode(true);
              }
            }}
          >
            <Text style={styles.batchToggleText}>{selectionMode ? '取消' : '批次'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜尋字詞 / 例句 / 定義"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <View style={styles.filtersContainer}>
        <TouchableOpacity
          style={[styles.filterChip, dueOnly && styles.filterChipActive]}
          onPress={() => setDueOnly((prev) => !prev)}
        >
          <Text style={[styles.filterChipText, dueOnly && styles.filterChipTextActive]}>Due only</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, !sourceFilter && styles.filterChipActive]}
          onPress={() => setSourceFilter(null)}
        >
          <Text style={[styles.filterChipText, !sourceFilter && styles.filterChipTextActive]}>Source: All</Text>
        </TouchableOpacity>
        {sourceOptions.slice(0, 4).map((source) => (
          <TouchableOpacity
            key={source}
            style={[styles.filterChip, sourceFilter === source && styles.filterChipActive]}
            onPress={() => setSourceFilter((prev) => (prev === source ? null : source))}
          >
            <Text style={[styles.filterChipText, sourceFilter === source && styles.filterChipTextActive]}>
              {source}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.filterChip, !tagFilter && styles.filterChipActive]}
          onPress={() => setTagFilter(null)}
        >
          <Text style={[styles.filterChipText, !tagFilter && styles.filterChipTextActive]}>Tag: All</Text>
        </TouchableOpacity>
        {tagOptions.slice(0, 5).map((tag) => (
          <TouchableOpacity
            key={tag}
            style={[styles.filterChip, tagFilter === tag && styles.filterChipActive]}
            onPress={() => setTagFilter((prev) => (prev === tag ? null : tag))}
          >
            <Text style={[styles.filterChipText, tagFilter === tag && styles.filterChipTextActive]}>{tag}</Text>
          </TouchableOpacity>
        ))}

        {(['all', 'a2', 'b1', 'b2', 'c1'] as const).map((level) => (
          <TouchableOpacity
            key={level}
            style={[styles.filterChip, levelFilter === level && styles.filterChipActive]}
            onPress={() => setLevelFilter(level)}
          >
            <Text style={[styles.filterChipText, levelFilter === level && styles.filterChipTextActive]}>
              {level.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.smartViewRow}>
        <TouchableOpacity style={styles.smartViewButton} onPress={saveSmartView}>
          <Text style={styles.smartViewText}>儲存 Smart View</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.smartViewButton} onPress={applySmartView}>
          <Text style={styles.smartViewText}>套用 Smart View</Text>
        </TouchableOpacity>
      </View>

      {selectionMode && (
        <View style={styles.batchActionsBar}>
          <Text style={styles.batchActionsTitle}>已選 {selectedCardIds.size} 張</Text>
          <View style={styles.batchActionsButtons}>
            <TouchableOpacity style={styles.batchActionBtn} onPress={applyBatchTag}>
              <Text style={styles.batchActionText}>加 Tag</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.batchActionBtn} onPress={applyBatchRescheduleToday}>
              <Text style={styles.batchActionText}>重設排程</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.batchActionBtn, styles.batchDanger]} onPress={applyBatchDelete}>
              <Text style={styles.batchActionText}>刪除</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FlatList
        data={filteredCards}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={renderEmpty}
        renderItem={({ item }) => (
          <CardItem
            item={item}
            navigation={navigation}
            onDelete={handleDelete}
            recentErrorCount={recentErrorMap[item.id] ?? 0}
            selectionMode={selectionMode}
            selected={selectedCardIds.has(item.id)}
            onToggleSelect={() => toggleSelectCard(item.id)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  headerSubtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  reviewButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FF5722',
    borderRadius: 8,
  },
  reviewButtonText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  batchToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ced6de',
    backgroundColor: '#fff',
  },
  batchToggleButtonActive: {
    borderColor: '#1f8f47',
    backgroundColor: '#e8f5e9',
  },
  batchToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2f3b4a',
  },
  searchContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#dfe3e8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  filtersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#d5dbe3',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  filterChipActive: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  filterChipText: { fontSize: 12, color: '#4d5b6a', fontWeight: '600' },
  filterChipTextActive: { color: '#0d47a1' },
  smartViewRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  smartViewButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f1f3f5',
  },
  smartViewText: { fontSize: 12, color: '#2f3b4a', fontWeight: '700' },
  batchActionsBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  batchActionsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2f3b4a',
    marginBottom: 8,
  },
  batchActionsButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  batchActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#eef2f5',
  },
  batchDanger: {
    backgroundColor: '#ffe8e6',
  },
  batchActionText: { fontSize: 12, fontWeight: '700', color: '#2f3b4a' },
  listContent: { padding: 16 },
  cardContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  cardContent: { flex: 1 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxText: {
    color: '#2e7d32',
    fontWeight: '800',
  },
  targetWord: { fontSize: 20, fontWeight: 'bold', color: '#333', flex: 1 },
  deleteButton: { padding: 4 },
  deleteButtonText: { fontSize: 18 },
  imagePreviewContainer: { marginBottom: 12, borderRadius: 8, overflow: 'hidden' },
  previewImage: { width: '100%', height: 150, backgroundColor: '#f0f0f0' },
  dueBadge: { backgroundColor: '#FF5722', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  dueBadgeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  targetPhrase: { fontSize: 16, color: '#666', fontStyle: 'italic', marginBottom: 8 },
  originalSentence: { fontSize: 14, color: '#444', lineHeight: 20, marginBottom: 8, fontStyle: 'italic' },
  definition: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 8 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  metaText: {
    fontSize: 12,
    color: '#5d6b79',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  srsInfo: { fontSize: 12, color: '#999' },
  lastReview: { fontSize: 12, color: '#999' },
  tagsContainer: { flexDirection: 'row', gap: 4, marginTop: 8 },
  tag: { backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  tagText: { fontSize: 11, color: '#2196F3' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#333', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
});
