import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type Card from '@database/models/Card';

type Album = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  cardIds: string[];
};

type RouteParams = {
  album?: Album;
};

type Props = {
  navigation: any;
  route: { params?: RouteParams };
};

const masteryColors = ['#FFE5E5', '#FFE5CC', '#E5F4FF', '#E5FFE5'];

function getMasteryIndex(card: Card): number {
  const reps = Number(card.repetitions || 0);
  if (reps >= 8) return 3;
  if (reps >= 4) return 2;
  if (reps >= 2) return 1;
  return 0;
}

function getDefaultAlbum(cards: Card[]): Album {
  return {
    id: 'all-cards',
    name: 'All Cards',
    emoji: '📚',
    color: '#EAF1FF',
    cardIds: cards.map((card) => card.id),
  };
}

export default function AlbumViewScreen({ navigation, route }: Props) {
  const [allCards, setAllCards] = React.useState<Card[]>([]);

  React.useEffect(() => {
    const queryCards = database
      .get<Card>('cards')
      .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

    const load = async () => {
      try {
        const data = await queryCards.fetch();
        setAllCards(data);
      } catch (error) {
        console.error('[AlbumView] load cards failed:', error);
        setAllCards([]);
      }
    };

    void load();
    const sub = queryCards.observe().subscribe((data) => setAllCards(data));
    return () => sub.unsubscribe();
  }, []);

  const album = React.useMemo(() => {
    return route.params?.album ?? getDefaultAlbum(allCards);
  }, [allCards, route.params?.album]);

  const albumCards = React.useMemo(() => {
    if (!album.cardIds.length) return [];
    const idSet = new Set(album.cardIds);
    return allCards.filter((card) => idSet.has(card.id));
  }, [allCards, album.cardIds]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.backText}>Deck</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.albumHeader}>
          <View style={styles.albumIconWrap}>
            <View style={[styles.albumIconBg, { backgroundColor: album.color, transform: [{ rotate: '-3deg' }] }]} />
            <View style={[styles.albumIconMain, { backgroundColor: album.color }]}>
              <Text style={styles.albumEmoji}>{album.emoji}</Text>
            </View>
          </View>
          <View>
            <Text style={styles.albumName}>{album.name}</Text>
            <Text style={styles.albumCount}>
              {albumCards.length} {albumCards.length === 1 ? 'word' : 'words'}
            </Text>
          </View>
        </View>

        {albumCards.length > 0 ? (
          <View style={styles.grid}>
            {albumCards.map((card, index) => {
              const mastery = getMasteryIndex(card);
              return (
                <TouchableOpacity
                  key={card.id}
                  style={[styles.cardTile, { backgroundColor: masteryColors[mastery], opacity: 1 - Math.min(index, 6) * 0.03 }]}
                  activeOpacity={0.9}
                  onPress={() => {
                    navigation.navigate('CardDetail', { cardId: card.id });
                  }}
                >
                  <View style={styles.tileWordWrap}>
                    <Text style={styles.tileWord} numberOfLines={2}>
                      {card.targetWord || card.targetPhrase || '-'}
                    </Text>
                  </View>

                  <View style={styles.partOfSpeechBadge}>
                    <Text style={styles.partOfSpeechText} numberOfLines={1}>
                      {card.partOfSpeech || 'unknown'}
                    </Text>
                  </View>

                  <Text style={styles.definition} numberOfLines={2}>
                    {card.definition || 'No definition'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIconWrap, { backgroundColor: album.color }]}>
              <Text style={styles.emptyEmoji}>{album.emoji}</Text>
            </View>
            <Text style={styles.emptyTitle}>No words in this album yet</Text>
            <Text style={styles.emptySubtitle}>Add words from your deck</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  backChevron: {
    color: '#007AFF',
    fontSize: 28,
    lineHeight: 28,
    marginTop: -2,
  },
  backText: {
    color: '#007AFF',
    fontSize: 17,
  },
  content: {
    paddingBottom: 120,
  },
  albumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  albumIconWrap: {
    width: 80,
    height: 80,
    position: 'relative',
  },
  albumIconBg: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 16,
    opacity: 0.6,
  },
  albumIconMain: {
    width: 80,
    height: 80,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumEmoji: {
    fontSize: 40,
  },
  albumName: {
    fontSize: 34,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.5,
  },
  albumCount: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 2,
  },
  grid: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  cardTile: {
    width: '48%',
    borderRadius: 16,
    padding: 14,
    minHeight: 170,
  },
  tileWordWrap: {
    flex: 1,
    justifyContent: 'center',
    marginBottom: 10,
  },
  tileWord: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    lineHeight: 22,
  },
  partOfSpeechBadge: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  partOfSpeechText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  definition: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 20,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    opacity: 0.6,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#8E8E93',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#C7C7CC',
    marginTop: 8,
  },
});
