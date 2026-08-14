import React from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  InteractionManager,
  Linking,
  type GestureResponderEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import StickerFontPreview from '../../../components/UI/ProfileScreenUI/StickerFontPreview';
import PaywallFooter from '../../../components/UI/ProfileScreenUI/PaywallFooter';
import { analytics } from '@services/analytics';
import { resolveBillingPlan } from '@services/analytics/growthAnalytics';
import AnimatedSplashV2 from '../../../components/UI/shared/AnimatedSplashV2';
import { formatMembershipPriceLabel } from '../../../features/subscription/membershipPriceLabel';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import type { DeckAlbum } from '../../../components/UI/DeckScreenUI/deckTypes';
import {
  buildDeckAlbums,
  createCustomAlbum,
  getDeckAlbumDisplayName,
  loadDeckAlbumPreferences,
  saveDeckAlbumPreferences,
  subscribeDeckAlbumPreferences,
} from '../../../features/deck/albums';
import CreateAlbumModalUI from '../../../components/UI/DeckScreenUI/CreateAlbumModalUI';
import {
  DEFAULT_USER_SETTINGS,
  getInitialUserSettings,
  createMainScreenEmptyAlbumSlot,
  getPrimaryAIReplyLanguageForLearningLanguages,
  isTTSVoiceCompatibleWithAIReplyLanguage,
  isMainScreenEmptyAlbumSlot,
  loadUserSettings,
  type MainScreenAlbumGridCount,
  resolveTTSVoiceForLanguage,
  saveUserSettings,
  type AIReplyLanguage,
  type TTSVoice,
  type ThemeMode,
  type UILanguage,
  type UserAppSettings,
  withUpdatedTTSVoiceOnlyForLanguage,
} from '@services/settings/userSettings';
import { tUI } from '../../../i18n/uiLanguage';
import {
  CONTAINER_NEON_GLOW,
  CONTAINER_NEON_OUTLINE,
  MODAL_CTA_COLOR,
  TEXT_ON_CTA,
  UPLOAD_CACHE_CTA_COLOR,
  UPLOAD_CACHE_CTA_COLOR_BORDER,
  resolveThemeColors,
} from '../../../theme/colors';
import {
  STICKER_FONT_OPTIONS,
  type StickerFontKey,
} from '../../../theme/stickerFonts';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import {
  getRevenueCatActiveSubscriptionPeriod,
  getRevenueCatOfferingSummary,
  isRevenueCatConfigured,
  PurchaseCancelledError,
  type RevenueCatPackageSummary,
} from '@services/subscription/revenueCat';
import SubscriptionService from '@services/subscription/SubscriptionService';
import { supabase } from '@services/supabase/client';
import { getCurrentSessionUserId } from '@services/auth/userIdentity';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import type {
  MembershipPaywallSource,
  MembershipPaywallTriggerSource,
  MembershipReturnTarget,
} from '../../../contexts/TabSwipeContext';
import { localizeDefaultExperienceSavedCard } from '../../../features/cache/defaultExperienceCard';
import {
  resolveMembershipPackageIdentifier,
  selectDefaultMembershipPackage,
} from '../../../features/subscription/membershipPackageSelection';

type SettingOptionKind =
  | 'language'
  | 'voice'
  | 'theme'
  | 'font'
  | 'main'
  | 'membership';

type MembershipBillingPlan = string;

type Props = {
  navigation: any;
  route: {
    params?: {
      kind?: SettingOptionKind;
      returnTo?: MembershipReturnTarget;
      source?: MembershipPaywallSource;
      tier?: 'lite' | 'pro';
      initialTab?: 'lite' | 'pro';
      triggerSource?: MembershipPaywallTriggerSource;
    };
  };
};

