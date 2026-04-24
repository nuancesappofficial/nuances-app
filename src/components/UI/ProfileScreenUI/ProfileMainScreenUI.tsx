import React from 'react';
import {
  FlatList,
  Image,
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type Card from '@database/models/Card';
import ProfileSettingsModalUI from './ProfileSettingsModalUI';

export type HeatMapDay = {
  key: string;
  date: Date;
  dayNumber: string;
  cards: Card[];
  card?: Card;
  imageUri?: string;
};

export type HeatMapMonth = {
  key: string;
  monthDate: Date;
  monthLabel: string;
  days: HeatMapDay[];
};

type Props = {
  overlayMode?: boolean;
  title: string;
  subtitle: string;
  profileImageUri?: string | null;
  todayDateKey: string;
  heatMapMonths: HeatMapMonth[];
  initialMonthIndex: number;
  entitlementMode: 'guest' | 'premium';
  savingEntitlement: boolean;
  settingsVisible: boolean;
  onPressRecaps: () => void;
  onPressSettings: () => void;
  onCloseSettings: () => void;
  onPressUploadProfilePic: () => void;
  onToggleEntitlement: () => void;
  onPressBack: () => void;
  onPressMenu: () => void;
  onPressDay: (day: HeatMapDay) => void;
};

const GRID_SIZE = 42;
const GRID_CELL_VERTICAL_PADDING = 4;
const GRID_ROW_HEIGHT = GRID_SIZE + GRID_CELL_VERTICAL_PADDING * 2;
const DAY_TILE_RADIUS = 14;
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;
const CALENDAR_CELL_COUNT = 42;
const BASE_BG = '#ADD8E6';
const PANEL_BG = '#7BA8C7';

function canUseSFSymbolsOnDevice() {
  if (Platform.OS !== 'ios') return false;
  const version =
    typeof Platform.Version === 'string'
      ? parseInt(Platform.Version.split('.')[0] || '0', 10)
      : Platform.Version;
  return Number.isFinite(version) && version >= 17;
}

function IconSymbol({
  name,
  fallback,
  size = 22,
  color = '#FFFFFF',
}: {
  name:
    | 'chevron.left'
    | 'ellipsis'
    | 'clock.arrow.circlepath'
    | 'gearshape'
    | 'person.crop.circle.fill';
  fallback: string;
  size?: number;
  color?: string;
}) {
  if (!canUseSFSymbolsOnDevice()) {
    return <Text style={{ color, fontSize: size, lineHeight: size + 2 }}>{fallback}</Text>;
  }

  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      type="hierarchical"
      style={{ width: size, height: size }}
      fallback={<Text style={{ color, fontSize: size, lineHeight: size + 2 }}>{fallback}</Text>}
    />
  );
}

