import React from 'react';
import { Alert } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { InteractionManager } from 'react-native';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import type Profile from '@database/models/Profile';
import ImageCropperModal from '../../../components/ImageCropperModal';
import ProfileMainScreenUI, {
  type HeatMapDay,
  type HeatMapMonth,
} from '../../../components/UI/ProfileScreenUI/ProfileMainScreenUI';
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  resolveTTSVoiceForLanguage,
  saveUserSettings,
  type AIReplyLanguage,
  type EntitlementMode,
  type MainScreenAlbumGridCount,
  type TTSVoice,
  type WordPopSlideMs,
  withUpdatedTTSVoiceForLanguage,
} from '@services/settings/userSettings';
import { supabase } from '@services/supabase/client';
import {
  getRevenueCatOfferingSummary,
  isRevenueCatConfigured,
  type RevenueCatPackageSummary,
} from '@services/subscription/revenueCat';
import SubscriptionService from '@services/subscription/SubscriptionService';
import { DEFAULT_STICKER_FONT_KEY, type StickerFontKey } from '../../../theme/stickerFonts';
import { resolveCardImageUri } from '@services/media/cardImage';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import { deleteCurrentAccount } from '@services/account/AccountDeletionService';

type Props = {
  navigation: any;
  overlayMode?: boolean;
  onRequestClose?: () => void;
};

function getDateKey(input: Date | string): string {
  let date: Date;
  if (typeof input === 'string') {
    const dateOnly = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const [, y, m, d] = dateOnly;
      date = new Date(Number(y), Number(m) - 1, Number(d));
    } else {
      date = new Date(input);
    }
  } else {
    date = new Date(input);
  }

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  // Use local calendar day so heatmap "today" aligns with local device date.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildMonthDays(
  monthDate: Date,
  cardsByDate: Map<string, Card[]>,
  cardImageMap: Record<string, string | undefined>
): HeatMapDay[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const days: HeatMapDay[] = [];
  for (let day = 1; day <= lastDate; day += 1) {
    const date = new Date(year, month, day);
    const key = getDateKey(date);
    const cardsOnDay = cardsByDate.get(key) || [];
    const primaryCard = cardsOnDay[0];

    days.push({
      key,
      date,
      dayNumber: String(day),
      cards: cardsOnDay,
      card: primaryCard,
      imageUri: primaryCard ? cardImageMap[primaryCard.id] : undefined,
    });
  }

  return days;
}

function buildCardsByDate(cards: Card[]): Map<string, Card[]> {
  const cardsByDate = new Map<string, Card[]>();
  cards.forEach((card) => {
    const key = getDateKey(card.createdAt);
    const existing = cardsByDate.get(key) || [];
    existing.push(card);
    cardsByDate.set(key, existing);
  });

  return cardsByDate;
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
}

function formatSinceDate(date: Date): string {
  return `since ${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatHeatmapDayTitle(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function shiftMonth(base: Date, offset: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + offset, 1);
}

function getMonthDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function buildHeatMapMonthOffsets(
  cards: Card[],
  currentDate: Date,
  profile: Profile | null
): number[] {
  const currentMonth = getMonthStart(currentDate);
  const earliestSourceDate = getSinceSourceDate(profile, cards);
  const earliestMonth = getMonthStart(earliestSourceDate);
  const diff = Math.max(0, getMonthDiff(earliestMonth, currentMonth));

  // 需求：
  // 1) 往前可滑到「當前月份 + 6 個月」
  // 2) 往後可滑到「使用者最初使用月份 - 6 個月」
  const minOffset = -diff - 6;
  const maxOffset = 6;
  const length = maxOffset - minOffset + 1;

  return Array.from({ length }, (_, index) => minOffset + index);
}

function buildHeatMapMonths(
  cards: Card[],
  cardImageMap: Record<string, string | undefined>,
  currentDate: Date,
  profile: Profile | null
): HeatMapMonth[] {
  const cardsByDate = buildCardsByDate(cards);
  const currentMonth = getMonthStart(currentDate);
  const monthOffsets = buildHeatMapMonthOffsets(cards, currentDate, profile);

  return monthOffsets.map((offset) => {
    const monthDate = shiftMonth(currentMonth, offset);
    return {
      key: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`,
      monthDate,
      monthLabel: formatMonthLabel(monthDate),
      days: buildMonthDays(monthDate, cardsByDate, cardImageMap),
    };
  });
}

