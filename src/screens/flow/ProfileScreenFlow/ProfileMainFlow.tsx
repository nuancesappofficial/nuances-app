import React from 'react';
import { Alert } from 'react-native';
import { Q } from '@nozbe/watermelondb';
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
  saveUserSettings,
  type AIReplyLanguage,
  type AppThemeName,
  type EntitlementMode,
} from '@services/settings/userSettings';
import { resolveCardImageUri } from '@services/media/cardImage';

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

  // Use UTC calendar day to avoid timezone boundary drift between sources.
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
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
  const [cards, setCards] = React.useState<Card[]>([]);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [cardImageMap, setCardImageMap] = React.useState<Record<string, string | undefined>>({});
  const [currentDate, setCurrentDate] = React.useState(() => new Date());
  const [entitlementMode, setEntitlementMode] = React.useState<EntitlementMode>('guest');
  const [aiReplyLanguage, setAiReplyLanguage] = React.useState<AIReplyLanguage>(
    DEFAULT_USER_SETTINGS.aiReplyLanguage
  );
  const [appTheme, setAppTheme] = React.useState<AppThemeName>(DEFAULT_USER_SETTINGS.theme);
  const [savingEntitlement, setSavingEntitlement] = React.useState(false);
  const [selectedProfilePhotoUri, setSelectedProfilePhotoUri] = React.useState<string | null>(null);
  const [pendingProfilePhotoUri, setPendingProfilePhotoUri] = React.useState<string | null>(null);
  const [pendingProfilePhotoSize, setPendingProfilePhotoSize] = React.useState<{
    width: number;
    height: number;
  } | null>(null);
  const [settingsVisible, setSettingsVisible] = React.useState(false);
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
      setEntitlementMode(settings.entitlementMode);
      setAiReplyLanguage(settings.aiReplyLanguage);
      setAppTheme(settings.theme);
    } catch (error) {
      console.error('[Profiles] load app settings failed:', error);
    }
  }, []);

  React.useEffect(() => {
    void refreshAppSettings();
  }, [refreshAppSettings]);

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

  const handleChangeAIReplyLanguage = React.useCallback(async (language: AIReplyLanguage) => {
    try {
      const settings = await loadUserSettings();
      if (settings.aiReplyLanguage === language) return;
      await saveUserSettings({
        ...settings,
        aiReplyLanguage: language,
      });
      setAiReplyLanguage(language);
    } catch (error) {
      console.error('[Profiles] update AI reply language failed:', error);
      Alert.alert('更新失敗', '無法儲存 AI 回覆語言，請稍後再試。');
    }
  }, []);

  const handleChangeAppTheme = React.useCallback(async (theme: AppThemeName) => {
    try {
      const settings = await loadUserSettings();
      if (settings.theme === theme) return;
      await saveUserSettings({
        ...settings,
        theme,
      });
      setAppTheme(theme);
    } catch (error) {
      console.error('[Profiles] update app theme failed:', error);
      Alert.alert('更新失敗', '無法儲存主題設定，請稍後再試。');
    }
  }, []);

  const handleChangeProfilePhoto = React.useCallback(async () => {
    try {
      setSettingsVisible(false);
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
        aiReplyLanguage={aiReplyLanguage}
        appTheme={appTheme}
        settingsVisible={settingsVisible}
        onPressSettings={() => setSettingsVisible(true)}
        onCloseSettings={() => setSettingsVisible(false)}
        onPressUploadProfilePic={handleChangeProfilePhoto}
        onToggleEntitlement={handleToggleEntitlementMode}
        onChangeAIReplyLanguage={handleChangeAIReplyLanguage}
        onChangeTheme={handleChangeAppTheme}
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
