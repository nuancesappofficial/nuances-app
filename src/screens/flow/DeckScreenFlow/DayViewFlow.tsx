import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type Card from '@database/models/Card';

type Props = {
  navigation: any;
  route: { params?: { day?: string } };
};

const masteryColors = ['#FFE5E5', '#FFE5CC', '#E5F4FF', '#E5FFE5'];

const dayNames: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

const dayColors: Record<string, string> = {
  Mon: '#FFE5E5',
  Tue: '#E5F4FF',
  Wed: '#E5FFE5',
  Thu: '#FFF4E5',
  Fri: '#FFE5F5',
  Sat: '#F5E5FF',
  Sun: '#FFE5CC',
};

function getMasteryIndex(card: Card): number {
  const reps = Number(card.repetitions || 0);
  if (reps >= 8) return 3;
  if (reps >= 4) return 2;
  if (reps >= 2) return 1;
  return 0;
}

function dayKeyFromDate(input: Date | string): string {
  const d = new Date(input);
  const day = d.getDay();
  const map = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return map[day] || 'Mon';
}

function todayDayKey(): string {
  return dayKeyFromDate(new Date());
}

export default function DayViewScreen({ navigation, route }: Props) {
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
        console.error('[DayView] load cards failed:', error);
        setAllCards([]);
      }
    };

    void load();
    const sub = queryCards.observe().subscribe((data) => setAllCards(data));
    return () => sub.unsubscribe();
  }, []);

  const day = route.params?.day || todayDayKey();

  const dayCards = React.useMemo(() => {
    return allCards.filter((card) => dayKeyFromDate(card.createdAt) === day);
  }, [allCards, day]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.backText}>Deck</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.dayHeader}>
          <View style={[styles.dayBadge, { backgroundColor: dayColors[day] || '#F2F2F7' }]}>
            <Text style={styles.dayBadgeText}>{day}</Text>
          </View>
          <View>
            <Text style={styles.dayTitle}>{dayNames[day] || day}</Text>
            <Text style={styles.daySubTitle}>
              {dayCards.length} {dayCards.length === 1 ? 'word' : 'words'} added
            </Text>
          </View>
        </View>

        {dayCards.length > 0 ? (
          <View style={styles.grid}>
            {dayCards.map((card, index) => {
              const mastery = getMasteryIndex(card);
              return (
                <TouchableOpacity
                  key={card.id}
                  style={[styles.cardTile, { backgroundColor: masteryColors[mastery], opacity: 1 - Math.min(index, 6) * 0.03 }]}
                  activeOpacity={0.9}
                  onPress={() =>
                    navigation.navigate('CardDetail', {
                      cardId: card.id,
                      cardIds: dayCards.map((item) => item.id),
                      headerTitle: dayNames[day] || day,
                    })
                  }
                >
                  <View style={styles.wordWrap}>
                    <Text style={styles.word} numberOfLines={2}>
                      {card.targetWord || card.targetPhrase || '-'}
                    </Text>
                  </View>

                  <View style={styles.posBadge}>
                    <Text style={styles.posText} numberOfLines={1}>
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
            <View style={styles.emptyCircle}>
              <Text style={styles.emptyEmoji}>📚</Text>
            </View>
            <Text style={styles.emptyTitle}>No words added this day</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ADD8E6' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  backChevron: {
    fontSize: 28,
    color: '#007AFF',
    lineHeight: 28,
    marginTop: -2,
  },
  backText: {
    fontSize: 17,
    color: '#007AFF',
  },
  content: {
    paddingBottom: 120,
  },
  dayHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  dayBadge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  dayTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.5,
  },
  daySubTitle: {
    marginTop: 2,
    fontSize: 15,
    color: '#8E8E93',
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
  wordWrap: {
    flex: 1,
    justifyContent: 'center',
    marginBottom: 10,
  },
  word: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    lineHeight: 22,
  },
  posBadge: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  posText: {
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
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#8E8E93',
  },
});