function collectHeatMapPrimaryCardIds(
  cards: Card[],
  currentDate: Date,
  profile: Profile | null
): string[] {
  const cardsByDate = buildCardsByDate(cards);
  const currentMonth = getMonthStart(currentDate);
  const monthOffsets = buildHeatMapMonthOffsets(cards, currentDate, profile);
  const required = new Set<string>();

  monthOffsets.forEach((offset) => {
    const monthDate = shiftMonth(currentMonth, offset);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const lastDate = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= lastDate; day += 1) {
      const key = getDateKey(new Date(year, month, day));
      const primaryCard = cardsByDate.get(key)?.[0];
      if (primaryCard?.id) required.add(primaryCard.id);
    }
  });

  return [...required];
}

function findCurrentMonthIndex(months: HeatMapMonth[], currentDate: Date): number {
  if (months.length <= 1) return 0;
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const index = months.findIndex(
    (item) => item.monthDate.getFullYear() === year && item.monthDate.getMonth() === month
  );
  return index >= 0 ? index : 0;
}

function getProfileTitle(profile: Profile | null): string {
  const displayName = profile?.displayName?.trim();
  if (displayName) return displayName;

  const email = profile?.email?.trim();
  if (email) return email.split('@')[0] || email;

  return 'Profile';
}

function getSinceSourceDate(profile: Profile | null, cards: Card[]): Date {
  if (profile?.createdAt) return new Date(profile.createdAt);
  if (cards.length > 0) {
    return new Date(cards[cards.length - 1].createdAt);
  }
  return new Date();
}

