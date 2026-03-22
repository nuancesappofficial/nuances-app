import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
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
    const slangIds: string[] = [];
    const cultureIds: string[] = [];
    const workIds: string[] = [];

    allCards.forEach((card) => {
      const tags = getTagsArray(card.tags).map((t) => t.toLowerCase());
      const source = (card.sourceApp || '').toLowerCase();
      const text = `${card.targetWord || ''} ${card.definition || ''}`.toLowerCase();

      if (tags.some((t) => ['slang', 'internet', 'social'].includes(t)) || /slang|internet|meme/.test(text)) {
        slangIds.push(card.id);
      }
      if (tags.some((t) => ['culture', 'pop', 'movie'].includes(t)) || /culture|movie|music|pop/.test(text)) {
        cultureIds.push(card.id);
      }
      if (tags.some((t) => ['work', 'business', 'office'].includes(t)) || /work|business|office/.test(text) || source.includes('slack')) {
        workIds.push(card.id);
      }
    });

    return [
      { id: 'slang', name: 'Internet Slang', emoji: '💬', color: '#FFE5E5', cardIds: Array.from(new Set(slangIds)) },
      { id: 'culture', name: 'Pop Culture', emoji: '🎬', color: '#E5F4FF', cardIds: Array.from(new Set(cultureIds)) },
      { id: 'work', name: 'Work Phrases', emoji: '💼', color: '#FFF4E5', cardIds: Array.from(new Set(workIds)) },
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
            <TouchableOpacity
              style={styles.addAlbumBtn}
              onPress={() => Alert.alert('尚未開放', '建立相簿功能下一步接上資料庫。')}
            >
              <Text style={styles.addAlbumBtnText}>＋</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.albumList}>
            {albums.map((album) => (
              <TouchableOpacity
                key={album.id}
                style={styles.albumRow}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('AlbumView', { album })}
              >
                <View style={styles.albumCoverWrap}>
                  <View style={[styles.albumCoverShadow, { backgroundColor: album.color }]} />
                  <View style={[styles.albumCoverMain, { backgroundColor: album.color }]}>
                    <Text style={styles.albumCoverEmoji}>{album.emoji}</Text>
                  </View>
                </View>

                <View style={styles.albumMeta}>
                  <Text style={styles.albumName}>{album.name}</Text>
                  <Text style={styles.albumCount}>{album.cardIds.length} words</Text>
                </View>

                <Text style={styles.albumArrow}>›</Text>
              </TouchableOpacity>
            ))}
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
  container: { flex: 1, backgroundColor: '#fff' },
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
  addAlbumBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAlbumBtnText: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: -1 },
  albumList: { gap: 8 },
  albumRow: {
    borderRadius: 14,
    backgroundColor: '#fff',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  albumCoverWrap: {
    width: 64,
    height: 64,
    marginRight: 12,
  },
  albumCoverShadow: {
    position: 'absolute',
    inset: 0 as any,
    borderRadius: 12,
    transform: [{ rotate: '-3deg' }],
    opacity: 0.6,
  },
  albumCoverMain: {
    width: 64,
    height: 64,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumCoverEmoji: { fontSize: 30 },
  albumMeta: { flex: 1 },
  albumName: { fontSize: 17, color: '#000', fontWeight: '600' },
  albumCount: { marginTop: 2, fontSize: 13, color: '#8E8E93' },
  albumArrow: { fontSize: 22, color: '#C7C7CC' },
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
