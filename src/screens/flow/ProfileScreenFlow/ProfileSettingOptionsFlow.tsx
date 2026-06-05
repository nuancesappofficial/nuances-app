import React from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import StickerFontPreview from '../../../components/UI/ProfileScreenUI/StickerFontPreview';
import PaywallFooter from '../../../components/UI/ProfileScreenUI/PaywallFooter';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import type { DeckAlbum } from '../../../components/UI/DeckScreenUI/deckTypes';
import {
  buildDeckAlbums,
  createCustomAlbum,
  loadDeckAlbumPreferences,
  saveDeckAlbumPreferences,
} from '../../../features/deck/albums';
import CreateAlbumModalUI from '../../../components/UI/DeckScreenUI/CreateAlbumModalUI';
import {
  DEFAULT_USER_SETTINGS,
  createMainScreenEmptyAlbumSlot,
  isTTSVoiceCompatibleWithAIReplyLanguage,
  isMainScreenEmptyAlbumSlot,
  loadUserSettings,
  type MainScreenAlbumGridCount,
  resolveTTSVoiceForLanguage,
  saveUserSettings,
  type AIReplyLanguage,
  type TTSVoice,
  type UserAppSettings,
  withUpdatedTTSVoiceForLanguage,
} from '@services/settings/userSettings';
import {
  CONTAINER_NEON_GLOW,
  CONTAINER_NEON_OUTLINE,
  MODAL_CTA_COLOR,
  TEXT_ON_CTA,
  UPLOAD_CACHE_CTA_COLOR,
  UPLOAD_CACHE_CTA_COLOR_BORDER,
  resolveThemeColors,
} from '../../../theme/colors';
import { STICKER_FONT_OPTIONS, type StickerFontKey } from '../../../theme/stickerFonts';
import { BUTTON_TOKENS } from '../../../theme/buttonTokens';
import { getRevenueCatOfferingSummary, isRevenueCatConfigured } from '@services/subscription/revenueCat';
import SubscriptionService from '@services/subscription/SubscriptionService';
import { supabase } from '@services/supabase/client';

type SettingOptionKind = 'ai' | 'voice' | 'font' | 'main' | 'membership';
type MembershipBillingPlan = 'weekly' | 'monthly' | 'yearly';

type Props = {
  navigation: any;
  route: {
    params?: {
      kind?: SettingOptionKind;
    };
  };
};

const AI_LANGUAGE_OPTIONS: Array<{ code: AIReplyLanguage; label: string }> = [
  { code: 'zh-TW', label: '繁中' },
  { code: 'zh-CN', label: '简中' },
  { code: 'en', label: 'EN' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'ES' },
  { code: 'fr', label: 'FR' },
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
const MEMBERSHIP_APP_ICON = require('../../../../assets/app_icons/icon_cutout2.png');
const MEMBERSHIP_SCREEN_BG = '#02213D';
const MEMBERSHIP_HEADER_TEXT = '#FFFFFF';
const MEMBERSHIP_PLAN_IDLE_BG = 'rgba(255,255,255,0.055)';
const MEMBERSHIP_PLAN_ACTIVE_BG = 'rgba(78,175,244,0.14)';
const MEMBERSHIP_PLAN_IDLE_BORDER = 'rgba(255,255,255,0.24)';

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
    Math.ceil(Math.max(slotsPerPage, lastAlbumIndex + 1, albums.length) / slotsPerPage) * slotsPerPage;
  const trimmedSlots = slots.slice(0, desiredSlotCount);
  while (trimmedSlots.length < desiredSlotCount) {
    trimmedSlots.push(createMainScreenEmptyAlbumSlot());
  }

  return trimmedSlots;
}

function getTitle(kind: SettingOptionKind): string {
  if (kind === 'ai') return 'Language';
  if (kind === 'voice') return 'Voice';
  if (kind === 'main') return 'Main screen';
  if (kind === 'membership') return 'Membership';
  return 'Font';
}

function MembershipPlanOption({
  title,
  price,
  perDay,
  selected,
  onPress,
}: {
  title: string;
  price: string;
  perDay: string;
  selected: boolean;
  onPress: () => void;
}) {
  const selectedProgress = React.useRef(new Animated.Value(selected ? 1 : 0)).current;
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
        <Animated.Text style={[styles.membershipPlanTitle, animatedTextStyle]}>{title}</Animated.Text>
        <Animated.Text style={[styles.membershipPlanPrice, animatedTextStyle]}>{price}</Animated.Text>
        <Text style={styles.membershipPlanMeta}>{perDay}</Text>
      </Animated.View>
    </Pressable>
  );
}