export default function ProfileMainFlow({ navigation, overlayMode = false, onRequestClose }: Props) {
  const tabSwipeContext = React.useContext(TabSwipeContext);

  React.useEffect(() => {
    return () => {
      tabSwipeContext?.setTabBarHidden?.(false);
    };
  }, [tabSwipeContext]);
  const [cards, setCards] = React.useState<Card[]>([]);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [cardImageMap, setCardImageMap] = React.useState<Record<string, string | undefined>>({});
  const [currentDate, setCurrentDate] = React.useState(() => new Date());
  const [entitlementMode, setEntitlementMode] = React.useState<EntitlementMode>('free');
  const [aiReplyLanguage, setAiReplyLanguage] = React.useState<AIReplyLanguage>(
    DEFAULT_USER_SETTINGS.aiReplyLanguage
  );
  const [ttsVoice, setTtsVoice] = React.useState<TTSVoice>(DEFAULT_USER_SETTINGS.ttsVoice);
  const [wordPopSlideMs, setWordPopSlideMs] = React.useState<WordPopSlideMs>(DEFAULT_USER_SETTINGS.wordPopSlideMs);
  const [stickerFontKey, setStickerFontKey] = React.useState<StickerFontKey>(DEFAULT_STICKER_FONT_KEY);
  const [mainScreenAlbumGridCount, setMainScreenAlbumGridCount] =
    React.useState<MainScreenAlbumGridCount>(DEFAULT_USER_SETTINGS.mainScreenAlbumGridCount);
  const [mainScreenWordPopEnabled, setMainScreenWordPopEnabled] = React.useState(
    DEFAULT_USER_SETTINGS.mainScreenWordPopEnabled
  );
  const [savingEntitlement, setSavingEntitlement] = React.useState(false);
  const [showMembershipModal, setShowMembershipModal] = React.useState(false);
  const [membershipPriceLabel, setMembershipPriceLabel] = React.useState<string | null>(null);
  const [membershipPackages, setMembershipPackages] = React.useState<RevenueCatPackageSummary[]>([]);
  const [isDeletingAccount, setIsDeletingAccount] = React.useState(false);
  const [selectedProfilePhotoUri, setSelectedProfilePhotoUri] = React.useState<string | null>(null);
  const [pendingProfilePhotoUri, setPendingProfilePhotoUri] = React.useState<string | null>(null);
  const [pendingProfilePhotoSize, setPendingProfilePhotoSize] = React.useState<{
    width: number;
    height: number;
  } | null>(null);
  const heatMapPrimaryCardIds = React.useMemo(
    () => collectHeatMapPrimaryCardIds(cards, currentDate, profile),
    [cards, currentDate, profile]
  );

  React.useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1
    );
    const timeout = setTimeout(() => {
      setCurrentDate(new Date());
    }, Math.max(1000, nextMidnight.getTime() - now.getTime()));

    return () => clearTimeout(timeout);
  }, [currentDate]);

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

  React.useEffect(() => {
    const queryProfiles = database.get<Profile>('profiles').query(Q.sortBy('created_at', Q.asc));

    const load = async () => {
      try {
        const data = await queryProfiles.fetch();
        setProfile(data[0] ?? null);
      } catch (error) {
        console.error('[Profiles] load profile failed:', error);
        setProfile(null);
      }
    };

    void load();
    const sub = queryProfiles.observe().subscribe((data) => setProfile(data[0] ?? null));
    return () => sub.unsubscribe();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        const idSet = new Set(heatMapPrimaryCardIds);
        const targets = cards.filter((card) => idSet.has(card.id));
        const nextMap: Record<string, string | undefined> = {};
        await Promise.all(
          targets.map(async (card) => {
            const uri = await resolveCardImageUri({
              cardId: card.id,
              remoteUri: card.imageUrl,
            });
            nextMap[card.id] = uri || undefined;
          })
        );
        if (!cancelled) {
          setCardImageMap(nextMap);
        }
      })();
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [cards, heatMapPrimaryCardIds]);

  const refreshAppSettings = React.useCallback(async () => {
    try {
      const settings = await loadUserSettings();
      setEntitlementMode(settings.planType);
      setAiReplyLanguage(settings.aiReplyLanguage);
      setTtsVoice(resolveTTSVoiceForLanguage(settings, settings.aiReplyLanguage));
      setWordPopSlideMs(settings.wordPopSlideMs);
      setStickerFontKey(settings.stickerFontKey);
      setMainScreenAlbumGridCount(settings.mainScreenAlbumGridCount);
      setMainScreenWordPopEnabled(settings.mainScreenWordPopEnabled);
    } catch (error) {
      console.error('[Profiles] load app settings failed:', error);
    }
  }, []);

  React.useEffect(() => {
    void refreshAppSettings();
  }, [refreshAppSettings]);

  useFocusEffect(
    React.useCallback(() => {
      void refreshAppSettings();
    }, [refreshAppSettings])
  );

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isRevenueCatConfigured()) {
        if (!cancelled) setMembershipPriceLabel(null);
        if (!cancelled) setMembershipPackages([]);
        return;
      }
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const summary = await getRevenueCatOfferingSummary(user?.id ?? null);
        if (!cancelled) {
          setMembershipPriceLabel(summary.priceLabel);
          setMembershipPackages(summary.packages);
        }
      } catch (error) {
        console.error('[Profiles] load RevenueCat offering summary failed:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpgradeMembership = React.useCallback(async (packageIdentifier?: string | null) => {
    if (savingEntitlement) return;
    setSavingEntitlement(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        Alert.alert('尚未登入', '請先登入，再升級到 Premium。');
        return;
      }
      const snapshot = await SubscriptionService.purchasePremium(user.id, packageIdentifier);
      setEntitlementMode(snapshot.planType);
      setShowMembershipModal(false);
      Alert.alert('升級成功', 'Premium 已解鎖 AI、雲端語音與發音評分。');
    } catch (error) {
      console.error('[Profiles] purchase premium failed:', error);
      Alert.alert('升級失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setSavingEntitlement(false);
    }
  }, [savingEntitlement]);

  const handleRestoreMembership = React.useCallback(async () => {
    if (savingEntitlement) return;
    setSavingEntitlement(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        Alert.alert('尚未登入', '請先登入，再恢復購買。');
        return;
      }
      const snapshot = await SubscriptionService.restorePurchases(user.id);
      setEntitlementMode(snapshot.planType);
      setShowMembershipModal(false);
      Alert.alert(
        '恢復完成',
        snapshot.planType === 'premium' ? '已恢復 Premium 購買。' : '目前沒有可恢復的有效 Premium 訂閱。'
      );
    } catch (error) {
      console.error('[Profiles] restore purchases failed:', error);
      Alert.alert('恢復失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setSavingEntitlement(false);
    }
  }, [savingEntitlement]);

  const handleDevSetMembership = React.useCallback(async (mode: 'free' | 'trial' | 'premium') => {
    if (!__DEV__ || !SubscriptionService.isDevBypassEnabled()) return;
    try {
      const settings = await loadUserSettings();
      const now = new Date();
      const trialStartedAt = mode === 'trial' ? now.toISOString() : settings.trialStartedAt;
      const trialEndsAt =
        mode === 'trial'
          ? new Date(now.getTime() + SubscriptionService.TRIAL_DURATION_MS).toISOString()
          : settings.trialEndsAt;
      await saveUserSettings({
        ...settings,
        entitlementMode: mode,
        planType: mode,
        trialStartedAt,
        trialEndsAt,
        subscriptionExpiresAt:
          mode === 'premium'
            ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
            : null,
        lastEntitlementSyncAt: now.toISOString(),
      });
      setEntitlementMode(mode);
      Alert.alert('Dev override updated', `Current plan is now ${mode}.`);
    } catch (error) {
      console.error('[Profiles] dev entitlement override failed:', error);
      Alert.alert('Dev override failed', error instanceof Error ? error.message : 'Please try again.');
    }
  }, []);

  const performAccountDeletion = React.useCallback(async () => {
    if (isDeletingAccount) return;
    setIsDeletingAccount(true);
    try {
      await deleteCurrentAccount();
    } catch (error) {
      console.error('[Profiles] delete account failed:', error);
      Alert.alert('Failed to delete account. Please try again or contact support.');
      setIsDeletingAccount(false);
    }
  }, [isDeletingAccount]);

  const handleDeleteAccount = React.useCallback(() => {
    if (isDeletingAccount) return;
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? All your vocabulary cards, settings, and personal data will be erased. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void performAccountDeletion(),
        },
      ]
    );
  }, [isDeletingAccount, performAccountDeletion]);

  const handleChangeAIReplyLanguage = React.useCallback(async (language: AIReplyLanguage) => {
    try {
      const settings = await loadUserSettings();
      const currentVoice = resolveTTSVoiceForLanguage(settings, settings.aiReplyLanguage);
      const nextVoice = resolveTTSVoiceForLanguage(settings, language);
      if (settings.aiReplyLanguage === language && currentVoice === nextVoice) return;
      await saveUserSettings(withUpdatedTTSVoiceForLanguage(settings, language, nextVoice));
      setAiReplyLanguage(language);
      setTtsVoice(nextVoice);
    } catch (error) {
      console.error('[Profiles] update AI reply language failed:', error);
      Alert.alert('更新失敗', '無法儲存 AI 回覆語言，請稍後再試。');
    }
  }, []);

  const handleChangeTTSVoice = React.useCallback(async (voice: TTSVoice) => {
    try {
      const settings = await loadUserSettings();
      const currentVoice = resolveTTSVoiceForLanguage(settings, settings.aiReplyLanguage);
      if (currentVoice === voice) return;
      await saveUserSettings(withUpdatedTTSVoiceForLanguage(settings, settings.aiReplyLanguage, voice));
      setTtsVoice(voice);
    } catch (error) {
      console.error('[Profiles] update TTS voice failed:', error);
      Alert.alert('更新失敗', '無法儲存語音設定，請稍後再試。');
    }
  }, []);

  const handleChangeWordPopSlideMs = React.useCallback(async (value: WordPopSlideMs) => {
    try {
      const settings = await loadUserSettings();
      if (settings.wordPopSlideMs === value) return;
      await saveUserSettings({
        ...settings,
        wordPopSlideMs: value,
      });
      setWordPopSlideMs(value);
    } catch (error) {
      console.error('[Profiles] update word pop slide interval failed:', error);
      Alert.alert('更新失敗', '無法儲存 Word Pop 輪播速度，請稍後再試。');
    }
  }, []);

  const handleChangeStickerFontKey = React.useCallback(async (fontKey: StickerFontKey) => {
    try {
      const settings = await loadUserSettings();
      if (settings.stickerFontKey === fontKey) return;
      await saveUserSettings({
        ...settings,
        stickerFontKey: fontKey,
      });
      setStickerFontKey(fontKey);
    } catch (error) {
      console.error('[Profiles] update sticker font failed:', error);
      Alert.alert('更新失敗', '無法儲存貼紙字體，請稍後再試。');
    }
  }, []);

  const handleChangeProfilePhoto = React.useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要相簿權限', '請先允許存取相簿，才能上傳頭像。');
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 220));

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      setPendingProfilePhotoUri(asset.uri);
      setPendingProfilePhotoSize(
        asset.width && asset.height
          ? {
              width: asset.width,
              height: asset.height,
            }
          : null
      );
    } catch (error) {
      console.error('[Profiles] change profile pic failed:', error);
      Alert.alert('上傳頭像失敗', '請稍後再試。');
    }
  }, []);

  const heatMapMonths = React.useMemo(
    () => buildHeatMapMonths(cards, cardImageMap, currentDate, profile),
    [cardImageMap, cards, currentDate, profile]
  );
  const initialMonthIndex = React.useMemo(
    () => findCurrentMonthIndex(heatMapMonths, currentDate),
    [currentDate, heatMapMonths]
  );

  const subtitle = React.useMemo(
    () => formatSinceDate(getSinceSourceDate(profile, cards)),
    [cards, profile]
  );
  const title = React.useMemo(() => getProfileTitle(profile), [profile]);

  return (
    <>
      <ProfileMainScreenUI
        overlayMode={overlayMode}
        title={title}
        subtitle={subtitle}
        profileImageUri={selectedProfilePhotoUri}
        todayDateKey={getDateKey(currentDate)}
        heatMapMonths={heatMapMonths}
        initialMonthIndex={initialMonthIndex}
        savingEntitlement={savingEntitlement}
        entitlementMode={entitlementMode}
        membershipPriceLabel={membershipPriceLabel}
        membershipPackages={membershipPackages.map((item) => ({
          identifier: item.identifier,
          title: item.title || item.packageType || 'Premium',
          priceLabel: item.priceLabel || membershipPriceLabel || 'Premium',
          description: item.subscriptionPeriod || item.description || 'Auto-renews unless canceled',
        }))}
        membershipModalVisible={showMembershipModal}
        mainScreenAlbumGridCount={mainScreenAlbumGridCount}
        mainScreenWordPopEnabled={mainScreenWordPopEnabled}
        isDeletingAccount={isDeletingAccount}
        aiReplyLanguage={aiReplyLanguage}
        ttsVoice={ttsVoice}
        stickerFontKey={stickerFontKey}
        onPressUploadProfilePic={handleChangeProfilePhoto}
        onOpenMembershipModal={() => navigation.navigate('ProfileSettingOptions', { kind: 'membership' })}
        onCloseMembershipModal={() => setShowMembershipModal(false)}
        onUpgradeMembership={handleUpgradeMembership}
        onRestoreMembership={handleRestoreMembership}
        devBypassEnabled={SubscriptionService.isDevBypassEnabled()}
        onDevSetMembership={handleDevSetMembership}
        onChangeAIReplyLanguage={handleChangeAIReplyLanguage}
        onChangeTTSVoice={handleChangeTTSVoice}
        onDeleteAccount={handleDeleteAccount}
        onOpenSettingsOption={(kind) => {
          navigation.navigate('ProfileSettingOptions', { kind });
        }}
        onPressBack={() => {
          if (overlayMode && onRequestClose) {
            onRequestClose();
            return;
          }
          if (navigation.canGoBack?.()) {
            navigation.goBack();
          }
        }}
        onPressMenu={() => Alert.alert('Profile', '更多選單功能之後可以接進來。')}
        onPressDay={(day) => {
          if (!day.cards.length) return;
          navigation.navigate('CardDetail', {
            cardId: day.cards[0]?.id,
            cardIds: day.cards.map((card) => card.id),
            headerTitle: formatHeatmapDayTitle(day.date),
          });
        }}
      />

      <ImageCropperModal
        visible={!!pendingProfilePhotoUri}
        imageUri={pendingProfilePhotoUri}
        initialImageSize={pendingProfilePhotoSize}
        cropShape="circle"
        fixedCropSize={300}
        onCancel={() => {
          setPendingProfilePhotoUri(null);
          setPendingProfilePhotoSize(null);
        }}
        onConfirm={(croppedUri) => {
          setSelectedProfilePhotoUri(croppedUri);
          setPendingProfilePhotoUri(null);
          setPendingProfilePhotoSize(null);
        }}
      />
    </>
  );
}
