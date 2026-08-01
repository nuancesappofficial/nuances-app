import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import type Card from '@database/models/Card';
import {
  type EntitlementMode,
  type ThemeMode,
  type UILanguage,
} from '@services/settings/userSettings';
import { tUI } from '../../../i18n/uiLanguage';
import {
  resolveStickerFont,
  type StickerFontKey,
} from '../../../theme/stickerFonts';
import {
  CONTAINER_BG,
  CONTAINER_NEON_GLOW,
  CONTAINER_NEON_OUTLINE,
  MODAL_CTA_COLOR,
  SCREEN_BG,
  TEXT_ON_BG,
  TEXT_ON_CTA,
  TEXT_ON_CONTAINER,
  resolveThemeColors,
} from '../../../theme/colors';

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
  entitlementMode: EntitlementMode;
  isDeletingAccount: boolean;
  uiLanguage: UILanguage;
  themeMode: ThemeMode;
  stickerFontKey: StickerFontKey;
  stickerFontScalePercent: number;
  onPressUploadProfilePic: () => void;
  onOpenMembershipModal: () => void;
  devBypassEnabled?: boolean;
  onDevSetMembership?: (mode: 'free' | 'trial' | 'premium') => void;
  onReportFeedback: () => void;
  onDeleteAccount: () => void;
  onReplayVideoTutorial: () => void;
  onOpenSettingsOption: (kind: 'language' | 'theme' | 'font') => void;
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
const BASE_BG = SCREEN_BG;
const PANEL_BG = CONTAINER_BG;
const TEXT_PRIMARY = TEXT_ON_CONTAINER;
const TEXT_SECONDARY = TEXT_ON_CONTAINER;
const TEXT_MUTED = 'rgba(244, 246, 255, 0.62)';
const TEXT_ON_BASE = TEXT_ON_BG;
const HEATMAP_TOP_PADDING = 28;
const HEATMAP_WEEKDAY_AND_GAP = 16;
const HEATMAP_BOTTOM_PADDING = 6;
const HEATMAP_STICKER_REFERENCE_WORD = 'intellect';
const MONTH_PICKER_ROW_HEIGHT = 56;
const MONTH_PICKER_WHEEL_HEIGHT = 300;
const MONTH_PICKER_WHEEL_SIDE_PADDING =
  (MONTH_PICKER_WHEEL_HEIGHT - MONTH_PICKER_ROW_HEIGHT) / 2;
const MONTH_PICKER_ANIM_DURATION = 240;
type MonthPickerItem = {
  index: number;
  year: number;
  month: number;
};

function getHeatMapPanelHeight(usedRowCount: number): number {
  return (
    HEATMAP_TOP_PADDING +
    HEATMAP_WEEKDAY_AND_GAP +
    usedRowCount * GRID_ROW_HEIGHT +
    HEATMAP_BOTTOM_PADDING
  );
}

function normalizeStickerText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getVisualTextLength(value: string): number {
  let score = 0;
  for (const char of value) {
    if (/\s/.test(char)) {
      score += 0.35;
    } else if (/[A-Z]/.test(char)) {
      score += 0.75;
    } else if (/[a-z0-9]/.test(char)) {
      score += 0.62;
    } else {
      score += 1;
    }
  }
  return score;
}

function getHeatmapStickerLabels(item: HeatMapDay, limit = 2): string[] {
  if (!item.cards?.length) return [];
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const card of item.cards) {
    const text = normalizeStickerText(
      (card.targetPhrase || card.targetWord || '').trim()
    );
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(text);
    if (labels.length >= limit) break;
  }
  return labels;
}

function getHeatmapStickerFontSize(label: string, usableWidth: number): number {
  const widthFactor = 0.66;
  const referenceVisualLength = getVisualTextLength(
    HEATMAP_STICKER_REFERENCE_WORD
  );
  const labelVisualLength = getVisualTextLength(label);
  const referenceFontSize =
    usableWidth / Math.max(1.2, referenceVisualLength * widthFactor);
  const solvedFontSize =
    usableWidth / Math.max(1.2, labelVisualLength * widthFactor);

  return Math.max(7.5, Math.min(referenceFontSize, solvedFontSize));
}

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
  color = TEXT_PRIMARY,
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
    return (
      <Text style={{ color, fontSize: size, lineHeight: size + 2 }}>
        {fallback}
      </Text>
    );
  }

  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      type="hierarchical"
      style={{ width: size, height: size }}
      fallback={
        <Text style={{ color, fontSize: size, lineHeight: size + 2 }}>
          {fallback}
        </Text>
      }
    />
  );
}