export default function ProfileSettingOptionsFlow({ navigation, route }: Props) {
  const kind = route.params?.kind ?? 'ai';
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const palette = React.useMemo(() => resolveThemeColors(colorScheme), [colorScheme]);
  const isLight = colorScheme === 'light';
  const membershipStageMinHeight = Math.max(728, windowHeight - 92);
  const [settings, setSettings] = React.useState<UserAppSettings>(DEFAULT_USER_SETTINGS);
  const [mainScreenAlbums, setMainScreenAlbums] = React.useState<DeckAlbum[]>([]);
  const [previewGridWidth, setPreviewGridWidth] = React.useState(0);
  const [draggingAlbumId, setDraggingAlbumId] = React.useState<string | null>(null);
  const [previewEditMode, setPreviewEditMode] = React.useState(false);
  const [draftAlbumSlots, setDraftAlbumSlots] = React.useState<string[]>([]);
  const [createAlbumModalVisible, setCreateAlbumModalVisible] = React.useState(false);
  const [newAlbumName, setNewAlbumName] = React.useState('');
  const [pendingCreateSlotId, setPendingCreateSlotId] = React.useState<string | null>(null);
  const [membershipPriceLabel, setMembershipPriceLabel] = React.useState<string | null>(null);
  const [membershipPlan, setMembershipPlan] = React.useState<MembershipBillingPlan>('monthly');
  const [savingMembership, setSavingMembership] = React.useState(false);
  const [membershipStatus, setMembershipStatus] = React.useState<'trial' | 'free' | 'premium'>('free');
  const dragTranslate = React.useRef(new Animated.ValueXY()).current;
  const previewPositionValuesRef = React.useRef<Record<string, Animated.ValueXY>>({});
  const previewPositionTargetsRef = React.useRef<Record<string, { x: number; y: number }>>({});
  const previewWiggleValue = React.useRef(new Animated.Value(0)).current;
  const lastPreviewTargetIndexRef = React.useRef<number | null>(null);
  const draftAlbumSlotsRef = React.useRef<string[]>([]);
  const dragBasePositionRef = React.useRef({ x: 0, y: 0 });
  const pendingDragAlbumRef = React.useRef<{ albumId: string; index: number } | null>(null);
  const activeDragAlbumIdRef = React.useRef<string | null>(null);
  const previewPanActiveRef = React.useRef(false);

  React.useEffect(() => {
    if (kind !== 'ai' && kind !== 'voice' && kind !== 'font' && kind !== 'main' && kind !== 'membership') {
      navigation.goBack();
      return;
    }

    void loadUserSettings()
      .then(setSettings)
      .catch((error) => {
        console.error('[ProfileSettingOptions] load settings failed:', error);
      });
  }, [kind, navigation]);

  React.useEffect(() => {
    if (kind !== 'membership') return;
    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          const snapshot = await SubscriptionService.getEntitlementSnapshot(user.id);
          if (!cancelled) setMembershipStatus(snapshot.planType);
        }

        if (!isRevenueCatConfigured()) {
          if (!cancelled) setMembershipPriceLabel(null);
          return;
        }

        const summary = await getRevenueCatOfferingSummary(user?.id ?? null);
        if (!cancelled) setMembershipPriceLabel(summary.priceLabel);
      } catch (error) {
        console.error('[ProfileSettingOptions] load membership failed:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  React.useEffect(() => {
    if (kind !== 'main') return;
    let cancelled = false;
    void (async () => {
      try {
        const [cards, prefs] = await Promise.all([
          database.get<Card>('cards').query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc)).fetch(),
          loadDeckAlbumPreferences(),
        ]);
        if (cancelled) return;
        setMainScreenAlbums(buildDeckAlbums(cards, {}, prefs));
      } catch (error) {
        console.error('[ProfileSettingOptions] load main screen albums failed:', error);
        if (!cancelled) setMainScreenAlbums([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const visibleTTSVoiceOptions = React.useMemo(
    () =>
      TTS_VOICE_OPTIONS.filter((item) =>
        isTTSVoiceCompatibleWithAIReplyLanguage(item.code, settings.aiReplyLanguage)
      ),
    [settings.aiReplyLanguage]
  );

  const persistSettings = React.useCallback(async (next: UserAppSettings) => {
    await saveUserSettings(next);
    setSettings(next);
  }, []);

  const orderedMainScreenAlbums = React.useMemo(() => {
    const orderIndex = new Map(settings.mainScreenAlbumOrder.map((albumId, index) => [albumId, index]));
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
    if (kind !== 'main') return;
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
  }, [kind, orderedMainScreenAlbums, settings.mainScreenAlbumGridCount, settings.mainScreenAlbumOrder]);

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

  const handleSelectLanguage = React.useCallback(
    async (language: AIReplyLanguage) => {
      try {
        const nextVoice = resolveTTSVoiceForLanguage(settings, language);
        const nextSettings = withUpdatedTTSVoiceForLanguage(settings, language, nextVoice);
        await persistSettings(nextSettings);
      } catch (error) {
        console.error('[ProfileSettingOptions] update language failed:', error);
        Alert.alert('更新失敗', '無法儲存語言設定，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const handleSelectVoice = React.useCallback(
    async (voice: TTSVoice) => {
      try {
        const nextSettings = withUpdatedTTSVoiceForLanguage(settings, settings.aiReplyLanguage, voice);
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
        console.error('[ProfileSettingOptions] update sticker font failed:', error);
        Alert.alert('更新失敗', '無法儲存貼紙字體，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const handlePurchaseMembership = React.useCallback(async () => {
    if (savingMembership) return;
    setSavingMembership(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        Alert.alert('尚未登入', '請先登入，再升級到 Premium。');
        return;
      }
      const snapshot = await SubscriptionService.purchasePremium(user.id);
      setMembershipStatus(snapshot.planType);
      Alert.alert('升級成功', 'Premium 已解鎖 AI、雲端語音與發音評分。');
    } catch (error) {
      console.error('[ProfileSettingOptions] purchase premium failed:', error);
      Alert.alert('升級失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setSavingMembership(false);
    }
  }, [savingMembership]);

  const handleRestoreMembership = React.useCallback(async () => {
    if (savingMembership) return;
    setSavingMembership(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        Alert.alert('尚未登入', '請先登入，再恢復購買。');
        return;
      }
      const snapshot = await SubscriptionService.restorePurchases(user.id);
      setMembershipStatus(snapshot.planType);
      Alert.alert(
        '恢復完成',
        snapshot.planType === 'premium' ? '已恢復 Premium 購買。' : '目前沒有可恢復的有效 Premium 訂閱。'
      );
    } catch (error) {
      console.error('[ProfileSettingOptions] restore purchases failed:', error);
      Alert.alert('恢復失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setSavingMembership(false);
    }
  }, [savingMembership]);

  const handleSelectMainScreenAlbumGridCount = React.useCallback(
    async (count: MainScreenAlbumGridCount) => {
      try {
        if (settings.mainScreenWordPopEnabled && count === 9) return;
        if (settings.mainScreenAlbumGridCount === count) return;
        await persistSettings({ ...settings, mainScreenAlbumGridCount: count });
      } catch (error) {
        console.error('[ProfileSettingOptions] update main screen grid failed:', error);
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
        mainScreenAlbumGridCount:
          nextWordPopEnabled && settings.mainScreenAlbumGridCount === 9 ? 6 : settings.mainScreenAlbumGridCount,
      });
    } catch (error) {
      console.error('[ProfileSettingOptions] update word pop visibility failed:', error);
      Alert.alert('更新失敗', '無法儲存 Word pop 顯示設定，請稍後再試。');
    }
  }, [persistSettings, settings]);

  const persistAlbumOrder = React.useCallback(
    async (nextOrder: string[]) => {
      try {
        const normalizedOrder = normalizeMainScreenSlots(
          orderedMainScreenAlbums,
          nextOrder,
          settings.mainScreenAlbumGridCount
        );
        await persistSettings({ ...settings, mainScreenAlbumOrder: normalizedOrder });
      } catch (error) {
        console.error('[ProfileSettingOptions] update album order failed:', error);
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
        console.error('[ProfileSettingOptions] update raw album slots failed:', error);
        Alert.alert('更新失敗', '無法儲存主畫面相簿位置，請稍後再試。');
      }
    },
    [persistSettings, settings]
  );

  const moveDraftAlbumToPreviewIndex = React.useCallback((albumId: string, targetIndex: number) => {
    setDraftAlbumSlots((prev) => {
      const currentIndex = prev.indexOf(albumId);
      if (currentIndex < 0) return prev;
      const clampedTargetIndex = Math.max(0, Math.min(targetIndex, prev.length - 1));
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
  }, []);

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
            ...Array.from({ length: settings.mainScreenAlbumGridCount }, () => createMainScreenEmptyAlbumSlot()),
          ];
      draftAlbumSlotsRef.current = nextSlots;
      return areStringArraysEqual(prev, nextSlots) ? prev : nextSlots;
    });
  }, [orderedMainScreenAlbums, previewEditMode, settings.mainScreenAlbumGridCount, settings.mainScreenAlbumOrder]);

  const finishPreviewEditMode = React.useCallback(() => {
    setPreviewEditMode(false);
    const normalizedSlots = normalizeMainScreenSlots(
      orderedMainScreenAlbums,
      draftAlbumSlotsRef.current.length > 0 ? draftAlbumSlotsRef.current : settings.mainScreenAlbumOrder,
      settings.mainScreenAlbumGridCount
    );
    draftAlbumSlotsRef.current = normalizedSlots;
    setDraftAlbumSlots((prev) => (areStringArraysEqual(prev, normalizedSlots) ? prev : normalizedSlots));
  }, [orderedMainScreenAlbums, settings.mainScreenAlbumGridCount, settings.mainScreenAlbumOrder]);

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
      const nextSlots = baseSlots.map((slot) => (slot === album.id ? createMainScreenEmptyAlbumSlot() : slot));
      draftAlbumSlotsRef.current = nextSlots;
      setDraftAlbumSlots(nextSlots);
      setMainScreenAlbums((prev) => prev.filter((item) => item.id !== album.id));
      await persistRawAlbumSlots(nextSlots);

      const prefs = await loadDeckAlbumPreferences();
      const isCustomAlbum = prefs.customAlbums.some((item) => item.id === album.id);
      await saveDeckAlbumPreferences({
        ...prefs,
        customAlbums: isCustomAlbum ? prefs.customAlbums.filter((item) => item.id !== album.id) : prefs.customAlbums,
        deletedAlbumIds:
          isCustomAlbum || prefs.deletedAlbumIds.includes(album.id)
            ? prefs.deletedAlbumIds
            : [...prefs.deletedAlbumIds, album.id],
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPreviewEditMode(false);
    },
    [orderedMainScreenAlbums, persistRawAlbumSlots, settings.mainScreenAlbumGridCount, settings.mainScreenAlbumOrder]
  );

  const confirmDeletePreviewAlbum = React.useCallback(
    (album: DeckAlbum) => {
      Alert.alert('刪除相簿', `確定要刪除「${album.name}」嗎？`, [
        {
          text: '取消',
          style: 'cancel',
          onPress: () => {
            setPreviewEditMode(true);
          },
        },
        {
          text: '刪除',
          style: 'destructive',
          onPress: () => {
            void deletePreviewAlbum(album);
          },
        },
      ]);
    },
    [deletePreviewAlbum]
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
      console.error('[ProfileSettingOptions] create album from preview slot failed:', error);
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
    if (kind === 'ai') {
      return AI_LANGUAGE_OPTIONS.map((item) => ({
        key: item.code,
        selected: item.code === settings.aiReplyLanguage,
        content: <Text style={[styles.settingLabel, { color: palette.textOnContainer }]}>{item.label}</Text>,
        onPress: () => void handleSelectLanguage(item.code),
      }));
    }

    if (kind === 'voice') {
      return visibleTTSVoiceOptions.map((item) => ({
        key: item.code,
        selected: item.code === resolveTTSVoiceForLanguage(settings, settings.aiReplyLanguage),
        content: <Text style={[styles.settingLabel, { color: palette.textOnContainer }]}>{item.label}</Text>,
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
  }, [handleSelectFont, handleSelectLanguage, handleSelectVoice, kind, palette.textOnContainer, settings, visibleTTSVoiceOptions]);

  const previewSlots = React.useMemo(
    () =>
      draftAlbumSlots.length > 0
        ? draftAlbumSlots
        : normalizeMainScreenSlots(
            orderedMainScreenAlbums,
            settings.mainScreenAlbumOrder,
            settings.mainScreenAlbumGridCount
          ),
    [draftAlbumSlots, orderedMainScreenAlbums, settings.mainScreenAlbumGridCount, settings.mainScreenAlbumOrder]
  );
  const previewGridSlotCount = previewSlots.length;
  const previewPageCount = Math.max(1, Math.ceil(previewGridSlotCount / settings.mainScreenAlbumGridCount));
  const previewRowsPerPage = Math.max(1, Math.ceil(settings.mainScreenAlbumGridCount / PREVIEW_GRID_COLUMNS));
  const previewCellWidth =
    previewGridWidth > 0
      ? (previewGridWidth - PREVIEW_GRID_GAP * (PREVIEW_GRID_COLUMNS - 1)) / PREVIEW_GRID_COLUMNS
      : 0;
  const previewCellHeight = previewCellWidth > 0 ? previewCellWidth + 25 : 0;
  const previewPageHeight =
    previewCellHeight > 0
      ? previewRowsPerPage * previewCellHeight + PREVIEW_GRID_GAP * Math.max(0, previewRowsPerPage - 1)
      : 0;
  const previewCanvasHeight =
    previewPageHeight > 0
      ? previewPageCount * previewPageHeight + PREVIEW_PAGE_GAP * Math.max(0, previewPageCount - 1)
      : 0;
  const mainScreenGridCountOptions = React.useMemo(
    () =>
      (settings.mainScreenWordPopEnabled ? [3, 6] : [3, 6, 9]) as MainScreenAlbumGridCount[],
    [settings.mainScreenWordPopEnabled]
  );

  const getPreviewSlotPosition = React.useCallback(
    (index: number) => {
      const pageIndex = Math.floor(index / settings.mainScreenAlbumGridCount);
      const indexInPage = index % settings.mainScreenAlbumGridCount;
      const row = Math.floor(indexInPage / PREVIEW_GRID_COLUMNS);
      const col = indexInPage % PREVIEW_GRID_COLUMNS;
      return {
        x: col * (previewCellWidth + PREVIEW_GRID_GAP),
        y: pageIndex * (previewPageHeight + PREVIEW_PAGE_GAP) + row * (previewCellHeight + PREVIEW_GRID_GAP),
      };
    },
    [previewCellHeight, previewCellWidth, previewPageHeight, settings.mainScreenAlbumGridCount]
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
      if (previewCellWidth <= 0 || previewCellHeight <= 0 || previewPageHeight <= 0) return null;
      const centerX = dragBasePositionRef.current.x + gestureDx + previewCellWidth / 2;
      const centerY = dragBasePositionRef.current.y + gestureDy + previewCellHeight / 2;
      const pageBand = previewPageHeight + PREVIEW_PAGE_GAP;
      const pageIndex = Math.max(0, Math.min(previewPageCount - 1, Math.floor(centerY / Math.max(1, pageBand))));
      const yInPage = centerY - pageIndex * pageBand;
      const row = Math.max(
        0,
        Math.min(previewRowsPerPage - 1, Math.floor(yInPage / Math.max(1, previewCellHeight + PREVIEW_GRID_GAP)))
      );
      const col = Math.max(
        0,
        Math.min(PREVIEW_GRID_COLUMNS - 1, Math.floor(centerX / Math.max(1, previewCellWidth + PREVIEW_GRID_GAP)))
      );
      return Math.max(
        0,
        Math.min(previewSlots.length - 1, pageIndex * settings.mainScreenAlbumGridCount + row * PREVIEW_GRID_COLUMNS + col)
      );
    },
    [
      previewCellHeight,
      previewCellWidth,
      previewPageCount,
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
        previewPositionValuesRef.current[slot] = new Animated.ValueXY(nextPosition);
        previewPositionTargetsRef.current[slot] = nextPosition;
        return;
      }
      if (draggingAlbumId === slot) return;
      const currentTarget = previewPositionTargetsRef.current[slot];
      const alreadyAtTarget =
        currentTarget && currentTarget.x === nextPosition.x && currentTarget.y === nextPosition.y;
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
  }, [draggingAlbumId, getPreviewSlotPosition, previewCellHeight, previewCellWidth, previewEditMode, previewSlots]);

  const endPreviewAlbumDrag = React.useCallback(
    (shouldPersist: boolean) => {
      const albumId = activeDragAlbumIdRef.current;
      if (albumId) {
        const releaseTargetIndex = draftAlbumSlotsRef.current.indexOf(albumId);
        if (releaseTargetIndex >= 0 && previewPositionValuesRef.current[albumId]) {
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
          const targetIndex = getPreviewTargetIndexFromGesture(gestureState.dx, gestureState.dy);
          if (targetIndex == null) return;
          if (lastPreviewTargetIndexRef.current === targetIndex) return;
          lastPreviewTargetIndexRef.current = targetIndex;
          void Haptics.selectionAsync();
          moveDraftAlbumToPreviewIndex(albumId, targetIndex);
        },
        onPanResponderRelease: (_, gestureState) => {
          endPreviewAlbumDrag(Math.abs(gestureState.dx) >= 2 || Math.abs(gestureState.dy) >= 2);
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
    const featureItems = ['AI card generation', 'Premium voice cache', 'Pronunciation scoring'];
    const planItems: Array<{
      key: MembershipBillingPlan;
      title: string;
      price: string;
      perDay: string;
    }> = [
      { key: 'weekly', title: 'Weekly', price: '$4.99', perDay: '$0.71/day' },
      { key: 'monthly', title: 'Monthly', price: membershipPriceLabel || '$9.99', perDay: '$0.33/day' },
      { key: 'yearly', title: 'Yearly', price: '$39.99', perDay: '$0.11/day' },
    ];

    return (
      <View style={[styles.root, { backgroundColor: MEMBERSHIP_SCREEN_BG }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="chevron-back" size={20} color={MEMBERSHIP_HEADER_TEXT} />
              <Text style={[styles.backText, { color: MEMBERSHIP_HEADER_TEXT }]}>Back</Text>
            </Pressable>
            <Text style={[styles.title, { color: MEMBERSHIP_HEADER_TEXT }]}>Membership</Text>
            <Pressable
              style={({ pressed }) => [styles.membershipRestoreButton, pressed ? styles.pressed : null]}
              onPress={() => void handleRestoreMembership()}
              disabled={savingMembership}
            >
              <Text style={[styles.membershipRestoreText, { color: MEMBERSHIP_HEADER_TEXT }]}>Restore</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={[
              styles.membershipScrollContent,
              { paddingBottom: Math.max(insets.bottom + 64, 84) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.membershipPremiumStage, { minHeight: membershipStageMinHeight }]}>
              <Image source={MEMBERSHIP_APP_ICON} style={styles.membershipHeroIcon} resizeMode="contain" />
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
                    <Text style={styles.membershipProChipText}>PRO</Text>
                  </View>
                </View>
              </View>

              <View style={styles.membershipFeatureList}>
                {featureItems.map((item) => (
                  <View key={item} style={styles.membershipFeatureRow}>
                    <Ionicons name="checkmark" size={22} color={MODAL_CTA_COLOR} />
                    <Text style={styles.membershipFeatureText}>{item}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.membershipPlanGrid}>
                {planItems.map((plan) => {
                  const selected = membershipPlan === plan.key;
                  return (
                    <MembershipPlanOption
                      key={plan.key}
                      title={plan.title}
                      price={plan.price}
                      perDay={plan.perDay}
                      selected={selected}
                      onPress={() => setMembershipPlan(plan.key)}
                    />
                  );
                })}
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.membershipSubscribeButton,
                  pressed || savingMembership ? styles.pressed : null,
                ]}
                onPress={() => void handlePurchaseMembership()}
                disabled={savingMembership}
              >
                <Text style={styles.membershipSubscribeText}>
                  {savingMembership
                    ? 'Updating...'
                    : membershipStatus === 'premium'
                      ? 'Premium active'
                      : 'Subscribe'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={TEXT_ON_CTA} />
              </Pressable>

            </View>
          </ScrollView>

          <PaywallFooter
            style={[
              styles.membershipFooterLinks,
              { bottom: Math.max(insets.bottom, 12) },
            ]}
          />
        </SafeAreaView>
      </View>
    );
  }

  if (kind === 'main') {
    return (
      <View style={[styles.root, { backgroundColor: palette.screenBg }]}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="chevron-back" size={20} color={palette.textOnBg} />
              <Text style={[styles.backText, { color: palette.textOnBg }]}>Back</Text>
            </Pressable>
            <Text style={[styles.title, { color: palette.textOnBg }]}>Main screen</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={styles.mainScrollContent}
            scrollEnabled={!draggingAlbumId}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.mainPreviewCard,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                },
              ]}
            >
              <View style={styles.mainSectionHeader}>
                <Text style={[styles.mainInstructionText, { color: palette.textOnContainer }]}>
                  Hold an album, then drag it to change places or move it to another page.
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
                    <Text style={styles.previewDoneText}>Done</Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.mainSectionMeta, { color: palette.secondaryText }]}>
                    {settings.mainScreenAlbumGridCount} per page
                  </Text>
                )}
              </View>
              <Animated.View
                style={[styles.previewGrid, previewCanvasHeight > 0 ? { height: previewCanvasHeight } : null]}
                onLayout={(event) => {
                  const width = Math.round(event.nativeEvent.layout.width);
                  setPreviewGridWidth((prev) => (prev === width ? prev : width));
                }}
                {...previewGridPanResponder.panHandlers}
              >
                {Array.from({ length: previewPageCount }).map((_, pageIndex) => (
                      <View
                        key={`preview-page-bg-${pageIndex}`}
                        pointerEvents="none"
                        style={[
                          styles.previewPageBackground,
                          {
                            top: pageIndex * (previewPageHeight + PREVIEW_PAGE_GAP),
                            height: previewPageHeight,
                            borderColor: isLight ? 'rgba(148,163,184,0.2)' : 'rgba(78,175,244,0.14)',
                          },
                        ]}
                      />
                    ))}

                {previewSlots.map((slot, index) => {
                  const slotPosition = getPreviewSlotPosition(index);
                  if (isMainScreenEmptyAlbumSlot(slot)) {
                    if (!previewPositionValuesRef.current[slot]) {
                      previewPositionValuesRef.current[slot] = new Animated.ValueXY(slotPosition);
                    }
                    return (
                      <Animated.View
                        key={`preview-filler-${slot}`}
                        style={[
                          styles.previewAlbumCell,
                          styles.previewAbsoluteCell,
                          previewCellWidth > 0 ? { width: previewCellWidth } : null,
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
                                borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                              },
                            ]}
                          >
                            <View style={[styles.previewFillerLine, styles.previewFillerLineOne]} />
                            <View style={[styles.previewFillerLine, styles.previewFillerLineTwo]} />
                            <View style={[styles.previewFillerLine, styles.previewFillerLineThree]} />
                            <View style={styles.previewFillerPlusCircle}>
                              <Text style={styles.previewFillerPlusText}>+</Text>
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
                    previewPositionValuesRef.current[album.id] = new Animated.ValueXY(slotPosition);
                  }
                  const isDragging = draggingAlbumId === album.id;
                  const wiggleRotate = previewWiggleValue.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: index % 2 === 0 ? ['-1.4deg', '0deg', '1.4deg'] : ['1.2deg', '0deg', '-1.2deg'],
                  });
                  const wiggleTranslateY = previewWiggleValue.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: index % 2 === 0 ? [-0.8, 0, 0.8] : [0.8, 0, -0.8],
                  });
                  return (
                    <Animated.View
                      key={`preview-${album.id}`}
                      style={[
                        styles.previewAlbumCell,
                        styles.previewAbsoluteCell,
                        previewCellWidth > 0 ? { width: previewCellWidth } : null,
                        previewPositionValuesRef.current[album.id].getLayout(),
                        isDragging
                          ? {
                              opacity: 0,
                            }
                          : previewEditMode
                            ? {
                                transform: [{ translateY: wiggleTranslateY }, { rotate: wiggleRotate }],
                              }
                          : null,
                      ]}
                    >
                      <Pressable
                        onPressIn={() => {
                          pendingDragAlbumRef.current = { albumId: album.id, index };
                        }}
                        onPressOut={() => {
                          if (activeDragAlbumIdRef.current === album.id && !previewPanActiveRef.current) {
                            endPreviewAlbumDrag(false);
                            return;
                          }
                          if (!activeDragAlbumIdRef.current && !previewPanActiveRef.current) {
                            pendingDragAlbumRef.current = null;
                          }
                        }}
                        onLongPress={() => {
                          pendingDragAlbumRef.current = { albumId: album.id, index };
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
                                backgroundColor: isLight ? 'rgba(148,163,184,0.78)' : 'rgba(71,85,105,0.86)',
                              },
                              pressed ? styles.previewDeleteButtonPressed : null,
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
                              backgroundColor: album.coverImageUri ? palette.modalOptionBg : album.color || palette.modalOptionBg,
                              borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                            },
                          ]}
                        >
                          {album.coverImageUri ? (
                            <Image source={{ uri: album.coverImageUri }} style={styles.previewAlbumImage} resizeMode="cover" />
                          ) : (
                            <Text style={styles.previewAlbumEmoji}>{album.emoji || '📁'}</Text>
                          )}
                        </View>
                        <Text style={[styles.previewAlbumName, { color: palette.textOnContainer }]} numberOfLines={1}>
                          {album.name}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
                {draggingAlbumId && mainScreenAlbumById.get(draggingAlbumId) && previewCellWidth > 0 ? (() => {
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
                                backgroundColor: album.coverImageUri ? palette.modalOptionBg : album.color || palette.modalOptionBg,
                                borderColor: MODAL_CTA_COLOR,
                              },
                            ]}
                          >
                            {album.coverImageUri ? (
                              <Image source={{ uri: album.coverImageUri }} style={styles.previewAlbumImage} resizeMode="cover" />
                            ) : (
                              <Text style={styles.previewAlbumEmoji}>{album.emoji || '📁'}</Text>
                            )}
                          </View>
                          <Text style={[styles.previewAlbumName, { color: palette.textOnContainer }]} numberOfLines={1}>
                            {album.name}
                          </Text>
                        </Animated.View>
                      );
                    })() : null}
              </Animated.View>
            </View>
            <View
              style={[
                styles.card,
                styles.mainSettingsCard,
                {
                  backgroundColor: palette.containerBg,
                  borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                  shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
                  shadowOpacity: isLight ? 0.08 : 0.18,
                },
              ]}
            >
              <View style={styles.mainBlock}>
                <Text style={[styles.mainSectionTitle, { color: palette.textOnContainer }]}>Albums per page</Text>
                <View style={styles.segmentRow}>
                  {mainScreenGridCountOptions.map((count) => {
                    const active = settings.mainScreenAlbumGridCount === count;
                    return (
                      <Pressable
                        key={`main-count-${count}`}
                        style={({ pressed }) => [
                          styles.segmentButton,
                          {
                            backgroundColor: active ? '#4EAFF4' : palette.modalOptionBg,
                            borderColor: active ? '#4EAFF4' : isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
                          },
                          pressed ? styles.pressed : null,
                        ]}
                        onPress={() => void handleSelectMainScreenAlbumGridCount(count)}
                      >
                        <Text style={[styles.segmentText, { color: active ? '#FFFFFF' : palette.textOnContainer }]}>
                          {count}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: isLight ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.32)' }]} />

              <View style={styles.wordPopRow}>
                <View>
                  <Text style={[styles.settingLabel, { color: palette.textOnContainer }]}>Word pop</Text>
                  <Text style={[styles.mainSectionMeta, { color: palette.secondaryText }]}>Show section on main screen</Text>
                </View>
                <Switch
                  value={settings.mainScreenWordPopEnabled}
                  onValueChange={() => void handleToggleWordPop()}
                  trackColor={{ false: palette.modalOptionBg, true: MODAL_CTA_COLOR }}
                  thumbColor={TEXT_ON_CTA}
                  ios_backgroundColor={palette.modalOptionBg}
                />
              </View>
            </View>

          </ScrollView>
        </SafeAreaView>
        <CreateAlbumModalUI
          visible={createAlbumModalVisible}
          albumName={newAlbumName}
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
            style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={20} color={palette.textOnBg} />
            <Text style={[styles.backText, { color: palette.textOnBg }]}>Back</Text>
          </Pressable>
          <Text style={[styles.title, { color: palette.textOnBg }]}>{getTitle(kind)}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.containerBg,
              borderColor: isLight ? palette.borderSubtle : CONTAINER_NEON_OUTLINE,
              shadowColor: isLight ? '#000000' : CONTAINER_NEON_GLOW,
              shadowOpacity: isLight ? 0.08 : 0.18,
            },
          ]}
        >
          {rows.map((row, index) => (
            <React.Fragment key={row.key}>
              <TouchableOpacity style={styles.row} activeOpacity={0.9} onPress={row.onPress}>
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
                    { backgroundColor: isLight ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.32)' },
                  ]}
                />
              ) : null}
            </React.Fragment>
          ))}
        </View>
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
    paddingBottom: 42,
  },
  membershipHeroIcon: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    width: 330,
    height: 330,
    opacity: 0.9,
  },
  membershipHeroMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -28,
    height: 620,
  },
  membershipHeadlineBlock: {
    alignItems: 'center',
    marginBottom: 18,
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
  membershipFeatureList: {
    gap: 18,
    paddingHorizontal: 18,
    marginBottom: 28,
  },
  membershipFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  membershipFeatureText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  membershipPlanGrid: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
  },
  membershipPlanPressable: {
    flex: 1,
  },
  membershipPlanCard: {
    flex: 1,
    minHeight: 124,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  membershipPlanTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  membershipPlanPrice: {
    marginTop: 9,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
  },
  membershipPlanMeta: {
    marginTop: 'auto',
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  membershipSubscribeButton: {
    marginTop: 24,
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
  membershipFooterLinks: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
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
});
