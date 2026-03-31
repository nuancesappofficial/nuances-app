import React from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { FolderIcon } from '../../../components/UI/DeckScreenUI/FolderIcon';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import type CachedItem from '@database/models/CachedItem';

type Props = {
  navigation: any;
};

type AlbumPreviewCard = {
  imageUrl?: string;
  cardTypeText: string;
  previewText?: string;
  createdAtMs: number;
};

type Album = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  cardIds: string[];
  wordCount: number;
  latestCards: AlbumPreviewCard[];
  isDefault?: boolean;
};

function getTagsArray(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (typeof tags === 'string') {
    const trimmed = tags.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter(Boolean);
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

function buildPreviewCards(cards: Card[], cardImageMap: Record<string, string>): AlbumPreviewCard[] {
  return cards.slice(0, 3).map((card) => {
    const imageUrl = cardImageMap[card.id];
    return {
      ...(imageUrl ? { imageUrl } : {}),
      cardTypeText: card.partOfSpeech || 'word',
      previewText: (card.targetWord || card.definition || 'card').trim(),
      createdAtMs: new Date(card.createdAt).getTime(),
    };
  });
}

export default function DeckScreen({ navigation }: Props) {
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [cardImageMap, setCardImageMap] = React.useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sortOrder, setSortOrder] = React.useState<'desc' | 'asc'>('desc');

  const filterPills = ['群組', '隱私', '已封存'];

  React.useEffect(() => {
    const queryCards = database
      .get<Card>('cards')
      .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

    const load = async () => {
      try {
        const data = await queryCards.fetch();
        setAllCards(data);
      } catch (error) {
        console.error('[Deck] load cards failed:', error);
        setAllCards([]);
      }
    };

    void load();
    const sub = queryCards.observe().subscribe((data) => setAllCards(data));
    return () => sub.unsubscribe();
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadCardImages = async () => {
      const nextMap: Record<string, string> = {};
      const cardsWithCachedItem = allCards.filter((card) => Boolean(card.cachedItemId));

      await Promise.all(
        cardsWithCachedItem.map(async (card) => {
          try {
            const linked = await database.get<CachedItem>('cached_items').find(card.cachedItemId as string);
            const uri = linked.imageStoragePath || linked.mediaUri;
            if (uri) {
              nextMap[card.id] = uri;
            }
          } catch {
            // ignore missing linked cached item
          }
        })
      );

      if (!cancelled) {
        setCardImageMap(nextMap);
      }
    };

    void loadCardImages();

    return () => {
      cancelled = true;
    };
  }, [allCards]);

  const albums = React.useMemo<Album[]>(() => {
    const slangCards: Card[] = [];
    const cultureCards: Card[] = [];
    const workCards: Card[] = [];

    allCards.forEach((card) => {
      const tags = getTagsArray(card.tags).map((t) => t.toLowerCase());
      const albumTagIds = tags
        .filter((tag) => tag.startsWith('album:'))
        .map((tag) => tag.slice('album:'.length).trim());
      const source = (card.sourceApp || '').toLowerCase();
      const text = `${card.targetWord || ''} ${card.definition || ''}`.toLowerCase();

      if (
        tags.some((t) => ['slang', 'internet', 'social'].includes(t)) ||
        albumTagIds.includes('slang') ||
        /slang|internet|meme/.test(text)
      ) {
        slangCards.push(card);
      }

      if (
        tags.some((t) => ['culture', 'pop', 'movie'].includes(t)) ||
        albumTagIds.includes('culture') ||
        /culture|movie|music|pop/.test(text)
      ) {
        cultureCards.push(card);
      }

      if (
        tags.some((t) => ['work', 'business', 'office'].includes(t)) ||
        albumTagIds.includes('work') ||
        /work|business|office/.test(text) ||
        source.includes('slack')
      ) {
        workCards.push(card);
      }
    });

    return [
      {
        id: 'all',
        name: 'All cards',
        emoji: '📌',
        color: '#1B1B1F',
        cardIds: allCards.map((card) => card.id),
        wordCount: allCards.length,
        latestCards: buildPreviewCards(allCards, cardImageMap),
        isDefault: true,
      },
      {
        id: 'slang',
        name: 'Internet Slang',
        emoji: '💬',
        color: '#1B1B1F',
        cardIds: Array.from(new Set(slangCards.map((card) => card.id))),
        wordCount: slangCards.length,
        latestCards: buildPreviewCards(slangCards, cardImageMap),
      },
      {
        id: 'culture',
        name: 'Pop Culture',
        emoji: '🎬',
        color: '#1B1B1F',
        cardIds: Array.from(new Set(cultureCards.map((card) => card.id))),
        wordCount: cultureCards.length,
        latestCards: buildPreviewCards(cultureCards, cardImageMap),
      },
      {
        id: 'work',
        name: 'Work Phrases',
        emoji: '💼',
        color: '#1B1B1F',
        cardIds: Array.from(new Set(workCards.map((card) => card.id))),
        wordCount: workCards.length,
        latestCards: buildPreviewCards(workCards, cardImageMap),
      },
    ];
  }, [allCards, cardImageMap]);

  const processedAlbums = React.useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    let result = [...albums];

    if (keyword) {
      result = result.filter((album) => {
        const inName = album.name.toLowerCase().includes(keyword);
        const inCards = album.latestCards.some(
          (card) =>
            card.previewText?.toLowerCase().includes(keyword) ||
            card.cardTypeText.toLowerCase().includes(keyword)
        );
        return inName || inCards;
      });
    }

    result.sort((a, b) => {
      const aLatest = a.latestCards[0]?.createdAtMs ?? 0;
      const bLatest = b.latestCards[0]?.createdAtMs ?? 0;
      return sortOrder === 'desc' ? bLatest - aLatest : aLatest - bLatest;
    });

    return result;
  }, [albums, searchQuery, sortOrder]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="搜尋卡片關鍵字"
            placeholderTextColor="#8E8E93"
            style={styles.searchInput}
            returnKeyType="search"
          />
          <TouchableOpacity
            style={styles.clearSearchButton}
            activeOpacity={0.8}
            onPress={() => setSearchQuery('')}
          >
            <Text style={styles.clearSearchButtonText}>×</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.addAlbumButton}
          activeOpacity={0.85}
          onPress={() => {
            try {
              navigation.navigate('CreateAlbum');
            } catch {
              navigation.navigate('AlbumView', { mode: 'create' });
            }
          }}
        >
          <Text style={styles.addAlbumText}>＋</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity
          style={styles.sortPill}
          activeOpacity={0.85}
          onPress={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
        >
          <Text style={styles.sortPillText}>↕︎</Text>
          <Text style={styles.sortPillChevron}>{sortOrder === 'desc' ? '新→舊' : '舊→新'}</Text>
        </TouchableOpacity>

        {filterPills.map((pill) => (
          <TouchableOpacity key={pill} style={styles.filterPill} activeOpacity={0.85}>
            <Text style={styles.filterPillText}>{pill}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={processedAlbums}
        numColumns={2}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.albumGridContent}
        columnWrapperStyle={styles.albumRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.albumItem}
            activeOpacity={0.92}
            onPress={() => navigation.navigate('AlbumView', { album: item, isDefault: item.isDefault })}
          >
            <FolderIcon
              title={item.name}
              wordCount={item.wordCount}
              latestCards={item.latestCards}
              style={styles.folderIcon}
            />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInputWrap: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: '#0B0B0F',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 0,
  },
  clearSearchButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  clearSearchButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 14,
  },
  addAlbumButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0B0F',
  },
  addAlbumText: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '300',
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 8,
  },
  sortPill: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#111317',
    gap: 6,
  },
  sortPillText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  sortPillChevron: {
    color: '#C7C7CC',
    fontSize: 12,
  },
  filterPill: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  filterPillText: {
    color: '#F2F2F7',
    fontSize: 14,
    fontWeight: '600',
  },
  albumGridContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 120,
    gap: 16,
  },
  albumRow: {
    justifyContent: 'space-between',
  },
  albumItem: {
    width: '48.3%',
  },
  folderIcon: {
    width: '100%',
  },
});
