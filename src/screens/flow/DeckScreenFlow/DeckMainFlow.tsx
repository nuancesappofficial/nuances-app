import React from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { FolderIcon } from '../../../components/UI/DeckScreenUI/FolderIcon';
import { database } from '@database/index';
import type Card from '@database/models/Card';

type Props = {
  navigation: any;
};

type Album = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  cardIds: string[];
  wordCount: number;
  latestCards: AlbumPreviewCard[];
};

type AlbumPreviewCard = {
  imageUrl?: string;
  cardTypeText: string;
};

function getWeekNumber(date: Date): number {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}

function dayKeyFromDate(input: Date | string): string {
  const d = new Date(input);
  const day = d.getDay();
  const map = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return map[day] || 'Mon';
}

function getMasteryIndex(card: Card): number {
  const reps = Number(card.repetitions || 0);
  if (reps >= 8) return 3;
  if (reps >= 4) return 2;
  if (reps >= 2) return 1;
  return 0;
}

function getTagsArray(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean);
  }
  if (typeof tags === 'string') {
    const trimmed = tags.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean);
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

export default function DeckScreen({ navigation }: Props) {
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const selectedColor = '#00ffff';

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

  const weekLabel = React.useMemo(() => `Week ${getWeekNumber(new Date())}`, []);

  const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const dayMap = React.useMemo(() => {
    const map = new Map<string, Card[]>();
    dayOrder.forEach((day) => map.set(day, []));
    allCards.forEach((card) => {
      const key = dayKeyFromDate(card.createdAt);
      const existing = map.get(key) || [];
      existing.push(card);
      map.set(key, existing);
    });
    return map;
  }, [allCards]);

  const weekCards = React.useMemo(() => {
    return dayOrder
      .map((day) => {
        const cards = dayMap.get(day) || [];
        return {
          day,
          cards,
          first: cards[0] || null,
        };
      })
      .filter((item) => item.cards.length > 0)
      .slice(0, 4);
  }, [dayMap]);

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

    const buildPreviewCards = (cards: Card[]): AlbumPreviewCard[] =>
      cards.slice(0, 3).map((card) => ({
        imageUrl: undefined,
        cardTypeText: card.partOfSpeech || 'word',
      }));

    return [
      {
        id: 'slang',
        name: 'Internet Slang',
        emoji: '💬',
        color: '#FFE5E5',
        cardIds: Array.from(new Set(slangCards.map((card) => card.id))),
        wordCount: slangCards.length,
        latestCards: buildPreviewCards(slangCards),
      },
      {
        id: 'culture',
        name: 'Pop Culture',
        emoji: '🎬',
        color: '#E5F4FF',
        cardIds: Array.from(new Set(cultureCards.map((card) => card.id))),
        wordCount: cultureCards.length,
        latestCards: buildPreviewCards(cultureCards),
      },
      {
        id: 'work',
        name: 'Work Phrases',
        emoji: '💼',
        color: '#FFF4E5',
        cardIds: Array.from(new Set(workCards.map((card) => card.id))),
        wordCount: workCards.length,
        latestCards: buildPreviewCards(workCards),
      },
    ];
  }, [allCards]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.weekHeader}>
          <View style={styles.weekTitleWrap}>
            <Text style={styles.weekTitle}>{weekLabel}</Text>
          </View>
          <TouchableOpacity
            style={styles.reviewButton}
            onPress={() => navigation.navigate('CardReview')}
          >
            <Text style={styles.reviewButtonText}>Start Review</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayScrollContent}>
          {(weekCards.length > 0 ? weekCards : dayOrder.slice(0, 4).map((day) => ({ day, cards: [], first: null }))).map((item, index) => {
            const dayCardsCount = item.cards.length;
            const first = item.first;
            return (
              <TouchableOpacity
                key={`${item.day}-${index}`}
                style={styles.dayCard}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('DayView', { day: item.day })}
              >
                <View style={styles.dayCardContent}>
                  <View style={styles.dayWordWrap}>
                    <Text style={styles.dayWord} numberOfLines={2}>
                      {first?.targetWord || 'No Card'}
                    </Text>
                  </View>

                  <View style={styles.dayPosWrap}>
                    <Text style={styles.dayPos} numberOfLines={1}>
                      {first?.partOfSpeech || 'tap to view'}
                    </Text>
                  </View>

                  <View style={styles.dayLabelWrap}>
                    <Text style={styles.dayLabel}>{item.day}</Text>
                  </View>

                  {dayCardsCount > 1 && (
                    <View style={styles.dayMoreWrap}>
                      <Text style={styles.dayMoreText}>+{dayCardsCount - 1} more</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.albumsSection}>
          <View style={styles.albumsHeader}>
            <Text style={styles.albumsTitle}>My Albums</Text>
          </View>

          <View style={styles.albumList}>
            <FlatList
              data={albums}
              numColumns={2}
              scrollEnabled={false}
              keyExtractor={(item) => item.id}
              columnWrapperStyle={styles.albumColumn}
              contentContainerStyle={styles.albumGridContent}
              renderItem={({ item }) => {
                return (
                  <TouchableOpacity
                    style={styles.albumGridItem}
                    activeOpacity={0.9}
                    onPress={() => navigation.navigate('AlbumView', { album: item })}
                  >
                    <FolderIcon
                      style={styles.folderIconWrapper}
                      title={item.name}
                      wordCount={item.wordCount}
                      accentColor={selectedColor}
                      cardLabels={item.latestCards.map((card) => card.cardTypeText)}
                    />
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>

        {allCards.length > 0 ? (
          <View style={styles.quickSection}>
            <Text style={styles.quickTitle}>Quick Preview</Text>
            <View style={styles.quickGrid}>
              {allCards.slice(0, 4).map((card) => {
                const mastery = getMasteryIndex(card);
                const colors = ['#FFE5E5', '#FFE5CC', '#E5F4FF', '#E5FFE5'];
                return (
                  <TouchableOpacity
                    key={card.id}
                    style={[styles.quickCard, { backgroundColor: colors[mastery] }]}
                    onPress={() => navigation.navigate('CardDetail', { cardId: card.id })}
                  >
                    <Text style={styles.quickWord} numberOfLines={2}>{card.targetWord}</Text>
                    <Text style={styles.quickDef} numberOfLines={2}>{card.definition}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#91c9f9' },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 24, paddingBottom: 120 },
  weekHeader: {
    paddingHorizontal: 20,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekTitleWrap: {},
  weekTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.5,
  },
  reviewButton: {
    borderRadius: 999,
    backgroundColor: '#0D0D0D',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  reviewButtonText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '700',
  },
  weekActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weekActionPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F2F2F7',
  },
  weekActionText: { fontSize: 13, color: '#8E8E93', fontWeight: '600' },
  weekActionCalendar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekActionCalendarText: { fontSize: 16 },
  dayScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 10,
  },
  dayCard: {
    width: 102,
    height: 132,
    borderRadius: 16,
    backgroundColor: '#fff',
    marginRight: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  dayCardContent: {
    flex: 1,
    padding: 10,
  },
  dayWordWrap: { flex: 1, justifyContent: 'center' },
  dayWord: { fontSize: 14, fontWeight: '700', color: '#000', textAlign: 'center', lineHeight: 17 },
  dayPosWrap: {
    marginBottom: 6,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: '#F2F2F7',
  },
  dayPos: { fontSize: 9, color: '#8E8E93', textAlign: 'center', fontWeight: '600' },
  dayLabelWrap: {
    borderRadius: 8,
    backgroundColor: '#007AFF',
    paddingVertical: 4,
  },
  dayLabel: { fontSize: 11, color: '#fff', textAlign: 'center', fontWeight: '700' },
  dayMoreWrap: {
    marginTop: 4,
    borderRadius: 6,
    backgroundColor: '#34C759',
    paddingVertical: 3,
  },
  dayMoreText: { fontSize: 9, color: '#fff', textAlign: 'center', fontWeight: '700' },
  albumsSection: {
    marginTop: 10,
    paddingHorizontal: 20,
  },
  albumsHeader: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  albumsTitle: { fontSize: 20, fontWeight: '600', color: '#000' },
  albumList: {
    marginTop: 8,
  },
  albumColumn: {
    justifyContent: 'space-between',
  },
  albumGridContent: {
    paddingBottom: 4,
  },
  albumGridItem: {
    width: '48%',
    marginBottom: 20,
    alignItems: 'center',
  },
  folderIconWrapper: {
    width: '100%',
    height: 260,
  },
  neonFolderContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 160 / 190,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 18,
    elevation: 6,
  },
  folderBackPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#444',
    overflow: 'hidden',
    zIndex: 0,
  },
  backPanelGradient: {
    flex: 1,
  },
  titleContainer: {
    position: 'absolute',
    top: 15,
    left: 15,
    right: 15,
    justifyContent: 'center',
    alignItems: 'flex-start',
    zIndex: 1,
  },
  neonAlbumTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'left',
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  cardStackContainer: {
    position: 'absolute',
    top: '15%',
    left: '10%',
    right: '10%',
    bottom: '30%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  stackedCard: {
    position: 'absolute',
    width: 100,
    height: 120,
    borderRadius: 15,
    backgroundColor: '#1A1A1A',
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  stackedCard0: { zIndex: 3, transform: [{ translateY: 0 }, { scale: 1 }] },
  stackedCard1: { zIndex: 2, transform: [{ translateY: 15 }, { scale: 0.95 }] },
  stackedCard2: { zIndex: 1, transform: [{ translateY: 30 }, { scale: 0.9 }] },
  cardThumbnail: {
    width: '100%',
    height: 70,
    borderRadius: 10,
  },
  cardThumbnailPlaceholder: {
    width: '100%',
    height: 70,
    borderRadius: 10,
    backgroundColor: '#2C2C2C',
  },
  cardTypeText: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#CFEFFF',
    textTransform: 'uppercase',
  },
  folderFrontCover: {
    position: 'absolute',
    width: '100%',
    height: '85%',
    bottom: 0,
    borderTopRightRadius: 40,
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 2,
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  albumBottomTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  wordCount: {
    marginTop: 4,
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
  quickSection: {
    marginTop: 14,
    paddingHorizontal: 20,
  },
  quickTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  quickCard: {
    width: '48%',
    borderRadius: 12,
    padding: 10,
    minHeight: 100,
  },
  quickWord: {
    fontSize: 14,
    color: '#000',
    fontWeight: '700',
    marginBottom: 6,
  },
  quickDef: {
    fontSize: 12,
    color: '#444',
    lineHeight: 16,
  },
});