function HeaderAction({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.headerAction} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.headerActionIcon}>{icon}</View>
      <Text style={styles.headerActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function HeatMapCircle({
  item,
  isToday,
  onPressDay,
}: {
  item: HeatMapDay;
  isToday: boolean;
  onPressDay: (day: HeatMapDay) => void;
}) {
  const circleStyle = {
    width: GRID_SIZE,
    height: GRID_SIZE,
    borderRadius: DAY_TILE_RADIUS,
  } as const;

  const content = item.imageUri ? (
    <View style={[styles.dayCircle, circleStyle]}>
      <Image source={{ uri: item.imageUri }} style={[styles.dayCircleImage, circleStyle]} resizeMode="cover" />
      <View style={styles.dayImageOverlay} />
      <Text style={styles.dayNumber}>{item.dayNumber}</Text>
    </View>
  ) : (
    <View style={[styles.dayCircle, styles.dayCircleEmpty, circleStyle]}>
      <Text style={styles.dayNumber}>{item.dayNumber}</Text>
    </View>
  );

  return (
    <TouchableOpacity
      style={styles.dayWrap}
      activeOpacity={item.cards.length ? 0.88 : 1}
      onPress={() => {
        if (!item.cards.length) return;
        onPressDay(item);
      }}
    >
      {isToday ? (
        <>
          <View style={styles.todayGlow} />
          <View style={styles.todayRing} />
        </>
      ) : null}
      {content}
    </TouchableOpacity>
  );
}

export default function ProfileMainScreenUI({
  overlayMode = false,
  title,
  subtitle,
  profileImageUri,
  todayDateKey,
  heatMapMonths,
  initialMonthIndex,
  entitlementMode,
  savingEntitlement,
  settingsVisible,
  onPressRecaps,
  onPressSettings,
  onCloseSettings,
  onPressUploadProfilePic,
  onToggleEntitlement,
  onPressBack,
  onPressMenu,
  onPressDay,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const listRef = React.useRef<FlatList<any> | null>(null);
  const [pagerWidth, setPagerWidth] = React.useState<number>(0);
  const [currentMonthIndex, setCurrentMonthIndex] = React.useState<number>(0);

  const handlePagerLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.max(1, Math.round(event.nativeEvent.layout.width));
    setPagerWidth((prev) => (prev === nextWidth ? prev : nextWidth));
  }, []);

  const monthsWithCalendarItems = React.useMemo(
    () =>
      heatMapMonths.map((month) => {
        const firstDate = month.days[0]?.date;
        const firstWeekday = firstDate
          ? new Date(firstDate.getFullYear(), firstDate.getMonth(), 1).getDay()
          : 0;
        const usedRowCount = Math.ceil((firstWeekday + month.days.length) / 7);

        return {
          ...month,
          usedRowCount,
          calendarItems: [
            ...Array.from({ length: firstWeekday }, (_, index) => ({
              key: `${month.key}-placeholder-${index}`,
              isPlaceholder: true as const,
            })),
            ...month.days,
            ...Array.from(
              { length: Math.max(0, CALENDAR_CELL_COUNT - (firstWeekday + month.days.length)) },
              (_, index) => ({
                key: `${month.key}-tail-placeholder-${index}`,
                isPlaceholder: true as const,
              })
            ),
          ],
        };
      }),
    [heatMapMonths]
  );

  // 計算安全的初始索引，避免超出陣列範圍
  const safeInitialIndex = Math.max(0, Math.min(initialMonthIndex, monthsWithCalendarItems.length - 1));
  const fallbackPagerWidth = Math.max(1, screenWidth - 32);
  const effectivePagerWidth = pagerWidth > 1 ? pagerWidth : fallbackPagerWidth;
  const maxUsedRowCount = React.useMemo(
    () => monthsWithCalendarItems.reduce((acc, month) => Math.max(acc, month.usedRowCount), 1),
    [monthsWithCalendarItems]
  );
  const heatMapPanelHeight = 28 + 16 + maxUsedRowCount * GRID_ROW_HEIGHT + 6;

  React.useEffect(() => {
    setCurrentMonthIndex(safeInitialIndex);
  }, [safeInitialIndex]);

  const activeMonth = monthsWithCalendarItems[currentMonthIndex] ?? monthsWithCalendarItems[safeInitialIndex];
  const activeMonthDate = activeMonth?.monthDate ?? new Date();
  const monthTitle = `${activeMonthDate.getMonth() + 1}月`;
  const monthButtonLabel = `${activeMonthDate.getFullYear()}年 ${activeMonthDate.getMonth() + 1}月`;

  const scrollToMonth = React.useCallback(
    (index: number) => {
      const total = monthsWithCalendarItems.length;
      if (!total) return;
      const wrapped = ((index % total) + total) % total;
      listRef.current?.scrollToOffset({ offset: wrapped * effectivePagerWidth, animated: true });
      setCurrentMonthIndex(wrapped);
    },
    [monthsWithCalendarItems.length, effectivePagerWidth]
  );

  return (
    <View style={[styles.root, overlayMode && styles.rootOverlay]}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.profilePanel}>
          <View style={styles.avatarWrap}>
            {profileImageUri ? (
              <Image source={{ uri: profileImageUri }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <View style={styles.avatarFallback}>
                <IconSymbol name="person.crop.circle.fill" fallback="◉" size={192} color="#FFFFFF" />
              </View>
            )}
          </View>

          <View style={styles.titleBlock}>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>

          <View style={styles.actionsRow}>
            <HeaderAction
              label="Recaps"
              icon={<IconSymbol name="clock.arrow.circlepath" fallback="↺" size={22} color="#FFFFFF" />}
              onPress={onPressRecaps}
            />
            <HeaderAction
              label="Settings"
              icon={<IconSymbol name="gearshape" fallback="⚙" size={22} color="#FFFFFF" />}
              onPress={onPressSettings}
            />
          </View>
        </View>

        <View style={styles.monthHeaderRow}>
          <Text style={styles.monthTitleOutside}>{monthTitle}</Text>
          <View style={styles.monthControlRow}>
            <TouchableOpacity
              style={styles.monthNavButton}
              activeOpacity={0.85}
              onPress={() => scrollToMonth(currentMonthIndex - 1)}
            >
              <Text style={styles.monthNavButtonText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.monthSelectButton}
              activeOpacity={0.85}
              onPress={() => scrollToMonth((currentMonthIndex + 1) % Math.max(1, monthsWithCalendarItems.length))}
            >
              <Text style={styles.monthSelectButtonText}>{monthButtonLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.monthNavButton}
              activeOpacity={0.85}
              onPress={() => scrollToMonth(currentMonthIndex + 1)}
            >
              <Text style={styles.monthNavButtonText}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.heatMapPanelShadow, { height: heatMapPanelHeight }]}>
          <View style={styles.heatMapPanel}>
            <View style={styles.heatMapPagerWrap} onLayout={handlePagerLayout}>
            <FlatList
              ref={listRef}
              data={monthsWithCalendarItems}
              initialScrollIndex={safeInitialIndex}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => (
                <View style={[styles.monthPage, { height: heatMapPanelHeight, width: effectivePagerWidth }]}>
                  <View
                    style={[
                      styles.monthPageInner,
                      { paddingBottom: 2 },
                    ]}
                  >
                    <View style={styles.calendarBlock}>
                      <View style={styles.weekdayRow}>
                        {WEEKDAY_LABELS.map((label) => (
                          <View key={`${item.key}-${label}`} style={styles.weekdayCell}>
                            <Text style={styles.weekdayText}>{label}</Text>
                          </View>
                        ))}
                      </View>

                      <View style={styles.calendarGridArea}>
                        <View
                          style={[
                            styles.gridWrap,
                            { height: GRID_ROW_HEIGHT * item.usedRowCount },
                          ]}
                        >
                          {item.calendarItems.map((calendarItem: HeatMapDay | { key: string; isPlaceholder: true }) => (
                            'isPlaceholder' in calendarItem ? (
                              <View key={calendarItem.key} style={styles.gridCell}>
                                <View style={styles.placeholderCell} />
                              </View>
                            ) : (
                              <View key={calendarItem.key} style={styles.gridCell}>
                                <HeatMapCircle
                                  item={calendarItem}
                                  isToday={calendarItem.key === todayDateKey}
                                  onPressDay={onPressDay}
                                />
                              </View>
                            )
                          ))}
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              )}
              horizontal
              pagingEnabled
              bounces
              alwaysBounceHorizontal={false}
              alwaysBounceVertical={false}
              disableIntervalMomentum
              decelerationRate="fast"
              snapToAlignment="start"
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.heatMapContent}
              getItemLayout={(_, index) => ({
                length: effectivePagerWidth,
                offset: effectivePagerWidth * index,
                index,
              })}
              onScrollToIndexFailed={(info) => {
                listRef.current?.scrollToOffset({ offset: info.index * effectivePagerWidth, animated: true });
              }}
              onMomentumScrollEnd={(event) => {
                const width = Math.max(1, effectivePagerWidth || event.nativeEvent.layoutMeasurement.width || 1);
                const next = Math.round(event.nativeEvent.contentOffset.x / width);
                setCurrentMonthIndex(Math.max(0, Math.min(next, monthsWithCalendarItems.length - 1)));
              }}
              style={styles.heatMapScroller}
            />
            </View>
          </View>
        </View>
      </SafeAreaView>

      <ProfileSettingsModalUI
        visible={settingsVisible}
        entitlementMode={entitlementMode}
        savingEntitlement={savingEntitlement}
        onClose={onCloseSettings}
        onPressUploadProfilePic={onPressUploadProfilePic}
        onToggleEntitlement={onToggleEntitlement}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BASE_BG,
  },
  rootOverlay: {
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    backgroundColor: BASE_BG,
  },
  topNavRow: {
    display: 'none',
  },
  profilePanel: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 28,
    backgroundColor: PANEL_BG,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    alignItems: 'center',
  },
  avatarWrap: {
    width: 160,
    height: 160,
    borderRadius: 80,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.72)',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  titleBlock: {
    alignItems: 'center',
    marginTop: 0,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '600',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 30,
    marginTop: 12,
    paddingBottom: 2,
  },
  headerAction: {
    alignItems: 'center',
    gap: 8,
    minWidth: 72,
  },
  headerActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  headerActionLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  heatMapScroller: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  heatMapContent: {
    paddingBottom: 0,
    backgroundColor: 'transparent',
  },
  heatMapPanelShadow: {
    marginTop: 6,
    marginHorizontal: 16,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 8,
  },
  heatMapPagerWrap: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  heatMapPanel: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    backgroundColor: PANEL_BG,
    overflow: 'hidden',
  },
  monthPage: {
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  monthPageInner: {
    flex: 1,
    justifyContent: 'flex-start',
    backgroundColor: 'transparent',
  },
  calendarBlock: {
    backgroundColor: 'transparent',
  },
  monthHeaderRow: {
    marginTop: 2,
    marginHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthTitleOutside: {
    color: '#FFFFFF',
    fontSize: 46,
    fontWeight: '800',
  },
  monthControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  monthNavButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  monthNavButtonText: {
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '500',
    marginTop: -2,
  },
  monthSelectButton: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  monthSelectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  weekdayRow: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 14,
    marginBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  weekdayCell: {
    width: '14.285714%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '700',
  },
  calendarGridArea: {
    justifyContent: 'flex-end',
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  gridCell: {
    width: '14.285714%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: GRID_CELL_VERTICAL_PADDING,
  },
  dayWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  todayGlow: {
    position: 'absolute',
    width: GRID_SIZE + 18,
    height: GRID_SIZE + 18,
    borderRadius: DAY_TILE_RADIUS + 9,
    backgroundColor: 'rgba(255, 179, 102, 0.14)',
    shadowColor: '#FFB36B',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 0,
  },
  todayRing: {
    position: 'absolute',
    width: GRID_SIZE + 10,
    height: GRID_SIZE + 10,
    borderRadius: DAY_TILE_RADIUS + 5,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'rgba(255, 205, 138, 0.95)',
    zIndex: 0,
  },
  placeholderCell: {
    width: GRID_SIZE,
    height: GRID_SIZE,
    opacity: 0,
  },
  dayCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(50, 65, 110, 0.5)',
  },
  dayCircleImage: {
    ...StyleSheet.absoluteFillObject,
  },
  dayCircleEmpty: {
    backgroundColor: 'rgba(50, 65, 110, 0.25)',
  },
  dayImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 12, 18, 0.34)',
  },
  dayNumber: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
