import React from 'react';
import {
  FlatList,
  Image,
  ImageBackground,
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type Card from '@database/models/Card';
import ProfileSettingsModalUI from './ProfileSettingsModalUI';

const PROFILE_SCREEN_BG = require('../../../../assets/ProfileScreenBG.png');

export type HeatMapDay = {
  key: string;
  date: Date;
  dayNumber: string;
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
  title: string;
  subtitle: string;
  profileImageUri?: string | null;
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
  onPressDay: (cardId: string) => void;
};

const GRID_SIZE = 42;
const GRID_CELL_VERTICAL_PADDING = 4;
const GRID_ROW_HEIGHT = GRID_SIZE + GRID_CELL_VERTICAL_PADDING * 2;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const CALENDAR_CELL_COUNT = 42;
const TAB_BAR_CLEARANCE = 100;

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
  onPressDay,
}: {
  item: HeatMapDay;
  onPressDay: (cardId: string) => void;
}) {
  const circleStyle = {
    width: GRID_SIZE,
    height: GRID_SIZE,
    borderRadius: GRID_SIZE / 2,
  } as const;

  const content = item.imageUri ? (
    <ImageBackground source={{ uri: item.imageUri }} style={[styles.dayCircle, circleStyle]} imageStyle={circleStyle}>
      <View style={styles.dayImageOverlay} />
      <Text style={styles.dayNumber}>{item.dayNumber}</Text>
    </ImageBackground>
  ) : (
    <View style={[styles.dayCircle, styles.dayCircleEmpty, circleStyle]}>
      <Text style={styles.dayNumber}>{item.dayNumber}</Text>
    </View>
  );

  return (
    <TouchableOpacity
      style={styles.dayWrap}
      activeOpacity={item.card ? 0.88 : 1}
      onPress={() => {
        if (!item.card) return;
        onPressDay(item.card.id);
      }}
    >
      {content}
    </TouchableOpacity>
  );
}

export default function ProfileMainScreenUI({
  title,
  subtitle,
  profileImageUri,
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
  const insets = useSafeAreaInsets();
  const [pagerHeight, setPagerHeight] = React.useState<number>(420);

  const handlePagerLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.max(320, Math.round(event.nativeEvent.layout.height));
    setPagerHeight((prev) => (prev === nextHeight ? prev : nextHeight));
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

  return (
    <View style={styles.root}>
      <Image source={PROFILE_SCREEN_BG} style={styles.backgroundImage} resizeMode="cover" />

      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerContainer}>
          <View style={styles.coverArea}>
            <View style={styles.topNavRow}>
              <TouchableOpacity style={styles.navButton} activeOpacity={0.85} onPress={onPressBack}>
                <IconSymbol name="chevron.left" fallback="<" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.navButton} activeOpacity={0.85} onPress={onPressMenu}>
                <IconSymbol name="ellipsis" fallback="..." size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.headerOverlay}>
              <View style={styles.avatarWrap}>
                {profileImageUri ? (
                  <Image source={{ uri: profileImageUri }} style={styles.avatarImage} resizeMode="cover" />
                ) : (
                  <View style={styles.avatarFallback}>
                    <IconSymbol name="person.crop.circle.fill" fallback="◉" size={42} color="#FFFFFF" />
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
          </View>
        </View>

        <View style={styles.heatMapPagerWrap} onLayout={handlePagerLayout}>
          <FlatList
            data={monthsWithCalendarItems}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => (
              <View style={[styles.monthPage, { height: pagerHeight }]}>
                <View
                  style={[
                    styles.monthPageInner,
                    { paddingBottom: TAB_BAR_CLEARANCE + Math.max(insets.bottom, 8) },
                  ]}
                >
                  <View style={styles.calendarBlock}>
                    <Text style={styles.monthLabel}>{item.monthLabel}</Text>

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
                        {item.calendarItems.map((calendarItem) => (
                          'isPlaceholder' in calendarItem ? (
                            <View key={calendarItem.key} style={styles.gridCell}>
                              <View style={styles.placeholderCell} />
                            </View>
                          ) : (
                            <View key={calendarItem.key} style={styles.gridCell}>
                              <HeatMapCircle item={calendarItem} onPressDay={onPressDay} />
                            </View>
                          )
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )}
            pagingEnabled
            bounces={false}
            alwaysBounceVertical={false}
            disableIntervalMomentum
            decelerationRate="fast"
            snapToInterval={pagerHeight}
            snapToAlignment="start"
            initialScrollIndex={Math.max(0, Math.min(initialMonthIndex, monthsWithCalendarItems.length - 1))}
            showsVerticalScrollIndicator={false}
            style={styles.heatMapScroller}
            contentContainerStyle={styles.heatMapContent}
            getItemLayout={(_, index) => ({
              length: pagerHeight,
              offset: pagerHeight * index,
              index,
            })}
          />
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
    backgroundColor: '#000000',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerContainer: {
    backgroundColor: 'transparent',
    marginBottom: -65,
    zIndex: 2,
  },
  coverArea: {
    height: 286,
    width: '100%',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  topNavRow: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    alignItems: 'center',
    zIndex: 10,
  },
  navButton: {
    minWidth: 36,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -34,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
    marginBottom: 12,
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
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  titleBlock: {
    alignItems: 'center',
    marginTop: 0,
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '600',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    marginTop: 22,
    paddingBottom: 24,
  },
  headerAction: {
    alignItems: 'center',
    gap: 8,
    minWidth: 72,
  },
  headerActionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
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
  heatMapPagerWrap: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  monthPage: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  monthPageInner: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  calendarBlock: {
    backgroundColor: 'transparent',
  },
  monthLabel: {
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 20,
  },
  weekdayRow: {
    flexDirection: 'row',
    width: '100%',
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
    color: 'rgba(255,255,255,0.72)',
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
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  dayCircleEmpty: {
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  dayImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 12, 18, 0.34)',
  },
  dayNumber: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