const AI_REPLY_LANGUAGE_OPTIONS: Array<{
  code: AIReplyLanguage;
  label: string;
}> = [
  { code: 'en', label: 'English' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
];

const TTS_VOICE_OPTIONS: Array<{ code: TTSVoice; label: string }> = [
  { code: 'en-US-JennyNeural', label: 'EN-US Jenny' },
  { code: 'en-US-GuyNeural', label: 'EN-US Guy' },
  { code: 'en-GB-SoniaNeural', label: 'EN-GB Sonia' },
  { code: 'ja-JP-NanamiNeural', label: '日本語 Nanami' },
  { code: 'ko-KR-SunHiNeural', label: '한국어 SunHi' },
  { code: 'zh-TW-HsiaoChenNeural', label: '繁中 曉臻' },
  { code: 'zh-CN-XiaoxiaoNeural', label: '简中 晓晓' },
  { code: 'es-ES-ElviraNeural', label: 'Español Elvira' },
  { code: 'fr-FR-DeniseNeural', label: 'Français Denise' },
];

const PREVIEW_GRID_COLUMNS = 3;
const PREVIEW_GRID_GAP = 10;
const PREVIEW_PAGE_GAP = 20;
const STICKER_SCALE_MIN = 75;
const STICKER_SCALE_MAX = 125;
const STICKER_SCALE_STEP = 5;
const MEMBERSHIP_APP_ICON = require('../../../../assets/app_icons/icon_cutout2.png');
const MEMBERSHIP_SCREEN_BG = '#02213D';
const MEMBERSHIP_HEADER_TEXT = '#FFFFFF';
const MEMBERSHIP_PLAN_IDLE_BG = 'rgba(255,255,255,0.055)';
const MEMBERSHIP_PLAN_ACTIVE_BG = 'rgba(78,175,244,0.14)';
const MEMBERSHIP_PLAN_IDLE_BORDER = 'rgba(255,255,255,0.24)';
const APPLE_SUBSCRIPTION_MANAGEMENT_URL =
  'https://apps.apple.com/account/subscriptions';

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function normalizeMainScreenSlots(
  albums: DeckAlbum[],
  storedOrder: string[],
  slotsPerPage: MainScreenAlbumGridCount
): string[] {
  const albumIds = new Set(albums.map((album) => album.id));
  const usedAlbumIds = new Set<string>();
  const slots: string[] = [];

  storedOrder.forEach((slot) => {
    if (isMainScreenEmptyAlbumSlot(slot)) {
      slots.push(slot);
      return;
    }
    if (!albumIds.has(slot) || usedAlbumIds.has(slot)) return;
    usedAlbumIds.add(slot);
    slots.push(slot);
  });

  albums.forEach((album) => {
    if (!usedAlbumIds.has(album.id)) {
      usedAlbumIds.add(album.id);
      slots.push(album.id);
    }
  });

  const lastAlbumIndex = slots.reduce((latest, slot, index) => {
    return isMainScreenEmptyAlbumSlot(slot) ? latest : index;
  }, -1);
  const desiredSlotCount =
    Math.ceil(
      Math.max(slotsPerPage, lastAlbumIndex + 1, albums.length) / slotsPerPage
    ) * slotsPerPage;
  const trimmedSlots = slots.slice(0, desiredSlotCount);
  while (trimmedSlots.length < desiredSlotCount) {
    trimmedSlots.push(createMainScreenEmptyAlbumSlot());
  }

  return trimmedSlots;
}

function getTitle(kind: SettingOptionKind, uiLanguage: UILanguage): string {
  if (kind === 'language') return tUI(uiLanguage, 'settings.title.language');
  if (kind === 'voice') return tUI(uiLanguage, 'settings.title.voice');
  if (kind === 'theme') return tUI(uiLanguage, 'settings.title.appearance');
  if (kind === 'main') return tUI(uiLanguage, 'settings.title.mainScreen');
  if (kind === 'membership')
    return tUI(uiLanguage, 'settings.title.membership');
  return tUI(uiLanguage, 'settings.title.font');
}

function ThemeModePicker({
  selectedMode,
  uiLanguage,
  textColor,
  secondaryTextColor,
  onSelect,
}: {
  selectedMode: ThemeMode;
  uiLanguage: UILanguage;
  textColor: string;
  secondaryTextColor: string;
  onSelect: (mode: ThemeMode) => void;
}) {
  return (
    <View style={styles.themePicker}>
      {(['system', 'light', 'dark'] as const).map((mode) => {
        const selected = selectedMode === mode;
        const label = tUI(
          uiLanguage,
          mode === 'system'
            ? 'settings.theme.system'
            : mode === 'light'
              ? 'settings.theme.light'
              : 'settings.theme.dark'
        );
        const renderPane = (appearance: 'light' | 'dark', half = false) => (
          <View
            style={[
              half ? styles.themePreviewHalf : styles.themePreviewFull,
              half
                ? appearance === 'light'
                  ? styles.themePreviewHalfLeft
                  : styles.themePreviewHalfRight
                : null,
              {
                backgroundColor: appearance === 'light' ? '#F5F1E9' : '#06152A',
              },
            ]}
          >
            <View
              style={[
                styles.themePreviewSky,
                {
                  backgroundColor:
                    appearance === 'light' ? '#78BDEA' : '#153E94',
                },
              ]}
            />
            <View
              style={[
                styles.themePreviewPanel,
                {
                  backgroundColor:
                    appearance === 'light' ? '#FFFFFF' : '#060B19',
                },
              ]}
            >
              <View style={styles.themePreviewBlueLine} />
              <View style={styles.themePreviewDots}>
                <View
                  style={[
                    styles.themePreviewDot,
                    { backgroundColor: '#FF6B60' },
                  ]}
                />
                <View
                  style={[
                    styles.themePreviewDot,
                    { backgroundColor: '#F3C629' },
                  ]}
                />
                <View
                  style={[
                    styles.themePreviewDot,
                    { backgroundColor: '#23C55E' },
                  ]}
                />
              </View>
            </View>
          </View>
        );

        return (
          <Pressable
            key={mode}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onSelect(mode)}
            style={({ pressed }) => [
              styles.themeOption,
              pressed ? styles.themeOptionPressed : null,
            ]}
          >
            <View
              style={[
                styles.themePreview,
                selected
                  ? styles.themePreviewSelected
                  : styles.themePreviewIdle,
              ]}
            >
              {mode === 'system' ? (
                <>
                  {renderPane('light', true)}
                  {renderPane('dark', true)}
                </>
              ) : (
                renderPane(mode)
              )}
            </View>
            <Text
              style={[
                styles.themeOptionLabel,
                { color: selected ? textColor : secondaryTextColor },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function resolveMembershipPeriodLabel(
  value?: string | null
): 'weekly' | 'monthly' | 'yearly' | null {
  const normalized = (value || '').toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('p1w') || normalized.includes('week'))
    return 'weekly';
  if (normalized.includes('p1m') || normalized.includes('month'))
    return 'monthly';
  if (
    normalized.includes('p1y') ||
    normalized.includes('year') ||
    normalized.includes('annual')
  )
    return 'yearly';
  return null;
}

function resolveMembershipPlanPeriodLabel(
  uiLanguage: UILanguage,
  period: 'weekly' | 'monthly' | 'yearly'
): string {
  if (period === 'weekly')
    return tUI(uiLanguage, 'settings.membership.plan.weekly');
  if (period === 'monthly')
    return tUI(uiLanguage, 'settings.membership.plan.monthly');
  return tUI(uiLanguage, 'settings.membership.plan.yearly');
}

function resolveMembershipPlanTitle(
  item: RevenueCatPackageSummary,
  uiLanguage: UILanguage
): string {
  const period =
    resolveMembershipPeriodLabel(item.packageType) ||
    resolveMembershipPeriodLabel(item.identifier) ||
    resolveMembershipPeriodLabel(item.subscriptionPeriod) ||
    resolveMembershipPeriodLabel(item.title);
  return (
    (period ? resolveMembershipPlanPeriodLabel(uiLanguage, period) : null) ||
    tUI(uiLanguage, 'common.premium')
  );
}

function resolveMembershipPriceLabel(
  item: RevenueCatPackageSummary,
  fallback: string | null,
  uiLanguage: UILanguage
): string {
  const price =
    item.priceLabel || fallback || tUI(uiLanguage, 'common.premium');
  return formatMembershipPriceLabel(price, item.currencyCode);
}

function resolveMonthlyEquivalent(
  priceLabel: string,
  uiLanguage: UILanguage
): string | null {
  const match = priceLabel.match(/([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const amount = parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const monthly = Math.round(amount / 12);
  const currency = priceLabel.replace(/[\d,]+(?:\.\d+)?/g, '').trim();
  const template = tUI(
    uiLanguage,
    'settings.membership.plan.monthlyEquivalent'
  );
  return template.replace('{amount}', `${currency}${monthly.toLocaleString()}`);
}

function MembershipPlanOption({
  title,
  price,
  selected,
  onPress,
  isYearly,
  monthlyEquivalent,
  showMedalBadge,
  badgeLabel,
  goldMonthlyEquivalent,
}: {
  title: string;
  price: string;
  selected: boolean;
  onPress: () => void;
  isYearly?: boolean;
  monthlyEquivalent?: string | null;
  showMedalBadge?: boolean;
  badgeLabel?: string;
  goldMonthlyEquivalent?: boolean;
}) {
  const selectedProgress = React.useRef(
    new Animated.Value(selected ? 1 : 0)
  ).current;
  const pressProgress = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(selectedProgress, {
      toValue: selected ? 1 : 0,
      duration: 210,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [selected, selectedProgress]);

  const animatePress = React.useCallback(
    (toValue: number) => {
      Animated.spring(pressProgress, {
        toValue,
        speed: toValue > 0 ? 36 : 28,
        bounciness: toValue > 0 ? 0 : 4,
        useNativeDriver: false,
      }).start();
    },
    [pressProgress]
  );

  const animatedCardStyle = React.useMemo(
    () => ({
      backgroundColor: selectedProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [MEMBERSHIP_PLAN_IDLE_BG, MEMBERSHIP_PLAN_ACTIVE_BG],
      }),
      borderColor: selectedProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [MEMBERSHIP_PLAN_IDLE_BORDER, MODAL_CTA_COLOR],
      }),
      transform: [
        {
          scale: selectedProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.015],
          }),
        },
        {
          scale: pressProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.985],
          }),
        },
      ],
    }),
    [pressProgress, selectedProgress]
  );

  const animatedTextStyle = React.useMemo(
    () => ({
      color: selectedProgress.interpolate({
        inputRange: [0, 1],
        outputRange: ['#FFFFFF', MODAL_CTA_COLOR],
      }),
    }),
    [selectedProgress]
  );

  return (
    <Pressable
      style={styles.membershipPlanPressable}
      onPress={onPress}
      onPressIn={() => animatePress(1)}
      onPressOut={() => animatePress(0)}
    >
      <Animated.View style={[styles.membershipPlanCard, animatedCardStyle]}>
        {showMedalBadge && badgeLabel ? (
          <View style={styles.membershipPlanBadge}>
            <Text
              style={styles.membershipPlanBadgeText}
              numberOfLines={1}
              maxFontSizeMultiplier={1}
            >
              {badgeLabel}
            </Text>
          </View>
        ) : null}
        <Animated.Text
          style={[styles.membershipPlanTitle, animatedTextStyle]}
          numberOfLines={1}
        >
          {title}
        </Animated.Text>
        <Animated.Text
          style={[styles.membershipPlanPrice, animatedTextStyle]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          maxFontSizeMultiplier={1}
        >
          {price}
        </Animated.Text>
        {isYearly && monthlyEquivalent ? (
          <Text
            style={[
              styles.membershipPlanMonthlyEquivalent,
              goldMonthlyEquivalent
                ? styles.membershipPlanMonthlyEquivalentGold
                : null,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={1}
          >
            {monthlyEquivalent}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

export default function ProfileSettingOptionsFlow({
  navigation,
  route,
}: Props) {
  const requestedKind = route.params?.kind ?? 'language';
  const kind = requestedKind === 'main' ? 'theme' : requestedKind;
  const membershipReturnTo = route.params?.returnTo ?? 'settings';
  const membershipSource = route.params?.source ?? 'settings';
  const membershipTriggerSource = route.params?.triggerSource ?? 'user_initiated';
  const requestedMembershipTier = route.params?.tier;
  const initialMembershipTab = route.params?.initialTab;
  const initialMembershipTier =
    requestedMembershipTier ?? initialMembershipTab ?? 'lite';
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const palette = React.useMemo(
    () => resolveThemeColors(colorScheme),
    [colorScheme]
  );
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const isLight = colorScheme === 'light';
  const membershipStageMinHeight = Math.max(728, windowHeight - 92);
  const [settings, setSettings] = React.useState<UserAppSettings>(
    getInitialUserSettings
  );
  const paywallViewTrackedRef = React.useRef(false);

  React.useEffect(() => {
    if (kind !== 'membership' || paywallViewTrackedRef.current) return;
    paywallViewTrackedRef.current = true;
    analytics.track('paywall_viewed', {
      source:
        membershipSource === 'create_card' ||
        membershipSource === 'review' ||
        membershipSource === 'settings'
          ? membershipSource
          : 'unknown',
      trigger_source: membershipTriggerSource,
    });
  }, [kind, membershipSource, membershipTriggerSource]);
  const [stickerScaleSliderWidth, setStickerScaleSliderWidth] =
    React.useState(0);
  const pendingStickerScaleRef = React.useRef(
    DEFAULT_USER_SETTINGS.stickerFontScalePercent
  );
  const lastStickerScaleHapticRef = React.useRef(
    DEFAULT_USER_SETTINGS.stickerFontScalePercent
  );
  const [mainScreenAlbums, setMainScreenAlbums] = React.useState<DeckAlbum[]>(
    []
  );
  const [previewGridWidth, setPreviewGridWidth] = React.useState(0);
  const [draggingAlbumId, setDraggingAlbumId] = React.useState<string | null>(
    null
  );
  const [previewEditMode, setPreviewEditMode] = React.useState(false);
  const [draftAlbumSlots, setDraftAlbumSlots] = React.useState<string[]>([]);
  const [createAlbumModalVisible, setCreateAlbumModalVisible] =
    React.useState(false);
  const [newAlbumName, setNewAlbumName] = React.useState('');
  const [pendingCreateSlotId, setPendingCreateSlotId] = React.useState<
    string | null
  >(null);
  const [membershipPriceLabel, setMembershipPriceLabel] = React.useState<
    string | null
  >(null);
  const [litePackages, setLitePackages] = React.useState<
    RevenueCatPackageSummary[]
  >([]);
  const [proPackages, setProPackages] = React.useState<
    RevenueCatPackageSummary[]
  >([]);
  const [membershipTier, setMembershipTier] = React.useState<'lite' | 'pro'>(
    // 雙規則通用預設值路由：
    // 規則一（95% 通用預設）→ 'lite'；規則二（額度耗盡例外）→ 由 tier / initialTab 帶入 'pro'。
    initialMembershipTier
  );
  const membershipTierRef = React.useRef(membershipTier);
  const [membershipPlan, setMembershipPlan] =
    React.useState<MembershipBillingPlan>('monthly');
  const [savingMembership, setSavingMembership] = React.useState(false);
  const [membershipStatus, setMembershipStatus] = React.useState<
    'trial' | 'free' | 'lite' | 'premium'
  >('free');
  const [activeSubscriptionPeriod, setActiveSubscriptionPeriod] = React.useState<
    'weekly' | 'monthly' | 'yearly' | null
  >(null);
  const [premiumTransitionVisible, setPremiumTransitionVisible] =
    React.useState(false);
  const [premiumTransitionReady, setPremiumTransitionReady] =
    React.useState(false);
  const premiumGreetingShownRef = React.useRef(false);
  const dragTranslate = React.useRef(new Animated.ValueXY()).current;
  const previewPositionValuesRef = React.useRef<
    Record<string, Animated.ValueXY>
  >({});
  const previewPositionTargetsRef = React.useRef<
    Record<string, { x: number; y: number }>
  >({});
  const previewWiggleValue = React.useRef(new Animated.Value(0)).current;
  const lastPreviewTargetIndexRef = React.useRef<number | null>(null);
  const draftAlbumSlotsRef = React.useRef<string[]>([]);
  const dragBasePositionRef = React.useRef({ x: 0, y: 0 });
  const pendingDragAlbumRef = React.useRef<{
    albumId: string;
    index: number;
  } | null>(null);
  const activeDragAlbumIdRef = React.useRef<string | null>(null);
  const previewPanActiveRef = React.useRef(false);

  React.useEffect(() => {
    if (kind !== 'membership') return;
    if (!SubscriptionService.isPremiumBypassEnabled()) return;
    console.log(
      '[Membership] Premium bypass active; closing membership screen.'
    );
    navigation.goBack?.();
  }, [kind, navigation]);

  React.useEffect(() => {
    if (
      kind !== 'language' &&
      kind !== 'voice' &&
      kind !== 'theme' &&
      kind !== 'font' &&
      kind !== 'membership'
    ) {
      navigation.goBack();
      return;
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void loadUserSettings()
        .then((nextSettings) => {
          if (!cancelled) setSettings(nextSettings);
        })
        .catch((error) => {
          console.error('[ProfileSettingOptions] load settings failed:', error);
        });
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [kind, navigation]);

  React.useEffect(() => {
    if (kind !== 'membership') return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          const userId = await getCurrentSessionUserId();
          if (userId) {
            const snapshot =
              await SubscriptionService.getEntitlementSnapshot(userId);
            if (!cancelled) setMembershipStatus(snapshot.planType);
          }

          if (!isRevenueCatConfigured()) {
            if (!cancelled) setMembershipPriceLabel(null);
            return;
          }

          const summary = await getRevenueCatOfferingSummary(userId);
          const activePeriod =
            await getRevenueCatActiveSubscriptionPeriod(userId);
          if (!cancelled) {
            setMembershipPriceLabel(summary.priceLabel);
            setLitePackages(summary.litePackages);
            setProPackages(summary.proPackages);
            setActiveSubscriptionPeriod(activePeriod);
            setMembershipPlan(
              selectDefaultMembershipPackage(
                membershipTierRef.current,
                summary.litePackages,
                summary.proPackages
              ) || 'monthly'
            );
          }
        } catch (error) {
          console.error(
            '[ProfileSettingOptions] load membership failed:',
            error
          );
        }
      })();
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [kind]);

  React.useEffect(() => {
    if (kind !== 'theme') return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          const userId = await getCurrentSessionUserId();
          if (!userId) {
            if (!cancelled) setMainScreenAlbums([]);
            return;
          }
          const [cards, prefs] = await Promise.all([
            database
              .get<Card>('cards')
              .query(
                Q.where('user_id', userId),
                Q.where('deleted_at', null),
                Q.sortBy('created_at', Q.desc)
              )
              .fetch(),
            loadDeckAlbumPreferences(),
          ]);
          if (cancelled) return;
          setMainScreenAlbums(buildDeckAlbums(cards, {}, prefs));
        } catch (error) {
          console.error(
            '[ProfileSettingOptions] load main screen albums failed:',
            error
          );
          if (!cancelled) setMainScreenAlbums([]);
        }
      })();
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [kind]);

  React.useEffect(
    () =>
      subscribeDeckAlbumPreferences((prefs) => {
        void (async () => {
          const userId = await getCurrentSessionUserId();
          if (!userId) return;
          const cards = await database
            .get<Card>('cards')
            .query(
              Q.where('user_id', userId),
              Q.where('deleted_at', null),
              Q.sortBy('created_at', Q.desc)
            )
            .fetch();
          setMainScreenAlbums(buildDeckAlbums(cards, {}, prefs));
        })();
      }),
    []
  );

  const visibleTTSVoiceOptions = React.useMemo(() => {
    const targetTTSLanguage = getPrimaryAIReplyLanguageForLearningLanguages(
      settings.learningLanguages
    );
    return TTS_VOICE_OPTIONS.filter((item) =>
      isTTSVoiceCompatibleWithAIReplyLanguage(item.code, targetTTSLanguage)
    );
  }, [settings.learningLanguages]);

  const persistSettings = React.useCallback(async (next: UserAppSettings) => {
    setSettings(next);
    try {
      await saveUserSettings(next);
    } catch (error) {
      // Keep controls responsive, but restore the durable value if the local
      // AsyncStorage write genuinely fails.
      const durableSettings = await loadUserSettings();
      setSettings(durableSettings);
      throw error;
    }
  }, []);

  const orderedMainScreenAlbums = React.useMemo(() => {
    const orderIndex = new Map(
      settings.mainScreenAlbumOrder.map((albumId, index) => [albumId, index])
    );
    return [...mainScreenAlbums].sort((a, b) => {
      const aOrder = orderIndex.get(a.id);
      const bOrder = orderIndex.get(b.id);
      if (aOrder != null && bOrder != null) return aOrder - bOrder;
      if (aOrder != null) return -1;
      if (bOrder != null) return 1;
      const aLatest = a.latestCards[0]?.createdAtMs ?? 0;
      const bLatest = b.latestCards[0]?.createdAtMs ?? 0;
      return bLatest - aLatest;
    });
  }, [mainScreenAlbums, settings.mainScreenAlbumOrder]);

  const mainScreenAlbumById = React.useMemo(
    () => new Map(mainScreenAlbums.map((album) => [album.id, album])),
    [mainScreenAlbums]
  );

  React.useEffect(() => {
    if (kind !== 'theme') return;
    const nextSlots = normalizeMainScreenSlots(
      orderedMainScreenAlbums,
      settings.mainScreenAlbumOrder,
      settings.mainScreenAlbumGridCount
    );
    setDraftAlbumSlots((prev) => {
      if (areStringArraysEqual(prev, nextSlots)) return prev;
      draftAlbumSlotsRef.current = nextSlots;
      return nextSlots;
    });
  }, [
    kind,
    orderedMainScreenAlbums,
    settings.mainScreenAlbumGridCount,
    settings.mainScreenAlbumOrder,
  ]);

  React.useEffect(() => {
    draftAlbumSlotsRef.current = draftAlbumSlots;
  }, [draftAlbumSlots]);

  React.useEffect(() => {
    if (!previewEditMode) {
      previewWiggleValue.stopAnimation();
      previewWiggleValue.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(previewWiggleValue, {
          toValue: 1,
          duration: 92,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(previewWiggleValue, {
          toValue: -1,
          duration: 120,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(previewWiggleValue, {
          toValue: 0,
          duration: 92,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [previewEditMode, previewWiggleValue]);

  const handleSelectAIReplyLanguage = React.useCallback(
    async (language: AIReplyLanguage) => {
      try {
        if (
          settings.aiReplyLanguage === language &&
          settings.uiLanguage === language
        )
          return;
        await persistSettings({
          ...settings,
          aiReplyLanguage: language,
          uiLanguage: language,
        });
        const userId = await getCurrentSessionUserId();
        if (userId) {
          await localizeDefaultExperienceSavedCard(userId, language);
        }
        Alert.alert(
          tUI(language, 'settings.language.restartTitle'),
          tUI(language, 'settings.language.restartBody')
        );
      } catch (error) {
        console.error(
          '[ProfileSettingOptions] update AI reply language failed:',
          error
        );
        Alert.alert(
          tUI(settings.uiLanguage, 'settings.language.updateFailedTitle'),
          tUI(settings.uiLanguage, 'settings.language.updateFailedBody')
        );
      }
    },
    [persistSettings, settings]
  );

  const handleSelectVoice = React.useCallback(
    async (voice: TTSVoice) => {
      try {
        const targetTTSLanguage = getPrimaryAIReplyLanguageForLearningLanguages(
          settings.learningLanguages
        );
        const nextSettings = withUpdatedTTSVoiceOnlyForLanguage(
          settings,
          targetTTSLanguage,
          voice
        );
        await persistSettings(nextSettings);
      } catch (error) {
        console.error('[ProfileSettingOptions] update voice failed:', error);
        Alert.alert('更新失敗', '無法儲存語音設定，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const handleSelectFont = React.useCallback(
    async (fontKey: StickerFontKey) => {
      try {
        const nextSettings = { ...settings, stickerFontKey: fontKey };
        await persistSettings(nextSettings);
      } catch (error) {
        console.error(
          '[ProfileSettingOptions] update sticker font failed:',
          error
        );
        Alert.alert('更新失敗', '無法儲存貼紙字體，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const handleSelectThemeMode = React.useCallback(
    async (themeMode: ThemeMode) => {
      if (settings.themeMode === themeMode) return;
      void Haptics.selectionAsync();
      try {
        await persistSettings({ ...settings, themeMode });
      } catch (error) {
        console.error(
          '[ProfileSettingOptions] update appearance failed:',
          error
        );
        Alert.alert(
          tUI(settings.uiLanguage, 'settings.theme.updateFailedTitle'),
          tUI(settings.uiLanguage, 'settings.theme.updateFailedBody')
        );
      }
    },
    [persistSettings, settings]
  );

  const updateStickerScaleFromSlider = React.useCallback(
    (event: GestureResponderEvent) => {
      if (stickerScaleSliderWidth <= 0) return;
      const x = Math.max(
        0,
        Math.min(stickerScaleSliderWidth, event.nativeEvent.locationX)
      );
      const raw =
        STICKER_SCALE_MIN +
        (x / stickerScaleSliderWidth) * (STICKER_SCALE_MAX - STICKER_SCALE_MIN);
      const nextValue =
        Math.round(raw / STICKER_SCALE_STEP) * STICKER_SCALE_STEP;
      pendingStickerScaleRef.current = nextValue;
      setSettings((current) =>
        current.stickerFontScalePercent === nextValue
          ? current
          : { ...current, stickerFontScalePercent: nextValue }
      );
      if (lastStickerScaleHapticRef.current !== nextValue) {
        lastStickerScaleHapticRef.current = nextValue;
        void Haptics.selectionAsync();
      }
    },
    [stickerScaleSliderWidth]
  );

  const commitStickerScale = React.useCallback(async () => {
    const nextValue = pendingStickerScaleRef.current;
    try {
      const current = await loadUserSettings();
      if (current.stickerFontScalePercent === nextValue) return;
      await persistSettings({ ...current, stickerFontScalePercent: nextValue });
    } catch (error) {
      console.error(
        '[ProfileSettingOptions] update sticker size failed:',
        error
      );
      const current = await loadUserSettings();
      setSettings(current);
    }
  }, [persistSettings]);

  const startPremiumSuccessTransition = React.useCallback(() => {
    premiumGreetingShownRef.current = false;
    setPremiumTransitionVisible(true);
    setPremiumTransitionReady(false);
    requestAnimationFrame(() => {
      setPremiumTransitionReady(true);
    });
  }, []);

  const finishPremiumSuccessTransition = React.useCallback(() => {
    setPremiumTransitionVisible(false);
    setPremiumTransitionReady(false);
    if (membershipReturnTo === 'create-card') {
      if (navigation.canGoBack?.()) {
        navigation.popToTop?.();
      }
      tabSwipeContext?.goToTab(1, { animation: 'fade', durationMs: 360 });
    } else {
      navigation.goBack?.();
    }
    if (premiumGreetingShownRef.current) return;
    premiumGreetingShownRef.current = true;
    setTimeout(() => {
      Alert.alert(
        tUI(settings.uiLanguage, 'settings.membership.welcomeTitle'),
        tUI(settings.uiLanguage, 'settings.membership.welcomeBody')
      );
    }, 360);
  }, [membershipReturnTo, navigation, settings.uiLanguage, tabSwipeContext]);

  const handlePurchaseMembership = React.useCallback(async () => {
    if (savingMembership) return;
    setSavingMembership(true);
    try {
      const userId = await getCurrentSessionUserId();
      if (!userId) {
        Alert.alert(
          tUI(settings.uiLanguage, 'settings.membership.notSignedInTitle'),
          tUI(settings.uiLanguage, 'settings.membership.notSignedInBody')
        );
        return;
      }
      const tierPackages =
        membershipTier === 'lite' ? litePackages : proPackages;
      const packageIdentifier = resolveMembershipPackageIdentifier(
        membershipTier,
        membershipPlan,
        litePackages,
        proPackages
      );
      const purchasedPackage = tierPackages.find(
        (item) => item.identifier === packageIdentifier
      );
      if (!packageIdentifier || !purchasedPackage) {
        throw new Error(
          'The selected subscription plan is not available for this tier.'
        );
      }
      const snapshot = await SubscriptionService.purchasePremium(
        userId,
        packageIdentifier
      );
      setMembershipStatus(snapshot.planType);
      if (
        (snapshot.planType === 'premium' || snapshot.planType === 'trial') &&
        snapshot.serverSynced !== false
      ) {
        analytics.track('subscription_started', {
          plan: resolveBillingPlan(
            [
              purchasedPackage?.packageType,
              purchasedPackage?.identifier,
              purchasedPackage?.subscriptionPeriod,
              purchasedPackage?.productIdentifier,
            ]
              .filter(Boolean)
              .join(' ')
          ),
        });
        startPremiumSuccessTransition();
        return;
      }
      analytics.track('subscription_failed', { reason: 'pending_sync' });
      Alert.alert(
        tUI(
          settings.uiLanguage,
          'settings.membership.purchasePendingSyncTitle'
        ),
        tUI(settings.uiLanguage, 'settings.membership.purchasePendingSyncBody')
      );
    } catch (error) {
      if (error instanceof PurchaseCancelledError) {
        // 使用者主動取消購買：靜默處理，不顯示錯誤、不追蹤失敗。
        return;
      }
      console.error('[ProfileSettingOptions] purchase premium failed:', error);
      analytics.track('subscription_failed', { reason: 'purchase_failed' });
      Alert.alert(
        tUI(settings.uiLanguage, 'settings.membership.purchaseFailedTitle'),
        error instanceof Error
          ? error.message
          : tUI(settings.uiLanguage, 'settings.membership.purchaseFailedBody')
      );
    } finally {
      setSavingMembership(false);
    }
  }, [
    litePackages,
    membershipPlan,
    membershipTier,
    proPackages,
    savingMembership,
    settings.uiLanguage,
    startPremiumSuccessTransition,
  ]);

  const handleRestoreMembership = React.useCallback(async () => {
    if (savingMembership) return;
    setSavingMembership(true);
    try {
      const userId = await getCurrentSessionUserId();
      if (!userId) {
        Alert.alert(
          tUI(settings.uiLanguage, 'settings.membership.notSignedInTitle'),
          tUI(settings.uiLanguage, 'settings.membership.notSignedInBody')
        );
        return;
      }
      const snapshot = await SubscriptionService.restorePurchases(userId);
      setMembershipStatus(snapshot.planType);
      if (
        (snapshot.planType === 'premium' || snapshot.planType === 'trial') &&
        snapshot.serverSynced !== false
      ) {
        startPremiumSuccessTransition();
        return;
      }
      Alert.alert(
        tUI(
          settings.uiLanguage,
          'settings.membership.restoreNoSubscriptionTitle'
        ),
        tUI(
          settings.uiLanguage,
          'settings.membership.restoreNoSubscriptionBody'
        )
      );
    } catch (error) {
      console.error('[ProfileSettingOptions] restore purchases failed:', error);
      Alert.alert(
        tUI(settings.uiLanguage, 'settings.membership.restoreFailedTitle'),
        error instanceof Error
          ? error.message
          : tUI(settings.uiLanguage, 'settings.membership.restoreFailedBody')
      );
    } finally {
      setSavingMembership(false);
    }
  }, [savingMembership, settings.uiLanguage, startPremiumSuccessTransition]);

  const handleSelectTier = React.useCallback(
    (tier: 'lite' | 'pro') => {
      membershipTierRef.current = tier;
      setMembershipTier(tier);
      const packages = tier === 'lite' ? litePackages : proPackages;
      const monthlyPackage = packages.find((item) => {
        const period =
          resolveMembershipPeriodLabel(item.packageType) ||
          resolveMembershipPeriodLabel(item.identifier) ||
          resolveMembershipPeriodLabel(item.subscriptionPeriod) ||
          resolveMembershipPeriodLabel(item.title);
        return period === 'monthly';
      });
      setMembershipPlan(
        monthlyPackage?.identifier || packages[0]?.identifier || 'monthly'
      );
    },
    [litePackages, proPackages]
  );

  const handleManageSubscription = React.useCallback(async () => {
    try {
      await Linking.openURL(APPLE_SUBSCRIPTION_MANAGEMENT_URL);
    } catch (error) {
      console.warn(
        '[ProfileSettingOptions] open subscription management failed:',
        error
      );
      Alert.alert(tUI(settings.uiLanguage, 'common.unableToOpenLink'));
    }
  }, [settings.uiLanguage]);

  const handleSelectMainScreenAlbumGridCount = React.useCallback(
    async (count: MainScreenAlbumGridCount) => {
      try {
        if (settings.mainScreenAlbumGridCount === count) return;
        await persistSettings({ ...settings, mainScreenAlbumGridCount: count });
      } catch (error) {
        console.error(
          '[ProfileSettingOptions] update main screen grid failed:',
          error
        );
        Alert.alert('更新失敗', '無法儲存主畫面格數，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const handleToggleWordPop = React.useCallback(async () => {
    try {
      const nextWordPopEnabled = !settings.mainScreenWordPopEnabled;
      await persistSettings({
        ...settings,
        mainScreenWordPopEnabled: nextWordPopEnabled,
      });
    } catch (error) {
      console.error(
        '[ProfileSettingOptions] update word pop visibility failed:',
        error
      );
      Alert.alert('更新失敗', '無法儲存 Word pop 顯示設定，請稍後再試。');
    }
  }, [persistSettings, settings]);

  const handleSelectWordPopAlbum = React.useCallback(
    async (albumId: string | null) => {
      try {
        if (settings.mainScreenWordPopAlbumId === albumId) return;
        await persistSettings({
          ...settings,
          mainScreenWordPopAlbumId: albumId,
        });
      } catch (error) {
        console.error(
          '[ProfileSettingOptions] update word pop album failed:',
          error
        );
        Alert.alert('更新失敗', '無法儲存 Word pop 相簿來源，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const persistAlbumOrder = React.useCallback(
    async (nextOrder: string[]) => {
      try {
        const normalizedOrder = normalizeMainScreenSlots(
          orderedMainScreenAlbums,
          nextOrder,
          settings.mainScreenAlbumGridCount
        );
        await persistSettings({
          ...settings,
          mainScreenAlbumOrder: normalizedOrder,
        });
      } catch (error) {
        console.error(
          '[ProfileSettingOptions] update album order failed:',
          error
        );
        Alert.alert('更新失敗', '無法儲存相簿順序，請稍後再試。');
      }
    },
    [orderedMainScreenAlbums, persistSettings, settings]
  );

  const persistRawAlbumSlots = React.useCallback(
    async (nextOrder: string[]) => {
      try {
        await persistSettings({ ...settings, mainScreenAlbumOrder: nextOrder });
      } catch (error) {
        console.error(
          '[ProfileSettingOptions] update raw album slots failed:',
          error
        );
        Alert.alert('更新失敗', '無法儲存主畫面相簿位置，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const moveDraftAlbumToPreviewIndex = React.useCallback(
    (albumId: string, targetIndex: number) => {
      setDraftAlbumSlots((prev) => {
        const currentIndex = prev.indexOf(albumId);
        if (currentIndex < 0) return prev;
        const clampedTargetIndex = Math.max(
          0,
          Math.min(targetIndex, prev.length - 1)
        );
        if (currentIndex === clampedTargetIndex) return prev;

        const nextSlots = [...prev];
        const targetSlot = nextSlots[clampedTargetIndex];
        if (isMainScreenEmptyAlbumSlot(targetSlot)) {
          nextSlots[currentIndex] = targetSlot;
          nextSlots[clampedTargetIndex] = albumId;
          draftAlbumSlotsRef.current = nextSlots;
          return nextSlots;
        }

        const [moved] = nextSlots.splice(currentIndex, 1);
        nextSlots.splice(clampedTargetIndex, 0, moved);
        draftAlbumSlotsRef.current = nextSlots;
        return nextSlots;
      });
    },
    []
  );

  const ensurePreviewEditPage = React.useCallback(() => {
    if (!previewEditMode) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setPreviewEditMode(true);
    setDraftAlbumSlots((prev) => {
      const baseSlots =
        prev.length > 0
          ? prev
          : normalizeMainScreenSlots(
              orderedMainScreenAlbums,
              settings.mainScreenAlbumOrder,
              settings.mainScreenAlbumGridCount
            );
      const emptyTail = baseSlots.slice(-settings.mainScreenAlbumGridCount);
      const alreadyHasEmptyPage =
        emptyTail.length === settings.mainScreenAlbumGridCount &&
        emptyTail.every((slot) => isMainScreenEmptyAlbumSlot(slot));
      const nextSlots = alreadyHasEmptyPage
        ? baseSlots
        : [
            ...baseSlots,
            ...Array.from({ length: settings.mainScreenAlbumGridCount }, () =>
              createMainScreenEmptyAlbumSlot()
            ),
          ];
      draftAlbumSlotsRef.current = nextSlots;
      return areStringArraysEqual(prev, nextSlots) ? prev : nextSlots;
    });
  }, [
    orderedMainScreenAlbums,
    previewEditMode,
    settings.mainScreenAlbumGridCount,
    settings.mainScreenAlbumOrder,
  ]);

  const finishPreviewEditMode = React.useCallback(() => {
    setPreviewEditMode(false);
    const normalizedSlots = normalizeMainScreenSlots(
      orderedMainScreenAlbums,
      draftAlbumSlotsRef.current.length > 0
        ? draftAlbumSlotsRef.current
        : settings.mainScreenAlbumOrder,
      settings.mainScreenAlbumGridCount
    );
    draftAlbumSlotsRef.current = normalizedSlots;
    setDraftAlbumSlots((prev) =>
      areStringArraysEqual(prev, normalizedSlots) ? prev : normalizedSlots
    );
  }, [
    orderedMainScreenAlbums,
    settings.mainScreenAlbumGridCount,
    settings.mainScreenAlbumOrder,
  ]);

  const deletePreviewAlbum = React.useCallback(
    async (album: DeckAlbum) => {
      if (album.isDefault) {
        Alert.alert('無法刪除', '預設資料夾不能刪除。');
        return;
      }

      const baseSlots =
        draftAlbumSlotsRef.current.length > 0
          ? draftAlbumSlotsRef.current
          : normalizeMainScreenSlots(
              orderedMainScreenAlbums,
              settings.mainScreenAlbumOrder,
              settings.mainScreenAlbumGridCount
            );
      const nextSlots = baseSlots.map((slot) =>
        slot === album.id ? createMainScreenEmptyAlbumSlot() : slot
      );
      draftAlbumSlotsRef.current = nextSlots;
      setDraftAlbumSlots(nextSlots);
      setMainScreenAlbums((prev) =>
        prev.filter((item) => item.id !== album.id)
      );
      await persistRawAlbumSlots(nextSlots);

      const prefs = await loadDeckAlbumPreferences();
      const isCustomAlbum = prefs.customAlbums.some(
        (item) => item.id === album.id
      );
      await saveDeckAlbumPreferences({
        ...prefs,
        customAlbums: isCustomAlbum
          ? prefs.customAlbums.filter((item) => item.id !== album.id)
          : prefs.customAlbums,
        deletedAlbumIds:
          isCustomAlbum || prefs.deletedAlbumIds.includes(album.id)
            ? prefs.deletedAlbumIds
            : [...prefs.deletedAlbumIds, album.id],
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPreviewEditMode(false);
    },
    [
      orderedMainScreenAlbums,
      persistRawAlbumSlots,
      settings.mainScreenAlbumGridCount,
      settings.mainScreenAlbumOrder,
    ]
  );

  const confirmDeletePreviewAlbum = React.useCallback(
    (album: DeckAlbum) => {
      Alert.alert(
        tUI(settings.uiLanguage, 'deck.alertDeleteAlbumTitle'),
        `${tUI(settings.uiLanguage, 'deck.alertDeleteAlbumBody')}\n${getDeckAlbumDisplayName(album, settings.uiLanguage)}`,
        [
          {
            text: tUI(settings.uiLanguage, 'deck.alertCancel'),
            style: 'cancel',
            onPress: () => {
              setPreviewEditMode(true);
            },
          },
          {
            text: tUI(settings.uiLanguage, 'deck.alertDelete'),
            style: 'destructive',
            onPress: () => {
              void deletePreviewAlbum(album);
            },
          },
        ]
      );
    },
    [deletePreviewAlbum, settings.uiLanguage]
  );

  const openCreateAlbumAtSlot = React.useCallback((slotId: string) => {
    setPendingCreateSlotId(slotId);
    setNewAlbumName('');
    setCreateAlbumModalVisible(true);
  }, []);

  const cancelCreateAlbumAtSlot = React.useCallback(() => {
    setCreateAlbumModalVisible(false);
    setPendingCreateSlotId(null);
    setNewAlbumName('');
  }, []);

  const confirmCreateAlbumAtSlot = React.useCallback(async () => {
    const trimmedName = newAlbumName.trim();
    if (!trimmedName || !pendingCreateSlotId) return;

    try {
      const newAlbum = createCustomAlbum(trimmedName);
      const prefs = await loadDeckAlbumPreferences();
      await saveDeckAlbumPreferences({
        ...prefs,
        customAlbums: [newAlbum, ...prefs.customAlbums],
      });

      const baseSlots =
        draftAlbumSlotsRef.current.length > 0
          ? draftAlbumSlotsRef.current
          : normalizeMainScreenSlots(
              orderedMainScreenAlbums,
              settings.mainScreenAlbumOrder,
              settings.mainScreenAlbumGridCount
            );
      const targetIndex = baseSlots.indexOf(pendingCreateSlotId);
      const nextSlots = [...baseSlots];
      if (targetIndex >= 0) {
        nextSlots[targetIndex] = newAlbum.id;
      } else {
        nextSlots.push(newAlbum.id);
      }

      draftAlbumSlotsRef.current = nextSlots;
      setDraftAlbumSlots(nextSlots);
      setMainScreenAlbums((prev) => [...prev, newAlbum]);
      await persistRawAlbumSlots(nextSlots);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      cancelCreateAlbumAtSlot();
    } catch (error) {
      console.error(
        '[ProfileSettingOptions] create album from preview slot failed:',
        error
      );
      Alert.alert('建立失敗', '無法建立相簿，請稍後再試。');
    }
  }, [
    cancelCreateAlbumAtSlot,
    newAlbumName,
    orderedMainScreenAlbums,
    pendingCreateSlotId,
    persistRawAlbumSlots,
    settings.mainScreenAlbumGridCount,
    settings.mainScreenAlbumOrder,
  ]);

  const rows = React.useMemo(() => {
    if (kind === 'language') {
      return AI_REPLY_LANGUAGE_OPTIONS.map((item) => ({
        key: item.code,
        selected: item.code === settings.aiReplyLanguage,
        content: (
          <Text
            style={[styles.settingLabel, { color: palette.textOnContainer }]}
          >
            {item.label}
          </Text>
        ),
        onPress: () => void handleSelectAIReplyLanguage(item.code),
      }));
    }

    if (kind === 'voice') {
      const targetTTSLanguage = getPrimaryAIReplyLanguageForLearningLanguages(
        settings.learningLanguages
      );
      return visibleTTSVoiceOptions.map((item) => ({
        key: item.code,
        selected:
          item.code === resolveTTSVoiceForLanguage(settings, targetTTSLanguage),
        content: (
          <Text
            style={[styles.settingLabel, { color: palette.textOnContainer }]}
          >
            {item.label}
          </Text>
        ),
        onPress: () => void handleSelectVoice(item.code),
      }));
    }

    if (kind === 'font') {
      return STICKER_FONT_OPTIONS.map((item) => ({
        key: item.key,
        selected: item.key === settings.stickerFontKey,
        content: <StickerFontPreview label="Nuances" fontKey={item.key} />,
        onPress: () => void handleSelectFont(item.key),
      }));
    }

    return [];
  }, [
    handleSelectFont,
    handleSelectAIReplyLanguage,
    handleSelectVoice,
    kind,
    palette.secondaryText,
    palette.textOnContainer,
    settings,
    visibleTTSVoiceOptions,
  ]);

  const previewSlots = React.useMemo(
    () =>
      draftAlbumSlots.length > 0
        ? draftAlbumSlots
        : normalizeMainScreenSlots(
            orderedMainScreenAlbums,
            settings.mainScreenAlbumOrder,
            settings.mainScreenAlbumGridCount
          ),
    [
      draftAlbumSlots,
      orderedMainScreenAlbums,
      settings.mainScreenAlbumGridCount,
      settings.mainScreenAlbumOrder,
    ]
  );
  const previewGridSlotCount = previewSlots.length;
  const previewPageCount = Math.max(
    1,
    Math.ceil(previewGridSlotCount / settings.mainScreenAlbumGridCount)
  );
  const previewGridColumns = PREVIEW_GRID_COLUMNS;
  const previewRowsPerPage = Math.max(
    1,
    Math.ceil(settings.mainScreenAlbumGridCount / previewGridColumns)
  );
  const previewCellWidth =
    previewGridWidth > 0
      ? (previewGridWidth - PREVIEW_GRID_GAP * (previewGridColumns - 1)) /
        previewGridColumns
      : 0;
  const previewCellHeight = previewCellWidth > 0 ? previewCellWidth + 25 : 0;
  const previewPageHeight =
    previewCellHeight > 0
      ? previewRowsPerPage * previewCellHeight +
        PREVIEW_GRID_GAP * Math.max(0, previewRowsPerPage - 1)
      : 0;
  const previewCanvasHeight =
    previewPageHeight > 0
      ? previewPageCount * previewPageHeight +
        PREVIEW_PAGE_GAP * Math.max(0, previewPageCount - 1)
      : 0;
  const mainScreenGridCountOptions = React.useMemo(
    () => [3, 6] as MainScreenAlbumGridCount[],
    []
  );
  const wordPopAlbumOptions = React.useMemo(
    () => [
      {
        id: null,
        name: tUI(settings.uiLanguage, 'deck.albumAllCards'),
        emoji: '📌',
        color: MODAL_CTA_COLOR,
        coverImageUri: undefined,
      },
      ...mainScreenAlbums
        .filter((album) => album.id !== 'all')
        .map((album) => ({
          id: album.id,
          name: getDeckAlbumDisplayName(album, settings.uiLanguage),
          emoji: album.emoji,
          color: album.color,
          coverImageUri: album.coverImageUri,
        })),
    ],
    [mainScreenAlbums, settings.uiLanguage]
  );
  const effectiveWordPopAlbumId = React.useMemo(
    () =>
      settings.mainScreenWordPopAlbumId &&
      wordPopAlbumOptions.some(
        (album) => album.id === settings.mainScreenWordPopAlbumId
      )
        ? settings.mainScreenWordPopAlbumId
        : null,
    [settings.mainScreenWordPopAlbumId, wordPopAlbumOptions]
  );

  const getPreviewSlotPosition = React.useCallback(
    (index: number) => {
      const pageIndex = Math.floor(index / settings.mainScreenAlbumGridCount);
      const indexInPage = index % settings.mainScreenAlbumGridCount;
      const row = Math.floor(indexInPage / previewGridColumns);
      const col = indexInPage % previewGridColumns;
      return {
        x: col * (previewCellWidth + PREVIEW_GRID_GAP),
        y:
          pageIndex * (previewPageHeight + PREVIEW_PAGE_GAP) +
          row * (previewCellHeight + PREVIEW_GRID_GAP),
      };
    },
    [
      previewCellHeight,
      previewCellWidth,
      previewGridColumns,
      previewPageHeight,
      settings.mainScreenAlbumGridCount,
    ]
  );

  const beginPreviewAlbumDrag = React.useCallback(
    (albumId: string, startIndex: number) => {
      const startPosition = getPreviewSlotPosition(startIndex);
      dragBasePositionRef.current = startPosition;
      lastPreviewTargetIndexRef.current = startIndex;
      activeDragAlbumIdRef.current = albumId;
      setDraggingAlbumId(albumId);
      dragTranslate.setValue({ x: 0, y: 0 });
    },
    [dragTranslate, getPreviewSlotPosition]
  );

  const getPreviewTargetIndexFromGesture = React.useCallback(
    (gestureDx: number, gestureDy: number) => {
      if (
        previewCellWidth <= 0 ||
        previewCellHeight <= 0 ||
        previewPageHeight <= 0
      )
        return null;
      const centerX =
        dragBasePositionRef.current.x + gestureDx + previewCellWidth / 2;
      const centerY =
        dragBasePositionRef.current.y + gestureDy + previewCellHeight / 2;
      const pageBand = previewPageHeight + PREVIEW_PAGE_GAP;
      const pageIndex = Math.max(
        0,
        Math.min(
          previewPageCount - 1,
          Math.floor(centerY / Math.max(1, pageBand))
        )
      );
      const yInPage = centerY - pageIndex * pageBand;
      const row = Math.max(
        0,
        Math.min(
          previewRowsPerPage - 1,
          Math.floor(
            yInPage / Math.max(1, previewCellHeight + PREVIEW_GRID_GAP)
          )
        )
      );
      const col = Math.max(
        0,
        Math.min(
          previewGridColumns - 1,
          Math.floor(centerX / Math.max(1, previewCellWidth + PREVIEW_GRID_GAP))
        )
      );
      return Math.max(
        0,
        Math.min(
          previewSlots.length - 1,
          pageIndex * settings.mainScreenAlbumGridCount +
            row * previewGridColumns +
            col
        )
      );
    },
    [
      previewCellHeight,
      previewCellWidth,
      previewPageCount,
      previewGridColumns,
      previewRowsPerPage,
      previewSlots.length,
      settings.mainScreenAlbumGridCount,
    ]
  );

  React.useEffect(() => {
    if (previewCellWidth <= 0 || previewCellHeight <= 0) return;
    previewSlots.forEach((slot, index) => {
      const nextPosition = getPreviewSlotPosition(index);
      if (!previewPositionValuesRef.current[slot]) {
        previewPositionValuesRef.current[slot] = new Animated.ValueXY(
          nextPosition
        );
        previewPositionTargetsRef.current[slot] = nextPosition;
        return;
      }
      if (draggingAlbumId === slot) return;
      const currentTarget = previewPositionTargetsRef.current[slot];
      const alreadyAtTarget =
        currentTarget &&
        currentTarget.x === nextPosition.x &&
        currentTarget.y === nextPosition.y;
      if (alreadyAtTarget) return;
      previewPositionTargetsRef.current[slot] = nextPosition;
      if (!previewEditMode) {
        previewPositionValuesRef.current[slot].setValue(nextPosition);
        return;
      }
      Animated.spring(previewPositionValuesRef.current[slot], {
        toValue: nextPosition,
        tension: 170,
        friction: 26,
        useNativeDriver: false,
      }).start();
    });
  }, [
    draggingAlbumId,
    getPreviewSlotPosition,
    previewCellHeight,
    previewCellWidth,
    previewEditMode,
    previewSlots,
  ]);

  const endPreviewAlbumDrag = React.useCallback(
    (shouldPersist: boolean) => {
      const albumId = activeDragAlbumIdRef.current;
      if (albumId) {
        const releaseTargetIndex = draftAlbumSlotsRef.current.indexOf(albumId);
        if (
          releaseTargetIndex >= 0 &&
          previewPositionValuesRef.current[albumId]
        ) {
          const releasePosition = getPreviewSlotPosition(releaseTargetIndex);
          previewPositionValuesRef.current[albumId].setValue(releasePosition);
          previewPositionTargetsRef.current[albumId] = releasePosition;
        }
      }
      setDraggingAlbumId(null);
      activeDragAlbumIdRef.current = null;
      pendingDragAlbumRef.current = null;
      previewPanActiveRef.current = false;
      dragTranslate.setValue({ x: 0, y: 0 });
      lastPreviewTargetIndexRef.current = null;
      if (shouldPersist) {
        void persistAlbumOrder(draftAlbumSlotsRef.current);
      }
    },
    [dragTranslate, getPreviewSlotPosition, persistAlbumOrder]
  );

  const previewGridPanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          (previewEditMode || !!activeDragAlbumIdRef.current) &&
          (!!pendingDragAlbumRef.current || !!activeDragAlbumIdRef.current) &&
          (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4),
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          (previewEditMode || !!activeDragAlbumIdRef.current) &&
          (!!pendingDragAlbumRef.current || !!activeDragAlbumIdRef.current) &&
          (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4),
        onPanResponderGrant: () => {
          previewPanActiveRef.current = true;
          if (activeDragAlbumIdRef.current) return;
          const pendingDrag = pendingDragAlbumRef.current;
          if (!pendingDrag) return;
          beginPreviewAlbumDrag(pendingDrag.albumId, pendingDrag.index);
        },
        onPanResponderMove: (_, gestureState) => {
          const albumId = activeDragAlbumIdRef.current;
          if (!albumId) return;
          dragTranslate.setValue({ x: gestureState.dx, y: gestureState.dy });
          const targetIndex = getPreviewTargetIndexFromGesture(
            gestureState.dx,
            gestureState.dy
          );
          if (targetIndex == null) return;
          if (lastPreviewTargetIndexRef.current === targetIndex) return;
          lastPreviewTargetIndexRef.current = targetIndex;
          void Haptics.selectionAsync();
          moveDraftAlbumToPreviewIndex(albumId, targetIndex);
        },
        onPanResponderRelease: (_, gestureState) => {
          endPreviewAlbumDrag(
            Math.abs(gestureState.dx) >= 2 || Math.abs(gestureState.dy) >= 2
          );
        },
        onPanResponderTerminate: () => {
          endPreviewAlbumDrag(false);
        },
      }),
    [
      beginPreviewAlbumDrag,
      dragTranslate,
      endPreviewAlbumDrag,
      getPreviewTargetIndexFromGesture,
      moveDraftAlbumToPreviewIndex,
      previewEditMode,
    ]
  );

  if (kind === 'membership') {
    const tierPackages =
      membershipTier === 'lite' ? litePackages : proPackages;
    const resolvePeriodOf = (item: RevenueCatPackageSummary) =>
      resolveMembershipPeriodLabel(item.packageType) ||
      resolveMembershipPeriodLabel(item.identifier) ||
      resolveMembershipPeriodLabel(item.subscriptionPeriod) ||
      resolveMembershipPeriodLabel(item.title);
    const selectedPlanPackage = tierPackages.find(
      (item) => item.identifier === membershipPlan
    );
    const selectedPlanPeriod = selectedPlanPackage
      ? resolvePeriodOf(selectedPlanPackage)
      : null;
    // 防呆保護：當使用者點定的方案週期 === 其當前生效中的訂閱方案週期時，
    // 底部大按鈕應灰階 Disable 並顯示「目前使用中方案」。
    const isCurrentPlanSelected =
      (membershipStatus === 'premium' ||
        membershipStatus === 'trial' ||
        membershipStatus === 'lite') &&
      activeSubscriptionPeriod != null &&
      selectedPlanPeriod === activeSubscriptionPeriod;
    const featureItems =
      membershipTier === 'lite'
        ? [
            tUI(settings.uiLanguage, 'settings.membership.feature.lite.aiCards'),
            tUI(
              settings.uiLanguage,
              'settings.membership.feature.lite.voiceCache'
            ),
            tUI(settings.uiLanguage, 'settings.membership.feature.lite.review'),
          ]
        : [
            tUI(settings.uiLanguage, 'settings.membership.feature.pro.aiCards'),
            tUI(
              settings.uiLanguage,
              'settings.membership.feature.pro.voiceCache'
            ),
            tUI(settings.uiLanguage, 'settings.membership.feature.pro.speed'),
          ];
    const periodRank = (
      period: 'weekly' | 'monthly' | 'yearly' | null
    ): number =>
      period === 'weekly'
        ? 0
        : period === 'monthly'
          ? 1
          : period === 'yearly'
            ? 2
            : 3;
    const sortedTierPackages = [...tierPackages].sort((a, b) => {
      const periodOf = (item: RevenueCatPackageSummary) =>
        resolveMembershipPeriodLabel(item.packageType) ||
        resolveMembershipPeriodLabel(item.identifier) ||
        resolveMembershipPeriodLabel(item.subscriptionPeriod) ||
        resolveMembershipPeriodLabel(item.title);
      return periodRank(periodOf(a)) - periodRank(periodOf(b));
    });
    const planItems: Array<{
      key: MembershipBillingPlan;
      title: string;
      price: string;
      isYearly: boolean;
      isMonthly: boolean;
      monthlyEquivalent: string | null;
    }> =
      sortedTierPackages.length > 0
        ? sortedTierPackages.map((item) => {
            const isYearly =
              resolveMembershipPeriodLabel(item.packageType) === 'yearly' ||
              resolveMembershipPeriodLabel(item.identifier) === 'yearly' ||
              resolveMembershipPeriodLabel(item.subscriptionPeriod) ===
                'yearly' ||
              resolveMembershipPeriodLabel(item.title) === 'yearly';
            const isMonthly =
              resolveMembershipPeriodLabel(item.packageType) === 'monthly' ||
              resolveMembershipPeriodLabel(item.identifier) === 'monthly' ||
              resolveMembershipPeriodLabel(item.subscriptionPeriod) ===
                'monthly' ||
              resolveMembershipPeriodLabel(item.title) === 'monthly';
            return {
              key: item.identifier,
              title: resolveMembershipPlanTitle(item, settings.uiLanguage),
              price: resolveMembershipPriceLabel(
                item,
                membershipPriceLabel,
                settings.uiLanguage
              ),
              isYearly,
              isMonthly,
              monthlyEquivalent: isYearly
                ? resolveMonthlyEquivalent(
                    item.priceLabel,
                    settings.uiLanguage
                  )
                : null,
            };
          })
        : [
            {
              key: 'current',
              title: tUI(settings.uiLanguage, 'common.premium'),
              price:
                membershipPriceLabel ||
                tUI(settings.uiLanguage, 'common.premium'),
              isYearly: false,
              isMonthly: true,
              monthlyEquivalent: null,
            },
          ];
    const tierOptions: Array<{ key: 'lite' | 'pro'; label: string }> = [
      {
        key: 'lite',
        label: tUI(settings.uiLanguage, 'settings.membership.tier.lite'),
      },
      {
        key: 'pro',
        label: tUI(settings.uiLanguage, 'settings.membership.tier.pro'),
      },
    ];

    return (
      <View style={[styles.root, { backgroundColor: MEMBERSHIP_SCREEN_BG }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <Pressable
              style={({ pressed }) => [
                styles.backButton,
                pressed ? styles.backButtonPressed : null,
              ]}
              onPress={() => navigation.goBack()}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={MEMBERSHIP_HEADER_TEXT}
              />
              <Text
                style={[styles.backText, { color: MEMBERSHIP_HEADER_TEXT }]}
              >
                {tUI(settings.uiLanguage, 'settings.membership.back')}
              </Text>
            </Pressable>
            <Text style={[styles.title, { color: MEMBERSHIP_HEADER_TEXT }]}>
              {tUI(settings.uiLanguage, 'settings.title.membership')}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.membershipRestoreButton,
                pressed ? styles.pressed : null,
              ]}
              onPress={() => void handleRestoreMembership()}
              disabled={savingMembership}
            >
              <Text
                style={[
                  styles.membershipRestoreText,
                  { color: MEMBERSHIP_HEADER_TEXT },
                ]}
              >
                {savingMembership
                  ? tUI(settings.uiLanguage, 'settings.membership.updating')
                  : tUI(settings.uiLanguage, 'settings.membership.restore')}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={[
              styles.membershipScrollContent,
              { paddingBottom: Math.max(insets.bottom + 132, 156) },
            ]}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false}
          >
            <View
              style={[
                styles.membershipPremiumStage,
                { minHeight: membershipStageMinHeight },
              ]}
            >
              <Image
                source={MEMBERSHIP_APP_ICON}
                style={styles.membershipHeroIcon}
                resizeMode="contain"
              />
              <LinearGradient
                pointerEvents="none"
                colors={[
                  'rgba(2,33,61,0)',
                  'rgba(2,33,61,0.12)',
                  'rgba(2,33,61,0.58)',
                  'rgba(2,33,61,0.88)',
                  'rgba(2,33,61,0.98)',
                ]}
                locations={[0, 0.28, 0.52, 0.72, 1]}
                style={styles.membershipHeroMask}
              />
              <View style={styles.membershipHeadlineBlock}>
                <View style={styles.membershipBrandLine}>
                  <Text style={styles.membershipBrandName}>Nuances</Text>
                  <View style={styles.membershipProChip}>
                    <Text style={styles.membershipProChipText}>
                      {membershipTier === 'lite' ? 'LITE' : 'PRO'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.membershipTierSelector}>
                {tierOptions.map((option) => {
                  const active = membershipTier === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      style={({ pressed }) => [
                        styles.membershipTierOption,
                        active ? styles.membershipTierOptionActive : null,
                        pressed ? styles.pressed : null,
                      ]}
                      onPress={() => handleSelectTier(option.key)}
                    >
                      <Text
                        style={[
                          styles.membershipTierOptionText,
                          active
                            ? styles.membershipTierOptionTextActive
                            : null,
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.membershipFeatureList}>
                {featureItems.map((item) => (
                  <View key={item} style={styles.membershipFeatureRow}>
                    <Ionicons
                      name="checkmark"
                      size={22}
                      color={MODAL_CTA_COLOR}
                    />
                    <Text
                      style={styles.membershipFeatureText}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1}
                    >
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.membershipPlanGrid}>
                {planItems.map((plan, index) => {
                  const hasSelectedPlan = planItems.some(
                    (item) => item.key === membershipPlan
                  );
                  const selected =
                    membershipPlan === plan.key ||
                    (!hasSelectedPlan && plan.isMonthly) ||
                    (!hasSelectedPlan &&
                      !planItems.some((item) => item.isMonthly) &&
                      index === 0);
                  return (
                    <MembershipPlanOption
                      key={plan.key}
                      title={plan.title}
                      price={plan.price}
                      selected={selected}
                      onPress={() => setMembershipPlan(plan.key)}
                      isYearly={plan.isYearly}
                      monthlyEquivalent={
                        plan.isYearly ? plan.monthlyEquivalent : null
                      }
                      goldMonthlyEquivalent={membershipTier === 'lite'}
                      showMedalBadge={
                        membershipTier === 'lite' && plan.isYearly
                      }
                      badgeLabel={
                        membershipTier === 'lite' && plan.isYearly
                          ? tUI(
                              settings.uiLanguage,
                              'settings.membership.badge.save'
                            )
                          : undefined
                      }
                    />
                  );
                })}
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.membershipSubscribeButton,
                  isCurrentPlanSelected
                    ? styles.membershipSubscribeButtonDisabled
                    : null,
                  pressed || savingMembership ? styles.pressed : null,
                ]}
                onPress={() => void handlePurchaseMembership()}
                disabled={savingMembership || isCurrentPlanSelected}
              >
                <Text
                  style={[
                    styles.membershipSubscribeText,
                    isCurrentPlanSelected
                      ? styles.membershipSubscribeTextDisabled
                      : null,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                  maxFontSizeMultiplier={1}
                >
                  {savingMembership
                    ? tUI(settings.uiLanguage, 'settings.membership.updating')
                    : isCurrentPlanSelected
                      ? tUI(
                          settings.uiLanguage,
                          'settings.membership.currentPlan'
                        )
                      : membershipStatus === 'premium' ||
                          membershipStatus === 'trial'
                        ? tUI(settings.uiLanguage, 'settings.membership.active')
                        : tUI(
                            settings.uiLanguage,
                            'settings.membership.subscribe'
                          )}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={TEXT_ON_CTA}
                />
              </Pressable>
              {membershipStatus === 'premium' ||
              membershipStatus === 'trial' ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.membershipManageButton,
                    pressed ? styles.pressed : null,
                  ]}
                  onPress={() => void handleManageSubscription()}
                >
                  <Text style={styles.membershipManageText}>
                    {tUI(
                      settings.uiLanguage,
                      'settings.membership.manageSubscription'
                    )}
                  </Text>
                </Pressable>
              ) : null}
              <View style={styles.membershipDisclosureBlock}>
                <Text style={styles.membershipDisclosureText}>
                  {tUI(
                    settings.uiLanguage,
                    'settings.membership.renewalDisclosure'
                  )}
                </Text>
              </View>
            </View>
          </ScrollView>

          <PaywallFooter
            style={[
              styles.membershipFooterLinks,
              { bottom: Math.max(insets.bottom - 20, 8) },
            ]}
            uiLanguage={settings.uiLanguage}
          />
        </SafeAreaView>
        {premiumTransitionVisible ? (
          <View style={styles.premiumTransitionBlocker} pointerEvents="auto">
            <AnimatedSplashV2
              ready={premiumTransitionReady}
              onAnimationComplete={finishPremiumSuccessTransition}
            />
          </View>
        ) : null}
      </View>
    );
  }

  if (kind === 'theme') {
    return (
      <View style={[styles.root, { backgroundColor: palette.screenBg }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <Pressable
              style={({ pressed }) => [
                styles.backButton,
                pressed ? styles.backButtonPressed : null,
              ]}
              onPress={() => navigation.goBack()}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={palette.textOnBg}
              />
              <Text style={[styles.backText, { color: palette.textOnBg }]}>
                {tUI(settings.uiLanguage, 'common.back')}
              </Text>
            </Pressable>
            <Text style={[styles.title, { color: palette.textOnBg }]}>
              {tUI(settings.uiLanguage, 'settings.title.appearance')}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={styles.mainScrollContent}
            scrollEnabled={!draggingAlbumId}
            showsVerticalScrollIndicator={false}
          >
            <ThemeModePicker
              selectedMode={settings.themeMode}
              uiLanguage={settings.uiLanguage}
              textColor={palette.textOnBg}
              secondaryTextColor={palette.secondaryText}
              onSelect={(mode) => void handleSelectThemeMode(mode)}
            />
            <View
              style={[
                styles.mainPreviewCard,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight
                    ? palette.borderSubtle
                    : CONTAINER_NEON_OUTLINE,
                },
              ]}
            >
              <View style={styles.mainSectionHeader}>
                <Text
                  style={[
                    styles.mainInstructionText,
                    { color: palette.textOnContainer },
                  ]}
                >
                  {tUI(
                    settings.uiLanguage,
                    'settings.main.albumReorderInstruction'
                  )}
                </Text>
                {previewEditMode ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.previewDoneButton,
                      { backgroundColor: MODAL_CTA_COLOR },
                      pressed ? styles.pressed : null,
                    ]}
                    onPress={finishPreviewEditMode}
                  >
                    <Text style={styles.previewDoneText}>
                      {tUI(settings.uiLanguage, 'common.done')}
                    </Text>
                  </Pressable>
                ) : (
                  <Text
                    style={[
                      styles.mainSectionMeta,
                      { color: palette.secondaryText },
                    ]}
                  >
                    {settings.mainScreenAlbumGridCount}{' '}
                    {tUI(settings.uiLanguage, 'settings.main.perPageSuffix')}
                  </Text>
                )}
              </View>
              <Animated.View
                style={[
                  styles.previewGrid,
                  previewCanvasHeight > 0
                    ? { height: previewCanvasHeight }
                    : null,
                ]}
                onLayout={(event) => {
                  const width = Math.round(event.nativeEvent.layout.width);
                  setPreviewGridWidth((prev) =>
                    prev === width ? prev : width
                  );
                }}
                {...previewGridPanResponder.panHandlers}
              >
                {Array.from({ length: previewPageCount }).map(
                  (_, pageIndex) => (
                    <View
                      key={`preview-page-bg-${pageIndex}`}
                      pointerEvents="none"
                      style={[
                        styles.previewPageBackground,
                        {
                          top:
                            pageIndex * (previewPageHeight + PREVIEW_PAGE_GAP),
                          height: previewPageHeight,
                          borderColor: isLight
                            ? 'rgba(148,163,184,0.2)'
                            : 'rgba(78,175,244,0.14)',
                        },
                      ]}
                    />
                  )
                )}

                {previewSlots.map((slot, index) => {
                  const slotPosition = getPreviewSlotPosition(index);
                  if (isMainScreenEmptyAlbumSlot(slot)) {
                    if (!previewPositionValuesRef.current[slot]) {
                      previewPositionValuesRef.current[slot] =
                        new Animated.ValueXY(slotPosition);
                    }
                    return (
                      <Animated.View
                        key={`preview-filler-${slot}`}
                        style={[
                          styles.previewAlbumCell,
                          styles.previewAbsoluteCell,
                          previewCellWidth > 0
                            ? { width: previewCellWidth }
                            : null,
                          previewPositionValuesRef.current[slot].getLayout(),
                        ]}
                      >
                        <Pressable
                          style={styles.previewAlbumPressable}
                          onPress={() => openCreateAlbumAtSlot(slot)}
                        >
                          <View
                            style={[
                              styles.previewAlbumCover,
                              styles.previewAlbumFiller,
                              {
                                backgroundColor: palette.modalOptionBg,
                                borderColor: isLight
                                  ? palette.borderSubtle
                                  : CONTAINER_NEON_OUTLINE,
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.previewFillerLine,
                                styles.previewFillerLineOne,
                              ]}
                            />
                            <View
                              style={[
                                styles.previewFillerLine,
                                styles.previewFillerLineTwo,
                              ]}
                            />
                            <View
                              style={[
                                styles.previewFillerLine,
                                styles.previewFillerLineThree,
                              ]}
                            />
                            <View style={styles.previewFillerPlusCircle}>
                              <Text style={styles.previewFillerPlusText}>
                                +
                              </Text>
                            </View>
                          </View>
                          <View style={styles.previewFillerLabelSpacer} />
                        </Pressable>
                      </Animated.View>
                    );
                  }

                  const album = mainScreenAlbumById.get(slot);
                  if (!album) return null;
                  if (!previewPositionValuesRef.current[album.id]) {
                    previewPositionValuesRef.current[album.id] =
                      new Animated.ValueXY(slotPosition);
                  }
                  const isDragging = draggingAlbumId === album.id;
                  const wiggleRotate = previewWiggleValue.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange:
                      index % 2 === 0
                        ? ['-1.4deg', '0deg', '1.4deg']
                        : ['1.2deg', '0deg', '-1.2deg'],
                  });
                  const wiggleTranslateY = previewWiggleValue.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange:
                      index % 2 === 0 ? [-0.8, 0, 0.8] : [0.8, 0, -0.8],
                  });
                  return (
                    <Animated.View
                      key={`preview-${album.id}`}
                      style={[
                        styles.previewAlbumCell,
                        styles.previewAbsoluteCell,
                        previewCellWidth > 0
                          ? { width: previewCellWidth }
                          : null,
                        previewPositionValuesRef.current[album.id].getLayout(),
                        isDragging
                          ? {
                              opacity: 0,
                            }
                          : previewEditMode
                            ? {
                                transform: [
                                  { translateY: wiggleTranslateY },
                                  { rotate: wiggleRotate },
                                ],
                              }
                            : null,
                      ]}
                    >
                      <Pressable
                        onPressIn={() => {
                          pendingDragAlbumRef.current = {
                            albumId: album.id,
                            index,
                          };
                        }}
                        onPressOut={() => {
                          if (
                            activeDragAlbumIdRef.current === album.id &&
                            !previewPanActiveRef.current
                          ) {
                            endPreviewAlbumDrag(false);
                            return;
                          }
                          if (
                            !activeDragAlbumIdRef.current &&
                            !previewPanActiveRef.current
                          ) {
                            pendingDragAlbumRef.current = null;
                          }
                        }}
                        onLongPress={() => {
                          pendingDragAlbumRef.current = {
                            albumId: album.id,
                            index,
                          };
                          ensurePreviewEditPage();
                          beginPreviewAlbumDrag(album.id, index);
                        }}
                        delayLongPress={220}
                        style={styles.previewAlbumPressable}
                      >
                        {previewEditMode ? (
                          <Pressable
                            hitSlop={8}
                            style={({ pressed }) => [
                              styles.previewDeleteButton,
                              {
                                backgroundColor: isLight
                                  ? 'rgba(148,163,184,0.78)'
                                  : 'rgba(71,85,105,0.86)',
                              },
                              pressed
                                ? styles.previewDeleteButtonPressed
                                : null,
                            ]}
                            onPress={() => confirmDeletePreviewAlbum(album)}
                          >
                            <Ionicons name="close" size={13} color="#FFFFFF" />
                          </Pressable>
                        ) : null}
                        <View
                          style={[
                            styles.previewAlbumCover,
                            {
                              backgroundColor: album.coverImageUri
                                ? palette.modalOptionBg
                                : album.color || palette.modalOptionBg,
                              borderColor: isLight
                                ? palette.borderSubtle
                                : CONTAINER_NEON_OUTLINE,
                            },
                          ]}
                        >
                          {album.coverImageUri ? (
                            <Image
                              source={{ uri: album.coverImageUri }}
                              style={styles.previewAlbumImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <Text style={styles.previewAlbumEmoji}>
                              {album.emoji || '📁'}
                            </Text>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.previewAlbumName,
                            { color: palette.textOnContainer },
                          ]}
                          numberOfLines={1}
                        >
                          {getDeckAlbumDisplayName(album, settings.uiLanguage)}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
                {draggingAlbumId &&
                mainScreenAlbumById.get(draggingAlbumId) &&
                previewCellWidth > 0
                  ? (() => {
                      const album = mainScreenAlbumById.get(draggingAlbumId);
                      if (!album) return null;
                      return (
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            styles.previewAlbumCell,
                            styles.previewAbsoluteCell,
                            styles.previewDragOverlay,
                            {
                              width: previewCellWidth,
                              left: dragBasePositionRef.current.x,
                              top: dragBasePositionRef.current.y,
                              transform: [
                                { translateX: dragTranslate.x },
                                { translateY: dragTranslate.y },
                                { scale: 1.04 },
                              ],
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.previewAlbumCover,
                              {
                                backgroundColor: album.coverImageUri
                                  ? palette.modalOptionBg
                                  : album.color || palette.modalOptionBg,
                                borderColor: MODAL_CTA_COLOR,
                              },
                            ]}
                          >
                            {album.coverImageUri ? (
                              <Image
                                source={{ uri: album.coverImageUri }}
                                style={styles.previewAlbumImage}
                                resizeMode="cover"
                              />
                            ) : (
                              <Text style={styles.previewAlbumEmoji}>
                                {album.emoji || '📁'}
                              </Text>
                            )}
                          </View>
                          <Text
                            style={[
                              styles.previewAlbumName,
                              { color: palette.textOnContainer },
                            ]}
                            numberOfLines={1}
                          >
                            {getDeckAlbumDisplayName(
                              album,
                              settings.uiLanguage
                            )}
                          </Text>
                        </Animated.View>
                      );
                    })()
                  : null}
              </Animated.View>
            </View>
            <View
              style={[
                styles.card,
                styles.mainSettingsCard,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight
                    ? palette.borderSubtle
                    : CONTAINER_NEON_OUTLINE,
                  shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                  shadowOpacity: isLight ? 0.08 : 0.18,
                },
              ]}
            >
              <View style={styles.mainBlock}>
                <Text
                  style={[
                    styles.mainSectionTitle,
                    { color: palette.textOnContainer },
                  ]}
                >
                  {tUI(settings.uiLanguage, 'settings.main.albumsPerPage')}
                </Text>
                <View style={styles.segmentRow}>
                  {mainScreenGridCountOptions.map((count) => {
                    const active = settings.mainScreenAlbumGridCount === count;
                    return (
                      <Pressable
                        key={`main-count-${count}`}
                        style={({ pressed }) => [
                          styles.segmentButton,
                          {
                            backgroundColor: active
                              ? '#4EAFF4'
                              : palette.modalOptionBg,
                            borderColor: active
                              ? '#4EAFF4'
                              : isLight
                                ? palette.borderSubtle
                                : CONTAINER_NEON_OUTLINE,
                          },
                          pressed ? styles.pressed : null,
                        ]}
                        onPress={() =>
                          void handleSelectMainScreenAlbumGridCount(count)
                        }
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            {
                              color: active
                                ? '#FFFFFF'
                                : palette.textOnContainer,
                            },
                          ]}
                        >
                          {count}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View
                style={[
                  styles.divider,
                  {
                    backgroundColor: isLight
                      ? 'rgba(148,163,184,0.22)'
                      : 'rgba(148,163,184,0.32)',
                  },
                ]}
              />

              <View style={styles.wordPopRow}>
                <Text
                  style={[
                    styles.settingLabel,
                    { color: palette.textOnContainer },
                  ]}
                >
                  {tUI(settings.uiLanguage, 'settings.main.wordPop')}
                </Text>
                <Switch
                  value={settings.mainScreenWordPopEnabled}
                  onValueChange={() => void handleToggleWordPop()}
                  trackColor={{
                    false: palette.modalOptionBg,
                    true: MODAL_CTA_COLOR,
                  }}
                  thumbColor={TEXT_ON_CTA}
                  ios_backgroundColor={palette.modalOptionBg}
                />
              </View>

              <View
                style={[
                  styles.divider,
                  {
                    backgroundColor: isLight
                      ? 'rgba(148,163,184,0.22)'
                      : 'rgba(148,163,184,0.32)',
                  },
                ]}
              />

              <View style={styles.wordPopSourceBlock}>
                <Text
                  style={[
                    styles.settingLabel,
                    { color: palette.textOnContainer },
                  ]}
                >
                  {tUI(settings.uiLanguage, 'settings.main.wordPopSource')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.wordPopAlbumScroller}
                >
                  {wordPopAlbumOptions.map((album) => {
                    const active =
                      album.id == null
                        ? effectiveWordPopAlbumId == null
                        : effectiveWordPopAlbumId === album.id;
                    return (
                      <Pressable
                        key={album.id ?? 'all'}
                        style={({ pressed }) => [
                          styles.wordPopAlbumPill,
                          {
                            backgroundColor: active
                              ? MODAL_CTA_COLOR
                              : palette.modalOptionBg,
                            borderColor: active
                              ? MODAL_CTA_COLOR
                              : isLight
                                ? palette.borderSubtle
                                : CONTAINER_NEON_OUTLINE,
                          },
                          pressed ? styles.pressed : null,
                        ]}
                        onPress={() => void handleSelectWordPopAlbum(album.id)}
                      >
                        <View
                          style={[
                            styles.wordPopAlbumIcon,
                            {
                              backgroundColor: active
                                ? 'rgba(255,255,255,0.18)'
                                : album.color,
                            },
                          ]}
                        >
                          {album.coverImageUri ? (
                            <Image
                              source={{ uri: album.coverImageUri }}
                              style={styles.wordPopAlbumCover}
                              resizeMode="cover"
                            />
                          ) : (
                            <Text style={styles.wordPopAlbumEmoji}>
                              {album.emoji}
                            </Text>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.wordPopAlbumName,
                            {
                              color: active
                                ? '#FFFFFF'
                                : palette.textOnContainer,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {album.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
        <CreateAlbumModalUI
          visible={createAlbumModalVisible}
          albumName={newAlbumName}
          uiLanguage={settings.uiLanguage}
          onChangeAlbumName={setNewAlbumName}
          onCancel={cancelCreateAlbumAtSlot}
          onConfirm={() => void confirmCreateAlbumAtSlot()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.screenBg }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed ? styles.backButtonPressed : null,
            ]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={20} color={palette.textOnBg} />
            <Text style={[styles.backText, { color: palette.textOnBg }]}>
              {tUI(settings.uiLanguage, 'common.back')}
            </Text>
          </Pressable>
          <Text style={[styles.title, { color: palette.textOnBg }]}>
            {getTitle(kind, settings.uiLanguage)}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {kind === 'language' ? (
          <ScrollView
            style={styles.languageScroll}
            contentContainerStyle={styles.languageScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.languageSectionHeader}>
              <Text
                style={[
                  styles.languageSectionTitle,
                  { color: palette.textOnBg },
                ]}
              >
                {tUI(settings.uiLanguage, 'settings.language.replyTitle')}
              </Text>
            </View>
            <View
              style={[
                styles.card,
                styles.languageCard,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight
                    ? palette.borderSubtle
                    : CONTAINER_NEON_OUTLINE,
                  shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                  shadowOpacity: isLight ? 0.08 : 0.18,
                },
              ]}
            >
              {rows.map((row, index) => (
                <React.Fragment key={row.key}>
                  <TouchableOpacity
                    style={styles.row}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityState={{ selected: row.selected }}
                    onPress={row.onPress}
                  >
                    {row.content}
                    {row.selected ? (
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color={palette.textOnContainer}
                        style={styles.rowIcon}
                      />
                    ) : null}
                  </TouchableOpacity>
                  {index < rows.length - 1 ? (
                    <View
                      style={[
                        styles.divider,
                        {
                          backgroundColor: isLight
                            ? 'rgba(148,163,184,0.22)'
                            : 'rgba(148,163,184,0.32)',
                        },
                      ]}
                    />
                  ) : null}
                </React.Fragment>
              ))}
            </View>
          </ScrollView>
        ) : null}

        {kind === 'font' ? (
          <View
            style={[
              styles.fontScaleCard,
              {
                backgroundColor: palette.containerBg,
                borderColor: isLight
                  ? palette.borderSubtle
                  : CONTAINER_NEON_OUTLINE,
              },
            ]}
          >
            <View style={styles.fontScaleHeader}>
              <Text
                style={[
                  styles.settingLabel,
                  { color: palette.textOnContainer },
                ]}
              >
                {tUI(settings.uiLanguage, 'settings.font.wordSize')}
              </Text>
              <Text style={[styles.fontScaleValue, { color: MODAL_CTA_COLOR }]}>
                {settings.stickerFontScalePercent}%
              </Text>
            </View>
            <View
              style={styles.fontScaleTouchRail}
              onLayout={(event) =>
                setStickerScaleSliderWidth(event.nativeEvent.layout.width)
              }
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={updateStickerScaleFromSlider}
              onResponderMove={updateStickerScaleFromSlider}
              onResponderRelease={() => void commitStickerScale()}
              onResponderTerminate={() => void commitStickerScale()}
              accessibilityRole="adjustable"
              accessibilityLabel={tUI(
                settings.uiLanguage,
                'settings.font.wordSize'
              )}
              accessibilityValue={{
                min: STICKER_SCALE_MIN,
                max: STICKER_SCALE_MAX,
                now: settings.stickerFontScalePercent,
                text: `${settings.stickerFontScalePercent}%`,
              }}
            >
              <View
                style={[
                  styles.fontScaleRail,
                  { backgroundColor: palette.modalOptionBg },
                ]}
              >
                <View
                  style={[
                    styles.fontScaleFill,
                    {
                      width: `${((settings.stickerFontScalePercent - STICKER_SCALE_MIN) / (STICKER_SCALE_MAX - STICKER_SCALE_MIN)) * 100}%`,
                      backgroundColor: MODAL_CTA_COLOR,
                    },
                  ]}
                />
              </View>
              <View
                pointerEvents="none"
                style={[
                  styles.fontScaleThumb,
                  {
                    left: `${((settings.stickerFontScalePercent - STICKER_SCALE_MIN) / (STICKER_SCALE_MAX - STICKER_SCALE_MIN)) * 100}%`,
                    backgroundColor: MODAL_CTA_COLOR,
                  },
                ]}
              />
            </View>
            <View style={styles.fontScaleBounds}>
              <Text
                style={[
                  styles.fontScaleBoundText,
                  { color: palette.secondaryText },
                ]}
              >
                {STICKER_SCALE_MIN}%
              </Text>
              <Text
                style={[
                  styles.fontScaleBoundText,
                  { color: palette.secondaryText },
                ]}
              >
                {STICKER_SCALE_MAX}%
              </Text>
            </View>
          </View>
        ) : null}

        {kind !== 'language' ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: palette.containerBg,
                borderColor: isLight
                  ? palette.borderSubtle
                  : CONTAINER_NEON_OUTLINE,
                shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                shadowOpacity: isLight ? 0.08 : 0.18,
              },
            ]}
          >
            {rows.map((row, index) => (
              <React.Fragment key={row.key}>
                <TouchableOpacity
                  style={styles.row}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityState={{ selected: row.selected }}
                  onPress={row.onPress}
                >
                  {row.content}
                  {row.selected ? (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={palette.textOnContainer}
                      style={styles.rowIcon}
                    />
                  ) : null}
                </TouchableOpacity>
                {index < rows.length - 1 ? (
                  <View
                    style={[
                      styles.divider,
                      {
                        backgroundColor: isLight
                          ? 'rgba(148,163,184,0.22)'
                          : 'rgba(148,163,184,0.32)',
                      },
                    ]}
                  />
                ) : null}
              </React.Fragment>
            ))}
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    marginTop: 8,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 64,
  },
  backButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  headerSpacer: {
    minWidth: 64,
  },
  languageScroll: {
    flex: 1,
  },
  languageScrollContent: {
    paddingBottom: 40,
  },
  languageSectionHeader: {
    marginTop: 20,
    marginHorizontal: 20,
    gap: 4,
  },
  languageSectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  languageCard: {
    marginTop: 10,
  },
  themePicker: {
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  themeOption: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
  },
  themeOptionPressed: {
    transform: [{ scale: 0.98 }],
  },
  themePreview: {
    width: '100%',
    aspectRatio: 1.34,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  themePreviewSelected: {
    borderColor: MODAL_CTA_COLOR,
  },
  themePreviewIdle: {
    borderColor: 'rgba(148,163,184,0.34)',
  },
  themePreviewFull: {
    flex: 1,
    overflow: 'hidden',
  },
  themePreviewHalf: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
    overflow: 'hidden',
  },
  themePreviewHalfLeft: {
    left: 0,
  },
  themePreviewHalfRight: {
    right: 0,
  },
  themePreviewSky: {
    height: '46%',
    transform: [{ skewX: '-16deg' }, { scaleX: 1.25 }],
  },
  themePreviewPanel: {
    position: 'absolute',
    left: 7,
    right: 7,
    bottom: 6,
    height: '52%',
    borderRadius: 8,
    padding: 6,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  themePreviewBlueLine: {
    width: '70%',
    height: 8,
    borderRadius: 3,
    backgroundColor: MODAL_CTA_COLOR,
  },
  themePreviewDots: {
    flexDirection: 'row',
    gap: 6,
  },
  themePreviewDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  themeOptionLabel: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  card: {
    marginTop: 18,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 6,
  },
  fontScaleCard: {
    marginTop: 18,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 12,
  },
  fontScaleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fontScaleValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  fontScaleTouchRail: {
    height: 38,
    justifyContent: 'center',
    marginTop: 6,
  },
  fontScaleRail: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fontScaleFill: {
    height: '100%',
    borderRadius: 999,
  },
  fontScaleThumb: {
    position: 'absolute',
    top: 7,
    width: 24,
    height: 24,
    marginLeft: -12,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: TEXT_ON_CTA,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fontScaleBounds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fontScaleBoundText: {
    fontSize: 11,
    fontWeight: '700',
  },
  row: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowIcon: {
    width: 20,
    textAlign: 'right',
    marginLeft: 12,
  },
  divider: {
    height: 1,
    marginHorizontal: 14,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingDescription: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  optionTextStack: {
    flex: 1,
    paddingVertical: 10,
    gap: 4,
  },
  optionDescription: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  membershipRestoreButton: {
    minWidth: 64,
    minHeight: 34,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  membershipRestoreText: {
    fontSize: 15,
    fontWeight: '800',
  },
  membershipScrollContent: {
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 10,
  },
  membershipPremiumStage: {
    minHeight: 728,
    position: 'relative',
    justifyContent: 'flex-end',
    overflow: 'visible',
    paddingHorizontal: 16,
    paddingBottom: 60,
  },
  membershipHeroIcon: {
    position: 'absolute',
    top: 18,
    alignSelf: 'center',
    width: 250,
    height: 250,
    opacity: 0.62,
  },
  membershipHeroMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -20,
    height: 600,
  },
  membershipHeadlineBlock: {
    alignItems: 'center',
    marginBottom: 15,
    paddingHorizontal: 18,
  },
  membershipBrandLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  membershipBrandName: {
    color: '#FFFFFF',
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '700',
    letterSpacing: -1.2,
  },
  membershipProChip: {
    borderWidth: 1.6,
    borderColor: MODAL_CTA_COLOR,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  membershipProChipText: {
    color: MODAL_CTA_COLOR,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  membershipTierSelector: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  membershipTierOption: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  membershipTierOptionActive: {
    borderColor: MODAL_CTA_COLOR,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  membershipTierOptionText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  membershipTierOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  membershipPlanBadge: {
    position: 'absolute',
    top: -16,
    alignSelf: 'center',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FDE68A',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    zIndex: 10,
  },
  membershipPlanBadgeText: {
    color: '#451A03',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  membershipFeatureList: {
    gap: 14,
    paddingHorizontal: 6,
    marginBottom: -12,
  },
  membershipFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 30,
  },
  membershipFeatureText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
  },
  membershipPlanGrid: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 30,
  },
  membershipPlanPressable: {
    flex: 1,
  },
  membershipPlanCard: {
    flex: 1,
    minHeight: 94,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  membershipPlanTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  membershipPlanPrice: {
    alignSelf: 'stretch',
    flexShrink: 1,
    marginTop: 4,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: 1,
  },
  membershipPlanMonthlyEquivalent: {
    alignSelf: 'stretch',
    marginTop: 3,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.72)',
    paddingHorizontal: 1,
  },
  membershipPlanMonthlyEquivalentGold: {
    color: '#FDE68A',
    textShadowColor: 'rgba(245,158,11,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  membershipDisclosureBlock: {
    gap: 4,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  membershipDisclosureText: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  membershipSubscribeButton: {
    marginTop: 14,
    height: BUTTON_TOKENS.height.prominent,
    borderRadius: BUTTON_TOKENS.radius.lg,
    backgroundColor: UPLOAD_CACHE_CTA_COLOR,
    borderWidth: 1,
    borderColor: UPLOAD_CACHE_CTA_COLOR_BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#00E5FF',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  membershipSubscribeText: {
    color: TEXT_ON_CTA,
    fontSize: BUTTON_TOKENS.text.strong,
    fontWeight: BUTTON_TOKENS.weight.regular,
    letterSpacing: 0.2,
  },
  membershipSubscribeButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.16)',
    shadowOpacity: 0,
    elevation: 0,
  },
  membershipSubscribeTextDisabled: {
    color: 'rgba(255,255,255,0.42)',
  },
  membershipManageButton: {
    alignSelf: 'center',
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 6,
    borderRadius: 999,
  },
  membershipManageText: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  membershipFooterLinks: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
  premiumTransitionBlocker: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 34,
    gap: 16,
  },
  mainPreviewCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  mainSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  mainSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  mainInstructionText: {
    flex: 1,
    paddingRight: 12,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  mainSectionMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  previewGrid: {
    position: 'relative',
    width: '100%',
    minHeight: 120,
  },
  previewAlbumCell: {
    width: '31%',
  },
  previewAbsoluteCell: {
    position: 'absolute',
  },
  previewDragOverlay: {
    zIndex: 40,
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  previewAlbumPressable: {
    width: '100%',
  },
  previewDeleteButton: {
    position: 'absolute',
    top: -8,
    left: -8,
    zIndex: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
  },
  previewDeleteButtonPressed: {
    transform: [{ scale: 0.92 }],
  },
  previewPageBackground: {
    position: 'absolute',
    left: -4,
    right: -4,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  previewDoneButton: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewDoneText: {
    color: TEXT_ON_CTA,
    fontSize: 12,
    fontWeight: '800',
  },
  previewAlbumCover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewAlbumImage: {
    width: '100%',
    height: '100%',
  },
  previewAlbumEmoji: {
    fontSize: 24,
  },
  previewAlbumFiller: {
    position: 'relative',
  },
  previewFillerLine: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(78,175,244,0.16)',
  },
  previewFillerLineOne: {
    top: 28,
    opacity: 0.52,
  },
  previewFillerLineTwo: {
    top: 44,
    opacity: 0.34,
  },
  previewFillerLineThree: {
    top: 60,
    opacity: 0.22,
  },
  previewFillerPlusCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4EAFF4',
    shadowColor: '#4EAFF4',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  previewFillerPlusText: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 25,
    fontWeight: '700',
    marginTop: -2,
  },
  previewAlbumName: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '800',
  },
  previewFillerLabelSpacer: {
    height: 19,
    marginTop: 6,
  },
  mainSettingsCard: {
    marginTop: 0,
    marginHorizontal: 0,
  },
  mainBlock: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  segmentRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  segmentButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 16,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  wordPopRow: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  wordPopSourceBlock: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  wordPopAlbumScroller: {
    paddingTop: 8,
    paddingRight: 8,
    gap: 10,
  },
  wordPopAlbumPill: {
    maxWidth: 180,
    minHeight: 46,
    borderRadius: 18,
    borderWidth: 1,
    paddingLeft: 7,
    paddingRight: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordPopAlbumIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordPopAlbumEmoji: {
    fontSize: 17,
  },
  wordPopAlbumCover: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  wordPopAlbumName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
  },
});