function HeatMapCircle({
  item,
  isToday,
  onPressDay,
  palette,
  isLight,
  stickerFontKey,
  stickerFontScalePercent,
}: {
  item: HeatMapDay;
  isToday: boolean;
  onPressDay: (day: HeatMapDay) => void;
  palette: ReturnType<typeof resolveThemeColors>;
  isLight: boolean;
  stickerFontKey: StickerFontKey;
  stickerFontScalePercent: number;
}) {
  const circleStyle = {
    width: GRID_SIZE,
    height: GRID_SIZE,
    borderRadius: DAY_TILE_RADIUS,
  } as const;

  const hasCards = item.cards.length > 0;
  const stickerLabels = getHeatmapStickerLabels(item, 2);
  const hasTwoStickers = stickerLabels.length > 1;

  const renderSticker = (label: string, index: number) => {
    const capped = label.length > 16 ? `${label.slice(0, 16)}…` : label;
    const dynamicWidth = GRID_SIZE + 14;
    const textHorizontalPadding = 4;
    const usableWidth = Math.max(22, GRID_SIZE - textHorizontalPadding * 2);
    const fontSize =
      getHeatmapStickerFontSize(capped, usableWidth) *
      (stickerFontScalePercent / 100);
    const strokeWidth = Math.max(2, Math.min(3.2, fontSize * 0.23));
    const rowStyle =
      index === 0 ? styles.dayStickerTokenTop : styles.dayStickerTokenBottom;
    const stickerFont = resolveStickerFont(stickerFontKey);
    return (
      <View
        key={`${item.key}-sticker-${index}`}
        style={[styles.dayStickerToken, rowStyle]}
      >
        <Svg
          width={dynamicWidth}
          height={26}
          viewBox={`0 0 ${dynamicWidth} 26`}
          style={styles.dayStickerSvg}
        >
          <SvgText
            x={dynamicWidth / 2}
            y={18}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            fontSize={fontSize}
            fontWeight="900"
            fontFamily={stickerFont.fontFamily}
            textAnchor="middle"
            letterSpacing={stickerFont.letterSpacing * 0.52}
          >
            {capped}
          </SvgText>
          <SvgText
            x={dynamicWidth / 2}
            y={18}
            fill="#050505"
            fontSize={fontSize}
            fontWeight="900"
            fontFamily={stickerFont.fontFamily}
            textAnchor="middle"
            letterSpacing={stickerFont.letterSpacing * 0.52}
          >
            {capped}
          </SvgText>
        </Svg>
      </View>
    );
  };

  const content = hasCards ? (
    <View
      style={[
        styles.dayCircle,
        styles.dayCircleSticker,
        circleStyle,
        { backgroundColor: palette.screenBg },
      ]}
    >
      <View style={styles.dayStickerCloud}>
        {stickerLabels.map((label, index) => renderSticker(label, index))}
      </View>
    </View>
  ) : (
    <View
      style={[
        styles.dayCircle,
        styles.dayCircleEmpty,
        circleStyle,
        { backgroundColor: palette.screenBg },
      ]}
    >
      <Text
        style={[styles.dayNumber, { color: isLight ? '#0F172A' : '#EAF3FF' }]}
      >
        {item.dayNumber}
      </Text>
    </View>
  );

  return (
    <Pressable
      style={({ pressed }) => [
        styles.dayWrap,
        pressed && hasCards ? styles.profileMediumButtonPressed : null,
      ]}
      onPress={() => {
        if (!hasCards) return;
        onPressDay(item);
      }}
    >
      {isToday ? (
        <>
          <View
            style={[
              styles.todayGlow,
              isLight
                ? {
                    backgroundColor: 'rgba(78,175,244,0.16)',
                    shadowColor: '#4EAFF4',
                  }
                : null,
            ]}
          />
          <View
            style={[
              styles.todayRing,
              isLight ? { borderColor: '#4EAFF4' } : null,
            ]}
          />
        </>
      ) : null}
      {content}
    </Pressable>
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
  isDeletingAccount,
  uiLanguage,
  themeMode,
  stickerFontKey,
  stickerFontScalePercent,
  onPressUploadProfilePic,
  onOpenMembershipModal,
  onReportFeedback,
  onDeleteAccount,
  onReplayVideoTutorial,
  onOpenSettingsOption,
  onPressBack,
  onPressMenu,
  onPressDay,
}: Props) {
  const colorScheme = useColorScheme();
  const palette = React.useMemo(
    () => resolveThemeColors(colorScheme),
    [colorScheme]
  );
  const isLight = colorScheme === 'light';
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const optionNavigationLockRef = React.useRef(false);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const listRef = React.useRef<FlatList<any> | null>(null);
  const [pagerWidth, setPagerWidth] = React.useState<number>(0);
  const [currentMonthIndex, setCurrentMonthIndex] = React.useState<number>(0);
  const [monthPickerVisible, setMonthPickerVisible] = React.useState(false);
  const [monthPickerYear, setMonthPickerYear] = React.useState<number>(0);
  const [monthPickerMonth, setMonthPickerMonth] = React.useState<number>(0);
  const monthPickerOverlayOpacity = React.useRef(new Animated.Value(0)).current;
  const monthPickerSheetTranslateY = React.useRef(
    new Animated.Value(40)
  ).current;
  const currentMonthIndexRef = React.useRef<number>(0);
  const pendingTargetIndexRef = React.useRef<number | null>(null);
  const yearWheelRef = React.useRef<FlatList<number> | null>(null);
  const monthWheelRef = React.useRef<FlatList<number> | null>(null);
  const edgePullX = React.useRef(new Animated.Value(0)).current;
  const edgeBounceAnimRef = React.useRef<Animated.CompositeAnimation | null>(
    null
  );
  const lastMonthPickerHapticIndexRef = React.useRef({ year: -1, month: -1 });
  const lastMonthPickerHapticAtRef = React.useRef(0);

  const handlePagerLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.max(1, Math.round(event.nativeEvent.layout.width));
    setPagerWidth((prev) => (prev === nextWidth ? prev : nextWidth));
  }, []);

  const monthsWithCalendarItems = React.useMemo(
    () =>
      heatMapMonths.map((month) => {
        const firstWeekday = new Date(
          month.monthDate.getFullYear(),
          month.monthDate.getMonth(),
          1
        ).getDay();
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
              {
                length: Math.max(
                  0,
                  CALENDAR_CELL_COUNT - (firstWeekday + month.days.length)
                ),
              },
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
  const safeInitialIndex = Math.max(
    0,
    Math.min(initialMonthIndex, monthsWithCalendarItems.length - 1)
  );
  const fallbackPagerWidth = Math.max(1, screenWidth - 32);
  const effectivePagerWidth = pagerWidth > 1 ? pagerWidth : fallbackPagerWidth;
  const maxUsedRowCount = React.useMemo(
    () =>
      monthsWithCalendarItems.reduce(
        (acc, month) => Math.max(acc, month.usedRowCount),
        1
      ),
    [monthsWithCalendarItems]
  );
  const stableMonthPageHeight = React.useMemo(
    () => getHeatMapPanelHeight(maxUsedRowCount),
    [maxUsedRowCount]
  );
  const initialPanelHeight = React.useMemo(() => {
    const initialMonth = monthsWithCalendarItems[safeInitialIndex];
    const rows = initialMonth?.usedRowCount ?? 1;
    return getHeatMapPanelHeight(rows);
  }, [monthsWithCalendarItems, safeInitialIndex]);
  const panelHeightAnim = React.useRef(
    new Animated.Value(initialPanelHeight)
  ).current;
  React.useEffect(() => {
    setCurrentMonthIndex(safeInitialIndex);
    currentMonthIndexRef.current = safeInitialIndex;
    pendingTargetIndexRef.current = null;
  }, [safeInitialIndex]);

  React.useEffect(() => {
    if (!isFocused) return;
    if (monthsWithCalendarItems.length === 0) return;
    const clamped = Math.max(
      0,
      Math.min(safeInitialIndex, monthsWithCalendarItems.length - 1)
    );
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: clamped * effectivePagerWidth,
        animated: false,
      });
      setCurrentMonthIndex(clamped);
      currentMonthIndexRef.current = clamped;
      pendingTargetIndexRef.current = null;
    });
  }, [
    isFocused,
    safeInitialIndex,
    monthsWithCalendarItems.length,
    effectivePagerWidth,
  ]);

  React.useEffect(
    () => () => {
      edgeBounceAnimRef.current?.stop();
    },
    []
  );

  const activeMonth =
    monthsWithCalendarItems[currentMonthIndex] ??
    monthsWithCalendarItems[safeInitialIndex];
  const activeMonthDate = activeMonth?.monthDate ?? new Date();
  const activeUsedRowCount = activeMonth?.usedRowCount ?? 1;
  const heatMapPanelHeight = React.useMemo(
    () => getHeatMapPanelHeight(activeUsedRowCount),
    [activeUsedRowCount]
  );
  const monthTitle = `${activeMonthDate.getMonth() + 1}月`;
  const monthButtonLabel = `${activeMonthDate.getFullYear()}年 ${activeMonthDate.getMonth() + 1}月`;
  const monthPickerSheetHeight = Math.max(380, Math.round(screenHeight * 0.5));
  const monthPickerItems = React.useMemo<MonthPickerItem[]>(
    () =>
      monthsWithCalendarItems.map((month, index) => ({
        index,
        year: month.monthDate.getFullYear(),
        month: month.monthDate.getMonth() + 1,
      })),
    [monthsWithCalendarItems]
  );
  const monthPickerYears = React.useMemo<number[]>(
    () =>
      Array.from(new Set(monthPickerItems.map((item) => item.year))).sort(
        (a, b) => a - b
      ),
    [monthPickerItems]
  );
  const monthPickerMonthsInYear = React.useMemo<number[]>(
    () =>
      monthPickerItems
        .filter((item) => item.year === monthPickerYear)
        .map((item) => item.month)
        .sort((a, b) => a - b),
    [monthPickerItems, monthPickerYear]
  );

  const closeMonthPicker = React.useCallback(() => {
    Animated.parallel([
      Animated.timing(monthPickerOverlayOpacity, {
        toValue: 0,
        duration: MONTH_PICKER_ANIM_DURATION - 40,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(monthPickerSheetTranslateY, {
        toValue: 40,
        duration: MONTH_PICKER_ANIM_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMonthPickerVisible(false);
      }
    });
  }, [monthPickerOverlayOpacity, monthPickerSheetTranslateY]);

  const openMonthPicker = React.useCallback(() => {
    const activeYear = activeMonthDate.getFullYear();
    const activeMonth = activeMonthDate.getMonth() + 1;
    setMonthPickerYear(activeYear);
    setMonthPickerMonth(activeMonth);
    setMonthPickerVisible(true);
    lastMonthPickerHapticIndexRef.current = { year: -1, month: -1 };
    lastMonthPickerHapticAtRef.current = 0;
    monthPickerOverlayOpacity.setValue(0);
    monthPickerSheetTranslateY.setValue(40);
    requestAnimationFrame(() => {
      const yearIndex = Math.max(
        0,
        monthPickerYears.findIndex((value) => value === activeYear)
      );
      const months = monthPickerItems
        .filter((item) => item.year === activeYear)
        .map((item) => item.month)
        .sort((a, b) => a - b);
      const monthIndex = Math.max(
        0,
        months.findIndex((value) => value === activeMonth)
      );
      yearWheelRef.current?.scrollToOffset({
        offset: yearIndex * MONTH_PICKER_ROW_HEIGHT,
        animated: false,
      });
      monthWheelRef.current?.scrollToOffset({
        offset: monthIndex * MONTH_PICKER_ROW_HEIGHT,
        animated: false,
      });
      Animated.parallel([
        Animated.timing(monthPickerOverlayOpacity, {
          toValue: 1,
          duration: MONTH_PICKER_ANIM_DURATION - 20,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(monthPickerSheetTranslateY, {
          toValue: 0,
          duration: MONTH_PICKER_ANIM_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [
    activeMonthDate,
    monthPickerItems,
    monthPickerOverlayOpacity,
    monthPickerSheetTranslateY,
    monthPickerYears,
  ]);

  React.useEffect(() => {
    panelHeightAnim.stopAnimation();
    Animated.timing(panelHeightAnim, {
      toValue: heatMapPanelHeight,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [heatMapPanelHeight, panelHeightAnim]);

  const triggerMonthPickerScrollHaptic = React.useCallback(
    (wheel: 'year' | 'month', offsetY: number) => {
      const nextIndex = Math.round(offsetY / MONTH_PICKER_ROW_HEIGHT);
      if (lastMonthPickerHapticIndexRef.current[wheel] === nextIndex) return;

      const now = Date.now();
      if (now - lastMonthPickerHapticAtRef.current < 42) return;
      lastMonthPickerHapticIndexRef.current = {
        ...lastMonthPickerHapticIndexRef.current,
        [wheel]: nextIndex,
      };
      lastMonthPickerHapticAtRef.current = now;
      void Haptics.selectionAsync();
    },
    []
  );

  const scrollToMonth = React.useCallback(
    (index: number) => {
      const total = monthsWithCalendarItems.length;
      if (!total) return;
      const clamped = Math.max(0, Math.min(index, total - 1));
      pendingTargetIndexRef.current = clamped;
      listRef.current?.scrollToOffset({
        offset: clamped * effectivePagerWidth,
        animated: true,
      });
      setCurrentMonthIndex(clamped);
      currentMonthIndexRef.current = clamped;
    },
    [monthsWithCalendarItems.length, effectivePagerWidth]
  );

  const runEdgeBounce = React.useCallback(
    (direction: 'left' | 'right') => {
      const amplitude = direction === 'left' ? 26 : -26;
      edgeBounceAnimRef.current?.stop();
      edgePullX.stopAnimation(() => {
        edgePullX.setValue(0);
        requestAnimationFrame(() => {
          const anim = Animated.sequence([
            Animated.timing(edgePullX, {
              toValue: amplitude,
              duration: 120,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.spring(edgePullX, {
              toValue: 0,
              stiffness: 230,
              damping: 18,
              mass: 0.8,
              useNativeDriver: true,
            }),
          ]);
          edgeBounceAnimRef.current = anim;
          anim.start(() => {
            edgeBounceAnimRef.current = null;
            edgePullX.setValue(0);
          });
        });
      });
    },
    [edgePullX]
  );

  const handleMonthNavPress = React.useCallback(
    (nextIndex: number) => {
      const total = monthsWithCalendarItems.length;
      if (!total) return;

      const current = currentMonthIndexRef.current;
      const isLeftBoundaryHit = current <= 0 && nextIndex < 0;
      const isRightBoundaryHit = current >= total - 1 && nextIndex > total - 1;

      if (isLeftBoundaryHit) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        runEdgeBounce('left');
        return;
      }

      if (isRightBoundaryHit) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        runEdgeBounce('right');
        return;
      }

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      scrollToMonth(nextIndex);
    },
    [monthsWithCalendarItems.length, runEdgeBounce, scrollToMonth]
  );

  const handleSelectMonthFromMenu = React.useCallback(
    (index: number) => {
      closeMonthPicker();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      scrollToMonth(index);
    },
    [closeMonthPicker, scrollToMonth]
  );

  React.useEffect(() => {
    if (!monthPickerVisible) return;
    if (monthPickerMonthsInYear.length === 0) return;
    if (!monthPickerMonthsInYear.includes(monthPickerMonth)) {
      const next = monthPickerMonthsInYear[0];
      setMonthPickerMonth(next);
      requestAnimationFrame(() => {
        monthWheelRef.current?.scrollToOffset({
          offset: 0,
          animated: true,
        });
      });
    }
  }, [monthPickerMonth, monthPickerMonthsInYear, monthPickerVisible]);

  const handleConfirmMonthPicker = React.useCallback(() => {
    const matched = monthPickerItems.find(
      (item) => item.year === monthPickerYear && item.month === monthPickerMonth
    );
    if (!matched) {
      closeMonthPicker();
      return;
    }
    handleSelectMonthFromMenu(matched.index);
  }, [
    closeMonthPicker,
    handleSelectMonthFromMenu,
    monthPickerItems,
    monthPickerMonth,
    monthPickerYear,
  ]);

  const selectedStickerFont = resolveStickerFont(stickerFontKey);
  const languageSummaryKey = {
    en: 'settings.language.english',
    'zh-TW': 'settings.language.chineseTraditional',
    'zh-CN': 'settings.language.chineseSimplified',
    ja: 'settings.language.japanese',
    ko: 'settings.language.korean',
    es: 'settings.language.spanish',
    fr: 'settings.language.french',
  } as const;
  const languageSummary = tUI(uiLanguage, languageSummaryKey[uiLanguage]);
  const themeSummary = tUI(
    uiLanguage,
    themeMode === 'light'
      ? 'settings.theme.light'
      : themeMode === 'dark'
        ? 'settings.theme.dark'
        : 'settings.theme.system'
  );
  const entitlementLabel =
    entitlementMode === 'premium'
      ? tUI(uiLanguage, 'common.premium')
      : entitlementMode === 'trial'
        ? tUI(uiLanguage, 'common.trial')
        : tUI(uiLanguage, 'common.free');

  const triggerOpenSettingsOption = React.useCallback(
    (kind: 'language' | 'theme' | 'font') => {
      if (optionNavigationLockRef.current) return;
      optionNavigationLockRef.current = true;
      onOpenSettingsOption(kind);
      setTimeout(() => {
        optionNavigationLockRef.current = false;
      }, 420);
    },
    [onOpenSettingsOption]
  );

  return (
    <View
      style={[
        styles.root,
        overlayMode && styles.rootOverlay,
        { backgroundColor: palette.screenBg },
      ]}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: palette.screenBg }]}
        edges={['top']}
      >
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={styles.screenScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.monthHeaderRow}>
            <Text
              style={[styles.monthTitleOutside, { color: palette.textOnBg }]}
            >
              {monthTitle}
            </Text>
            <View style={styles.monthControlRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.monthNavButton,
                  isLight ? { backgroundColor: palette.containerBg } : null,
                  pressed ? styles.profileIconButtonPressed : null,
                ]}
                onPress={() =>
                  handleMonthNavPress(currentMonthIndexRef.current - 1)
                }
              >
                <Text
                  style={[
                    styles.monthNavButtonText,
                    { color: palette.textOnContainer },
                  ]}
                >
                  ‹
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.monthSelectButton,
                  isLight
                    ? {
                        backgroundColor: palette.containerBg,
                        borderColor: palette.borderSubtle,
                      }
                    : null,
                  pressed ? styles.profileMediumButtonPressed : null,
                ]}
                onPress={openMonthPicker}
              >
                <Text
                  style={[
                    styles.monthSelectButtonText,
                    { color: palette.textOnContainer },
                  ]}
                >
                  {monthButtonLabel} ▾
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.monthNavButton,
                  isLight ? { backgroundColor: palette.containerBg } : null,
                  pressed ? styles.profileIconButtonPressed : null,
                ]}
                onPress={() =>
                  handleMonthNavPress(currentMonthIndexRef.current + 1)
                }
              >
                <Text
                  style={[
                    styles.monthNavButtonText,
                    { color: palette.textOnContainer },
                  ]}
                >
                  ›
                </Text>
              </Pressable>
            </View>
          </View>

          <Animated.View
            style={[styles.heatMapPanelShadow, { height: panelHeightAnim }]}
          >
            <View
              style={[
                styles.heatMapPanel,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight
                    ? palette.borderSubtle
                    : CONTAINER_NEON_OUTLINE,
                  borderWidth: 1,
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.heatMapPagerWrap,
                  { transform: [{ translateX: edgePullX }] },
                ]}
                onLayout={handlePagerLayout}
              >
                <FlatList
                  ref={listRef}
                  data={monthsWithCalendarItems}
                  initialScrollIndex={safeInitialIndex}
                  keyExtractor={(item) => item.key}
                  renderItem={({ item }) => (
                    <View
                      style={[
                        styles.monthPage,
                        {
                          height: stableMonthPageHeight,
                          width: effectivePagerWidth,
                        },
                      ]}
                    >
                      <View
                        style={[styles.monthPageInner, { paddingBottom: 2 }]}
                      >
                        <View style={styles.calendarBlock}>
                          <View style={styles.weekdayRow}>
                            {WEEKDAY_LABELS.map((label) => (
                              <View
                                key={`${item.key}-${label}`}
                                style={styles.weekdayCell}
                              >
                                <Text
                                  style={[
                                    styles.weekdayText,
                                    {
                                      color: isLight
                                        ? '#64748B'
                                        : 'rgba(234,243,255,0.64)',
                                    },
                                  ]}
                                >
                                  {label}
                                </Text>
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
                              {Array.from({ length: item.usedRowCount }).map(
                                (_, rowIndex) => {
                                  const rowItems = item.calendarItems.slice(
                                    rowIndex * 7,
                                    rowIndex * 7 + 7
                                  );
                                  return (
                                    <View
                                      key={`${item.key}-row-${rowIndex}`}
                                      style={styles.gridRow}
                                    >
                                      {Array.from({ length: 7 }).map(
                                        (__, colIndex) => {
                                          const calendarItem =
                                            rowItems[colIndex];
                                          if (
                                            !calendarItem ||
                                            'isPlaceholder' in calendarItem
                                          ) {
                                            return (
                                              <View
                                                key={
                                                  calendarItem?.key ??
                                                  `${item.key}-row-${rowIndex}-empty-${colIndex}`
                                                }
                                                style={styles.gridCell}
                                              >
                                                <View
                                                  style={styles.placeholderCell}
                                                />
                                              </View>
                                            );
                                          }
                                          return (
                                            <View
                                              key={calendarItem.key}
                                              style={styles.gridCell}
                                            >
                                              <HeatMapCircle
                                                item={calendarItem}
                                                isToday={
                                                  calendarItem.key ===
                                                  todayDateKey
                                                }
                                                onPressDay={onPressDay}
                                                palette={palette}
                                                isLight={isLight}
                                                stickerFontKey={stickerFontKey}
                                                stickerFontScalePercent={
                                                  stickerFontScalePercent
                                                }
                                              />
                                            </View>
                                          );
                                        }
                                      )}
                                    </View>
                                  );
                                }
                              )}
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}
                  horizontal
                  pagingEnabled
                  bounces={false}
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
                    listRef.current?.scrollToOffset({
                      offset: info.index * effectivePagerWidth,
                      animated: true,
                    });
                  }}
                  onScrollBeginDrag={() => {
                    void Haptics.selectionAsync();
                  }}
                  onMomentumScrollEnd={(event) => {
                    const width = Math.max(
                      1,
                      effectivePagerWidth ||
                        event.nativeEvent.layoutMeasurement.width ||
                        1
                    );
                    const next = Math.round(
                      event.nativeEvent.contentOffset.x / width
                    );
                    const clamped = Math.max(
                      0,
                      Math.min(next, monthsWithCalendarItems.length - 1)
                    );
                    const pendingTarget = pendingTargetIndexRef.current;

                    // 快速連點時，會收到前一次動畫的 momentum 事件：
                    // 若不是最後一次目標，就忽略並對齊到最後目標，避免月份回跳閃現。
                    if (pendingTarget != null && clamped !== pendingTarget) {
                      listRef.current?.scrollToOffset({
                        offset: pendingTarget * width,
                        animated: false,
                      });
                      setCurrentMonthIndex(pendingTarget);
                      currentMonthIndexRef.current = pendingTarget;
                      return;
                    }

                    if (pendingTarget != null && clamped === pendingTarget) {
                      pendingTargetIndexRef.current = null;
                    }
                    setCurrentMonthIndex(clamped);
                    currentMonthIndexRef.current = clamped;
                  }}
                  style={styles.heatMapScroller}
                />
              </Animated.View>
            </View>
          </Animated.View>

          <View
            style={[
              styles.settingsListSection,
              { paddingBottom: Math.max(insets.bottom, 16) + 88 },
            ]}
          >
            <View
              style={[
                styles.settingsCard,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight
                    ? palette.borderSubtle
                    : CONTAINER_NEON_OUTLINE,
                },
              ]}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.settingsRow,
                  pressed ? { backgroundColor: palette.modalOptionBg } : null,
                ]}
                onPress={onOpenMembershipModal}
              >
                <Text
                  style={[
                    styles.settingLabel,
                    { color: palette.textOnContainer },
                  ]}
                >
                  {tUI(uiLanguage, 'profile.membership')}
                </Text>
                <View style={styles.settingsRowRight}>
                  <Text
                    style={[
                      styles.settingValue,
                      { color: palette.textOnContainer },
                    ]}
                  >
                    {entitlementLabel}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={palette.textOnContainer}
                    style={styles.settingsRowIcon}
                  />
                </View>
              </Pressable>

              <View style={styles.settingsDivider} />

              <Pressable
                unstable_pressDelay={0}
                style={({ pressed }) => [
                  styles.settingsRow,
                  pressed ? { backgroundColor: palette.modalOptionBg } : null,
                ]}
                onPress={() => triggerOpenSettingsOption('theme')}
              >
                <Text
                  style={[
                    styles.settingLabel,
                    { color: palette.textOnContainer },
                  ]}
                >
                  {tUI(uiLanguage, 'profile.appearance')}
                </Text>
                <View style={styles.settingsRowRight}>
                  <Text
                    style={[
                      styles.settingValue,
                      { color: palette.textOnContainer },
                    ]}
                    numberOfLines={1}
                  >
                    {themeSummary}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={palette.textOnContainer}
                    style={styles.settingsRowIcon}
                  />
                </View>
              </Pressable>

              <View style={styles.settingsDivider} />

              <Pressable
                unstable_pressDelay={0}
                style={({ pressed }) => [
                  styles.settingsRow,
                  pressed ? { backgroundColor: palette.modalOptionBg } : null,
                ]}
                onPress={() => triggerOpenSettingsOption('language')}
              >
                <Text
                  style={[
                    styles.settingLabel,
                    { color: palette.textOnContainer },
                  ]}
                >
                  {tUI(uiLanguage, 'profile.language')}
                </Text>
                <View style={styles.settingsRowRight}>
                  <Text
                    style={[
                      styles.settingValue,
                      { color: palette.textOnContainer },
                    ]}
                    numberOfLines={1}
                  >
                    {languageSummary}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={palette.textOnContainer}
                    style={styles.settingsRowIcon}
                  />
                </View>
              </Pressable>

              <View style={styles.settingsDivider} />

              <Pressable
                unstable_pressDelay={0}
                style={({ pressed }) => [
                  styles.settingsRow,
                  pressed ? { backgroundColor: palette.modalOptionBg } : null,
                ]}
                onPress={() => triggerOpenSettingsOption('font')}
              >
                <Text
                  style={[
                    styles.settingLabel,
                    { color: palette.textOnContainer },
                  ]}
                >
                  {tUI(uiLanguage, 'profile.font')}
                </Text>
                <View style={styles.settingsRowRight}>
                  <Text
                    style={[
                      styles.settingValue,
                      { color: palette.textOnContainer },
                    ]}
                  >
                    {selectedStickerFont.label}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={palette.textOnContainer}
                    style={styles.settingsRowIcon}
                  />
                </View>
              </Pressable>

              <View style={styles.settingsDivider} />

              <Pressable
                unstable_pressDelay={0}
                style={({ pressed }) => [
                  styles.settingsRow,
                  pressed ? { backgroundColor: palette.modalOptionBg } : null,
                ]}
                onPress={onReplayVideoTutorial}
              >
                <Text
                  style={[
                    styles.settingLabel,
                    { color: palette.textOnContainer },
                  ]}
                >
                  {tUI(uiLanguage, 'profile.replayTutorial')}
                </Text>
                <View style={styles.settingsRowRight}>
                  <Ionicons
                    name="play-circle-outline"
                    size={22}
                    color={palette.textOnContainer}
                    style={styles.settingsRowIcon}
                  />
                </View>
              </Pressable>

              <View style={styles.settingsDivider} />

              <Pressable
                unstable_pressDelay={0}
                style={({ pressed }) => [
                  styles.settingsRow,
                  pressed ? { backgroundColor: palette.modalOptionBg } : null,
                ]}
                onPress={onReportFeedback}
              >
                <Text
                  style={[
                    styles.settingLabel,
                    { color: palette.textOnContainer },
                  ]}
                >
                  {tUI(uiLanguage, 'profile.messageDeveloper')}
                </Text>
                <View style={styles.settingsRowRight}>
                  <Ionicons
                    name="mail-outline"
                    size={21}
                    color={palette.textOnContainer}
                    style={styles.settingsRowIcon}
                  />
                </View>
              </Pressable>

              <View style={styles.settingsDivider} />

              <Pressable
                disabled={isDeletingAccount}
                style={({ pressed }) => [
                  styles.settingsRow,
                  pressed && !isDeletingAccount
                    ? { backgroundColor: palette.modalOptionBg }
                    : null,
                ]}
                onPress={onDeleteAccount}
              >
                <Text style={styles.deleteAccountText}>
                  {isDeletingAccount
                    ? tUI(uiLanguage, 'profile.deleteAccountDeleting')
                    : tUI(uiLanguage, 'profile.deleteAccount')}
                </Text>
                <View style={styles.settingsRowRight}>
                  {isDeletingAccount ? (
                    <ActivityIndicator color="#FF3B30" />
                  ) : (
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color="#FF3B30"
                      style={styles.settingsRowIcon}
                    />
                  )}
                </View>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={monthPickerVisible}
        transparent
        animationType="none"
        onRequestClose={closeMonthPicker}
      >
        <Animated.View
          style={[
            styles.monthPickerBackdrop,
            { opacity: monthPickerOverlayOpacity },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeMonthPicker}
          />
          <View
            style={styles.monthPickerSheetContainer}
            pointerEvents="box-none"
          >
            <Animated.View
              style={[
                styles.monthPickerSheet,
                { backgroundColor: palette.screenBg },
                {
                  height: monthPickerSheetHeight,
                  transform: [{ translateY: monthPickerSheetTranslateY }],
                },
              ]}
            >
              <View style={styles.monthPickerHandle} />
              <View style={styles.monthPickerTopBar}>
                <Pressable
                  style={({ pressed }) => [
                    styles.monthPickerDoneButton,
                    {
                      backgroundColor: palette.containerBg,
                      borderColor: isLight
                        ? palette.borderSubtle
                        : CONTAINER_NEON_OUTLINE,
                    },
                    pressed ? styles.profileMediumButtonPressed : null,
                  ]}
                  onPress={handleConfirmMonthPicker}
                >
                  <Text
                    style={[
                      styles.monthPickerDoneText,
                      { color: palette.textOnContainer },
                    ]}
                  >
                    {tUI(uiLanguage, 'common.done')}
                  </Text>
                </Pressable>
              </View>

              <View
                style={[
                  styles.monthPickerWheelsCard,
                  {
                    backgroundColor: palette.containerBg,
                    borderColor: isLight
                      ? palette.borderSubtle
                      : CONTAINER_NEON_OUTLINE,
                  },
                ]}
              >
                <View
                  style={[
                    styles.monthPickerSelectionHighlight,
                    {
                      backgroundColor: isLight ? '#F2F2F7' : '#334155',
                    },
                  ]}
                  pointerEvents="none"
                />

                <View style={styles.monthPickerWheelColumn}>
                  <FlatList
                    ref={yearWheelRef}
                    data={monthPickerYears}
                    keyExtractor={(item) => `year-${item}`}
                    scrollEnabled
                    nestedScrollEnabled
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                    decelerationRate="fast"
                    snapToInterval={MONTH_PICKER_ROW_HEIGHT}
                    contentContainerStyle={styles.monthPickerWheelContent}
                    onScroll={(event) => {
                      triggerMonthPickerScrollHaptic(
                        'year',
                        event.nativeEvent.contentOffset.y
                      );
                    }}
                    getItemLayout={(_, index) => ({
                      length: MONTH_PICKER_ROW_HEIGHT,
                      offset: MONTH_PICKER_ROW_HEIGHT * index,
                      index,
                    })}
                    onMomentumScrollEnd={(event) => {
                      const next = Math.round(
                        event.nativeEvent.contentOffset.y /
                          MONTH_PICKER_ROW_HEIGHT
                      );
                      const clamped = Math.max(
                        0,
                        Math.min(next, monthPickerYears.length - 1)
                      );
                      setMonthPickerYear(monthPickerYears[clamped]);
                    }}
                    renderItem={({ item }) => (
                      <View style={styles.monthPickerWheelRow}>
                        <Text
                          style={[
                            styles.monthPickerWheelText,
                            { color: palette.textOnContainer },
                            item === monthPickerYear &&
                              styles.monthPickerWheelTextActive,
                          ]}
                        >
                          {item.toLocaleString('en-US')}
                        </Text>
                      </View>
                    )}
                  />
                </View>

                <View
                  style={[
                    styles.monthPickerWheelDivider,
                    {
                      backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : '#334155',
                    },
                  ]}
                />

                <View style={styles.monthPickerWheelColumn}>
                  <FlatList
                    ref={monthWheelRef}
                    data={monthPickerMonthsInYear}
                    key={`month-wheel-${monthPickerYear}`}
                    keyExtractor={(item) => `month-${monthPickerYear}-${item}`}
                    scrollEnabled
                    nestedScrollEnabled
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                    decelerationRate="fast"
                    snapToInterval={MONTH_PICKER_ROW_HEIGHT}
                    contentContainerStyle={styles.monthPickerWheelContent}
                    onScroll={(event) => {
                      triggerMonthPickerScrollHaptic(
                        'month',
                        event.nativeEvent.contentOffset.y
                      );
                    }}
                    getItemLayout={(_, index) => ({
                      length: MONTH_PICKER_ROW_HEIGHT,
                      offset: MONTH_PICKER_ROW_HEIGHT * index,
                      index,
                    })}
                    onMomentumScrollEnd={(event) => {
                      const next = Math.round(
                        event.nativeEvent.contentOffset.y /
                          MONTH_PICKER_ROW_HEIGHT
                      );
                      const clamped = Math.max(
                        0,
                        Math.min(next, monthPickerMonthsInYear.length - 1)
                      );
                      setMonthPickerMonth(monthPickerMonthsInYear[clamped]);
                    }}
                    renderItem={({ item }) => (
                      <View style={styles.monthPickerWheelRow}>
                        <Text
                          style={[
                            styles.monthPickerWheelText,
                            { color: palette.textOnContainer },
                            item === monthPickerMonth &&
                              styles.monthPickerWheelTextActive,
                          ]}
                        >
                          {item}
                        </Text>
                      </View>
                    )}
                  />
                </View>
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      </Modal>
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
  screenScroll: {
    flex: 1,
  },
  screenScrollContent: {
    flexGrow: 1,
  },
  topNavRow: {
    display: 'none',
  },
  profilePanel: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: PANEL_BG,
    borderWidth: 1,
    borderColor: CONTAINER_NEON_OUTLINE,
    shadowColor: CONTAINER_NEON_GLOW,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 7,
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
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: '#F2F2F7',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
  },
  titleBlock: {
    alignItems: 'center',
    marginTop: 0,
  },
  subtitle: {
    color: TEXT_MUTED,
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '500',
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
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
    borderRadius: 16,
    shadowColor: CONTAINER_NEON_GLOW,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 7,
  },
  heatMapPagerWrap: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  heatMapPanel: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    backgroundColor: PANEL_BG,
    borderWidth: 1,
    borderColor: CONTAINER_NEON_OUTLINE,
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
    color: TEXT_ON_BASE,
    fontSize: 46,
    fontWeight: '800',
  },
  monthControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  monthNavButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  monthNavButtonText: {
    color: TEXT_ON_BASE,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '500',
    marginTop: -1,
  },
  monthSelectButton: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  monthSelectButtonText: {
    color: TEXT_ON_BASE,
    fontSize: 16,
    fontWeight: '600',
  },
  monthPickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.26)',
    justifyContent: 'flex-end',
  },
  monthPickerSheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  monthPickerSheet: {
    marginHorizontal: 14,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  monthPickerHandle: {
    alignSelf: 'center',
    width: 54,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.14)',
    marginBottom: 10,
  },
  monthPickerTopBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  monthPickerDoneButton: {
    minWidth: 82,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
  },
  monthPickerDoneText: {
    color: '#7B6A4B',
    fontSize: 17,
    fontWeight: '700',
  },
  monthPickerWheelsCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    backgroundColor: '#FFFFFF',
    height: MONTH_PICKER_WHEEL_HEIGHT + 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  monthPickerSelectionHighlight: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: MONTH_PICKER_WHEEL_SIDE_PADDING + 5,
    height: MONTH_PICKER_ROW_HEIGHT,
    borderRadius: 18,
    backgroundColor: '#F2F2F7',
    zIndex: 1,
  },
  monthPickerWheelColumn: {
    flex: 1,
    zIndex: 2,
  },
  monthPickerWheelDivider: {
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginVertical: 16,
  },
  monthPickerWheelContent: {
    paddingTop: MONTH_PICKER_WHEEL_SIDE_PADDING,
    paddingBottom: MONTH_PICKER_WHEEL_SIDE_PADDING,
  },
  monthPickerWheelRow: {
    height: MONTH_PICKER_ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthPickerWheelText: {
    color: TEXT_PRIMARY,
    fontSize: 26,
    fontWeight: '500',
    opacity: 0.4,
  },
  monthPickerWheelTextActive: {
    opacity: 1,
    fontWeight: '700',
  },
  weekdayRow: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 14,
    marginBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    direction: 'ltr',
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: {
    color: '#6F8FAF',
    fontSize: 12,
    fontWeight: '500',
  },
  calendarGridArea: {
    justifyContent: 'flex-end',
  },
  gridWrap: {
    flexDirection: 'column',
    width: '100%',
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    direction: 'ltr',
  },
  gridRow: {
    flexDirection: 'row',
    width: '100%',
    height: GRID_ROW_HEIGHT,
    direction: 'ltr',
  },
  gridCell: {
    flex: 1,
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
    backgroundColor: 'rgba(78,175,244,0.16)',
    shadowColor: '#4EAFF4',
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
    borderColor: '#4EAFF4',
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
    overflow: 'visible',
    backgroundColor: BASE_BG,
  },
  dayCircleSticker: {
    backgroundColor: BASE_BG,
    overflow: 'visible',
  },
  dayCircleImage: {
    ...StyleSheet.absoluteFillObject,
  },
  dayCircleEmpty: {
    backgroundColor: BASE_BG,
  },
  dayNumber: {
    color: TEXT_ON_BASE,
    fontSize: 14,
    fontWeight: '500',
  },
  dayStickerSvg: {
    overflow: 'visible',
  },
  dayStickerCloud: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'visible',
  },
  dayStickerToken: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  dayStickerTokenTop: {
    top: 0,
  },
  dayStickerTokenBottom: {
    bottom: 0,
  },
  settingsListSection: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  miniPfpButton: {
    alignSelf: 'flex-end',
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CONTAINER_NEON_OUTLINE,
    backgroundColor: 'rgba(15,23,42,0.35)',
    marginBottom: 8,
  },
  miniPfpImage: {
    width: '100%',
    height: '100%',
  },
  miniPfpFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CONTAINER_NEON_OUTLINE,
    backgroundColor: PANEL_BG,
    shadowColor: CONTAINER_NEON_GLOW,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
    overflow: 'hidden',
  },
  settingsRow: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  settingsRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 1,
    marginLeft: 12,
  },
  deleteAccountText: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: '700',
  },
  settingsRowIcon: {
    width: 20,
    textAlign: 'right',
  },
  fontPreviewSvg: {
    overflow: 'visible',
  },
  settingsDivider: {
    height: 1,
    backgroundColor: 'rgba(148,163,184,0.32)',
    marginHorizontal: 14,
  },
  settingsSubPage: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  settingsSubPageSafe: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  settingsSubPageHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  settingsSubPageBackBtn: {
    minWidth: 72,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  settingsSubPageBackText: {
    fontSize: 17,
    fontWeight: '600',
  },
  settingsSubPageHeaderRight: {
    minWidth: 72,
  },
  settingsPickerTitle: {
    color: TEXT_PRIMARY,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  settingsPickerCard: {
    marginHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CONTAINER_NEON_OUTLINE,
    backgroundColor: PANEL_BG,
    overflow: 'hidden',
  },
  settingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  settingsPillIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsPillLabel: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  settingBlock: {
    marginTop: 8,
  },
  settingTrigger: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(15,23,42,0.4)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  mainScreenSheetContainer: {
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  mainScreenSheet: {
    maxHeight: '82%',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  mainScreenModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  mainScreenModalTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  mainScreenModalSubtitle: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 18,
  },
  mainScreenCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainScreenSection: {
    marginTop: 18,
  },
  mainScreenSectionTitle: {
    marginBottom: 9,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  mainScreenSegmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mainScreenSegment: {
    flex: 1,
    minHeight: 46,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainScreenSegmentText: {
    fontSize: 16,
    fontWeight: '900',
  },
  mainScreenToggleRow: {
    marginTop: 16,
    minHeight: 70,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  mainScreenToggleTextBlock: {
    flex: 1,
  },
  mainScreenToggleTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  mainScreenToggleMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  mainScreenAlbumList: {
    maxHeight: 260,
  },
  mainScreenAlbumRow: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  mainScreenAlbumIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mainScreenAlbumEmoji: {
    width: 28,
    fontSize: 20,
    textAlign: 'center',
  },
  mainScreenAlbumName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  mainScreenAlbumControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mainScreenReorderButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingOptionsList: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.5)',
  },
  settingOptionRow: {
    minHeight: 38,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  settingOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  settingsActionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  inlineSettingBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(15,23,42,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  inlineSettingBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  profileMediumButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  profileIconButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
});
