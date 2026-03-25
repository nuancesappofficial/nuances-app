import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import {
  loadUserSettings,
  saveUserSettings,
  type EntitlementMode,
} from '@services/settings/userSettings';

type Props = {
  navigation: any;
};

type WeekCell = {
  day: string;
  card?: Card;
  placeholder?: string;
};

type WeekData = {
  number: number;
  dateRange: string;
  days: WeekCell[];
};

const DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu'] as const;

function dayKeyFromDate(input: Date | string): string {
  const d = new Date(input);
  const day = d.getDay();
  const map = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return map[day] || 'Mon';
}

function getISOWeekAndYear(date: Date): { week: number; year: number } {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week: weekNo, year: target.getUTCFullYear() };
}

function weekDateRangeFromYearWeek(year: number, week: number): string {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const monday = new Date(simple);
  if (dow <= 4) monday.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else monday.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function buildWeeks(cards: Card[]): WeekData[] {
  const now = new Date();
  const current = getISOWeekAndYear(now);

  const weekBuckets = new Map<string, Card[]>();
  cards.forEach((card) => {
    const created = new Date(card.createdAt);
    const info = getISOWeekAndYear(created);
    const key = `${info.year}-${info.week}`;
    const bucket = weekBuckets.get(key) || [];
    bucket.push(card);
    weekBuckets.set(key, bucket);
  });

  const result: WeekData[] = [];
  for (let offset = 0; offset < 3; offset += 1) {
    const week = current.week - offset;
    const key = `${current.year}-${week}`;
    const cardsInWeek = weekBuckets.get(key) || [];

    const days: WeekCell[] = DAY_KEYS.map((day, index) => {
      const card = cardsInWeek.find((item) => dayKeyFromDate(item.createdAt) === day);
      if (card) return { day, card };
      if (offset === 0) return { day, placeholder: String(6 + index) };
      return { day };
    });

    result.push({
      number: week,
      dateRange: offset === 0 ? '' : weekDateRangeFromYearWeek(current.year, week),
      days,
    });
  }

  return result;
}

export default function ProfilesScreen({ navigation }: Props) {
  const [cards, setCards] = React.useState<Card[]>([]);
  const [entitlementMode, setEntitlementMode] = React.useState<EntitlementMode>('guest');
  const [savingEntitlement, setSavingEntitlement] = React.useState(false);

  React.useEffect(() => {
    const queryCards = database
      .get<Card>('cards')
      .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

    const load = async () => {
      try {
        const data = await queryCards.fetch();
        setCards(data);
      } catch (error) {
        console.error('[Profiles] load cards failed:', error);
        setCards([]);
      }
    };

    void load();
    const sub = queryCards.observe().subscribe((data) => setCards(data));
    return () => sub.unsubscribe();
  }, []);

  const refreshEntitlementMode = React.useCallback(async () => {
    try {
      const settings = await loadUserSettings();
      setEntitlementMode(settings.entitlementMode);
    } catch (error) {
      console.error('[Profiles] load entitlement mode failed:', error);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void refreshEntitlementMode();
    }, [refreshEntitlementMode])
  );

  const handleToggleEntitlementMode = React.useCallback(async () => {
    if (savingEntitlement) return;
    setSavingEntitlement(true);
    try {
      const settings = await loadUserSettings();
      const nextMode: EntitlementMode =
        settings.entitlementMode === 'premium' ? 'guest' : 'premium';
      await saveUserSettings({
        ...settings,
        entitlementMode: nextMode,
      });
      setEntitlementMode(nextMode);
      Alert.alert(
        '已切換權限模式',
        nextMode === 'premium' ? '目前為 Premium 模式。' : '目前為 Guest 模式。'
      );
    } catch (error) {
      console.error('[Profiles] toggle entitlement failed:', error);
      Alert.alert('切換失敗', '請稍後再試。');
    } finally {
      setSavingEntitlement(false);
    }
  }, [savingEntitlement]);

  const weeks = React.useMemo(() => buildWeeks(cards), [cards]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerSection}>
          <View style={styles.nameRow}>
            <View>
              <Text style={styles.displayName}>jedda</Text>
              <Text style={styles.subName}>Jedda CP</Text>
            </View>
            <View style={styles.avatarWrap}>
              <Text style={styles.avatarText}>👤</Text>
            </View>
          </View>

          <View style={styles.statsWrap}>
            <View style={styles.statRow}>
              <Text style={styles.statIcon}>📅</Text>
              <Text style={styles.statText}>Weeks posted: {Math.max(weeks.length, 29)}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statIcon}>📍</Text>
              <Text style={styles.statText}>Homebase: Bay Area, CA</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => Alert.alert('Recaps', 'Recaps 功能下一步接上資料來源。')}
            >
              <Text style={styles.actionButtonText}>Recaps</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleToggleEntitlementMode}
            >
              <Text style={styles.actionButtonText}>
                {savingEntitlement
                  ? '切換中...'
                  : entitlementMode === 'premium'
                    ? '切換為 Guest'
                    : '切換為 Premium'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.entitlementBadge}>
            <Text style={styles.entitlementBadgeText}>
              目前權限：{entitlementMode === 'premium' ? 'Premium' : 'Guest'}
            </Text>
          </View>
        </View>

        <View style={styles.weeksSection}>
          {weeks.map((week) => (
            <View key={`week-${week.number}`} style={styles.weekBlock}>
              <View style={styles.weekHeader}>
                <View style={styles.weekTitleRow}>
                  <Text style={styles.weekTitle}>Week {week.number}</Text>
                  {week.dateRange ? <Text style={styles.weekRange}>{week.dateRange}</Text> : null}
                </View>
                <TouchableOpacity style={styles.moreButton}>
                  <Text style={styles.moreButtonText}>⋯</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.daysGrid}>
                {week.days.map((dayData) => (
                  <TouchableOpacity
                    key={`${week.number}-${dayData.day}`}
                    style={styles.dayCell}
                    activeOpacity={dayData.card ? 0.85 : 1}
                    onPress={() => {
                      if (!dayData.card) return;
                      navigation.navigate('CardDetail', { cardId: dayData.card.id });
                    }}
                  >
                    {dayData.card ? (
                      <View style={styles.dayCardFill}>
                        <Text style={styles.dayWord} numberOfLines={2}>
                          {dayData.card.targetWord}
                        </Text>
                        <Text style={styles.dayPos} numberOfLines={1}>
                          {dayData.card.partOfSpeech || 'word'}
                        </Text>
                        <View style={styles.dayBadgeWrap}>
                          <Text style={styles.dayBadge}>{dayData.day}</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.dayEmptyFill}>
                        <Text style={styles.dayEmptyNumber}>{dayData.placeholder || ''}</Text>
                        <Text style={styles.dayEmptyLabel}>{dayData.day}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 120 },
  headerSection: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  displayName: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: '#000',
    lineHeight: 41,
  },
  subName: { fontSize: 15, color: '#8E8E93', marginTop: 2 },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ECECEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 26 },
  statsWrap: { gap: 8, marginBottom: 14 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statIcon: { fontSize: 15 },
  statText: { fontSize: 15, color: '#000' },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  actionButtonText: { fontSize: 15, fontWeight: '600', color: '#000' },
  entitlementBadge: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  entitlementBadgeText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },
  weeksSection: { paddingHorizontal: 20, paddingBottom: 24, gap: 20 },
  weekBlock: {},
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  weekTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  weekTitle: { fontSize: 17, fontWeight: '600', color: '#000' },
  weekRange: { fontSize: 15, color: '#8E8E93' },
  moreButton: { paddingHorizontal: 6, paddingVertical: 2 },
  moreButtonText: { fontSize: 22, color: '#000' },
  daysGrid: { flexDirection: 'row', gap: 6 },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F2F2F7',
  },
  dayCardFill: {
    flex: 1,
    backgroundColor: '#FFDFAF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  dayWord: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    lineHeight: 16,
  },
  dayPos: {
    marginTop: 4,
    fontSize: 10,
    color: '#666',
  },
  dayBadgeWrap: {
    position: 'absolute',
    top: 4,
    left: 4,
  },
  dayBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#000',
  },
  dayEmptyFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
  },
  dayEmptyNumber: {
    fontSize: 34,
    fontWeight: '300',
    color: '#C7C7CC',
    lineHeight: 38,
  },
  dayEmptyLabel: { fontSize: 11, color: '#C7C7CC', marginTop: 4 },
});
