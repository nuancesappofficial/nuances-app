import React from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect } from '@react-navigation/native';
import { useSharedValue } from 'react-native-reanimated';
import { TabSwipeContext } from '../../../contexts/TabSwipeContext';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import { resolveCardImageUri } from '@services/media/cardImage';
import CreateAlbumModalUI from '../../../components/UI/DeckScreenUI/CreateAlbumModalUI';
import DeckMainScreenUI from '../../../components/UI/DeckScreenUI/DeckMainScreenUI';
import AlbumSettingsModalUI from '../../../components/UI/DeckScreenUI/AlbumSettingsModalUI';
import AlbumActionMenuOverlayUI from '../../../components/UI/DeckScreenUI/AlbumActionMenuOverlayUI';
import ReviewTuningModalUI from '../../../components/UI/DeckScreenUI/ReviewTuningModalUI';
import type { DeckAlbum } from '../../../components/UI/DeckScreenUI/deckTypes';
import {
  buildDeckAlbums,
  createCustomAlbum,
  loadDeckAlbumPreferences,
  saveDeckAlbumPreferences,
  type DeckAlbumPreferences,
} from '../../../features/deck/albums';
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  type AppThemeName,
} from '@services/settings/userSettings';
import { loadQuizReviewedCardIds } from '../../../features/deck/cardDetailSeen';
import {
  DEFAULT_ALBUM_REVIEW_PREFERENCES,
  loadAlbumReviewPreferences,
  saveAlbumReviewPreferences,
} from '../../../features/deck/reviewPreferences';

type Props = {
  navigation: any;
  onPressAvatar?: () => void;
  onPressCacheFab?: () => void;
};

export default function DeckMainFlow({ navigation, onPressAvatar, onPressCacheFab }: Props) {
  const tabSwipeContext = React.useContext(TabSwipeContext);
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [cardImageMap, setCardImageMap] = React.useState<Record<string, string>>({});
  const [imageReloadSeed, setImageReloadSeed] = React.useState(0);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sortOrder, setSortOrder] = React.useState<'desc' | 'asc'>('desc');
  const [isCreateModalVisible, setIsCreateModalVisible] = React.useState(false);
  const [newAlbumName, setNewAlbumName] = React.useState('');
  const [customAlbums, setCustomAlbums] = React.useState<DeckAlbum[]>([]);
  const [albumNameOverrides, setAlbumNameOverrides] = React.useState<Record<string, string>>({});
  const [albumEmojiOverrides, setAlbumEmojiOverrides] = React.useState<Record<string, string>>({});
  const [albumColorOverrides, setAlbumColorOverrides] = React.useState<Record<string, string>>({});
  const [albumCoverOverrides, setAlbumCoverOverrides] = React.useState<Record<string, string>>({});
  const [deletedAlbumIds, setDeletedAlbumIds] = React.useState<string[]>([]);
  const [isAlbumPrefsHydrated, setIsAlbumPrefsHydrated] = React.useState(false);
  const [settingsVisible, setSettingsVisible] = React.useState(false);
  const [settingsAlbum, setSettingsAlbum] = React.useState<DeckAlbum | null>(null);
  const [settingsName, setSettingsName] = React.useState('');
  const [settingsEmoji, setSettingsEmoji] = React.useState('📁');
  const [settingsColor, setSettingsColor] = React.useState('#4A67D8');
  const [settingsCoverImageUri, setSettingsCoverImageUri] = React.useState<string | undefined>(undefined);
  const [activeAlbum, setActiveAlbum] = React.useState<DeckAlbum | null>(null);
  const [activeLayout, setActiveLayout] = React.useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [quizReviewedCardIds, setQuizReviewedCardIds] = React.useState<Set<string>>(new Set());
  const [showTodayReviewTuningModal, setShowTodayReviewTuningModal] = React.useState(false);
  const [todayReviewQuestionCount, setTodayReviewQuestionCount] = React.useState(
    DEFAULT_ALBUM_REVIEW_PREFERENCES.questionCount
  );
  const [appTheme, setAppTheme] = React.useState<AppThemeName>(DEFAULT_USER_SETTINGS.theme);
  const isMenuVisible = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const hoveredAction = useSharedValue<'none' | 'sort' | 'edit' | 'delete'>('none');

  const filterPills = ['群組', '隱私', '已封存'];

  const toDayKey = React.useCallback((input: Date | string) => {
    const date = new Date(input);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const hydrateAlbumPrefs = React.useCallback(async () => {
    try {
      const prefs = await loadDeckAlbumPreferences();
      setCustomAlbums(prefs.customAlbums);
      setAlbumNameOverrides(prefs.albumNameOverrides);
      setAlbumEmojiOverrides(prefs.albumEmojiOverrides);
      setAlbumColorOverrides(prefs.albumColorOverrides);
      setAlbumCoverOverrides(prefs.albumCoverOverrides);
      setDeletedAlbumIds(prefs.deletedAlbumIds);
    } finally {
      setIsAlbumPrefsHydrated(true);
    }
  }, []);

  React.useEffect(() => {
    void hydrateAlbumPrefs();
  }, [hydrateAlbumPrefs]);

  useFocusEffect(
    React.useCallback(() => {
      void hydrateAlbumPrefs();
    }, [hydrateAlbumPrefs])
  );

  React.useEffect(() => {
    if (!isAlbumPrefsHydrated) return;
    const payload: DeckAlbumPreferences = {
      customAlbums,
      albumNameOverrides,
      albumEmojiOverrides,
      albumColorOverrides,
      albumCoverOverrides,
      deletedAlbumIds,
    };
    saveDeckAlbumPreferences(payload).catch((error) => {
      console.warn('[DeckMain] save album preferences failed:', error);
    });
  }, [
    isAlbumPrefsHydrated,
    customAlbums,
    albumNameOverrides,
    albumEmojiOverrides,
    albumColorOverrides,
    albumCoverOverrides,
    deletedAlbumIds,
  ]);

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

  useFocusEffect(
    React.useCallback(() => {
      setImageReloadSeed((prev) => prev + 1);
    }, [])
  );

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const hydrateTheme = async () => {
        try {
          const settings = await loadUserSettings();
          if (active) setAppTheme(settings.theme);
        } catch (error) {
          console.warn('[DeckMain] load theme failed:', error);
          if (active) setAppTheme(DEFAULT_USER_SETTINGS.theme);
        }
      };
      void hydrateTheme();
      return () => {
        active = false;
      };
    }, [])
  );

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const hydrateSeenCards = async () => {
        try {
          const nextReviewed = await loadQuizReviewedCardIds();
          if (active) setQuizReviewedCardIds(nextReviewed);
        } catch (error) {
          console.warn('[DeckMain] load quiz-reviewed cards failed:', error);
          if (active) setQuizReviewedCardIds(new Set());
        }
      };
      void hydrateSeenCards();
      return () => {
        active = false;
      };
    }, [])
  );

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const hydrateTodayReviewPreferences = async () => {
        try {
          const prefs = await loadAlbumReviewPreferences('today-added');
          if (active) setTodayReviewQuestionCount(prefs.questionCount);
        } catch (error) {
          console.warn('[DeckMain] load today review preferences failed:', error);
          if (active) setTodayReviewQuestionCount(DEFAULT_ALBUM_REVIEW_PREFERENCES.questionCount);
        }
      };
      void hydrateTodayReviewPreferences();
      return () => {
        active = false;
      };
    }, [])
  );

  React.useEffect(() => {
    const timer = setInterval(() => {
      setImageReloadSeed((prev) => prev + 1);
    }, 25 * 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadCardImages = async () => {
      const nextMap: Record<string, string> = {};
      await Promise.all(
        allCards.map(async (card) => {
          const uri = await resolveCardImageUri({
            cardId: card.id,
            remoteUri: card.imageUrl,
          });
          if (card.imageUrl && !uri) {
            console.warn('[DeckMain] card image resolve failed', {
              cardId: card.id,
              imageUrl: card.imageUrl,
            });
          }
          if (uri) {
            nextMap[card.id] = uri;
          }
        })
      );
      console.log('[DeckMain] card image map size:', {
        allCards: allCards.length,
        mapped: Object.keys(nextMap).length,
      });

      if (!cancelled) {
        setCardImageMap(nextMap);
      }
    };

    void loadCardImages();

    return () => {
      cancelled = true;
    };
  }, [allCards, imageReloadSeed]);

  const mergedAlbums = React.useMemo(
    () =>
      buildDeckAlbums(allCards, cardImageMap, {
        customAlbums,
        albumNameOverrides,
        albumEmojiOverrides,
        albumColorOverrides,
        albumCoverOverrides,
        deletedAlbumIds,
      }),
    [allCards, cardImageMap, customAlbums, albumNameOverrides, albumEmojiOverrides, albumColorOverrides, albumCoverOverrides, deletedAlbumIds]
  );

  const processedAlbums = React.useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    let result = [...mergedAlbums];

    if (keyword) {
      result = result.filter((album) => {
        const inName = album.name.toLowerCase().includes(keyword);
        const inCards = album.latestCards.some(
          (card) =>
            card.previewText?.toLowerCase().includes(keyword) ||
            card.cardTypeText.toLowerCase().includes(keyword)
        );
        return inName || inCards;
      });
    }

    result.sort((a, b) => {
      const aLatest = a.latestCards[0]?.createdAtMs ?? 0;
      const bLatest = b.latestCards[0]?.createdAtMs ?? 0;
      return sortOrder === 'desc' ? bLatest - aLatest : aLatest - bLatest;
    });

    return result;
  }, [mergedAlbums, searchQuery, sortOrder]);

  const slideshowItems = React.useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ cardId: string; text: string; imageUri?: string }> = [];

    allCards.forEach((card) => {
      const phrase = (card.targetPhrase || '').trim();
      const word = (card.targetWord || '').trim();
      const candidate = phrase || word;
      if (!candidate) return;
      const key = candidate.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push({
        cardId: card.id,
        text: candidate,
        imageUri: cardImageMap[card.id],
      });
    });

    return list;
  }, [allCards, cardImageMap]);

  const todayCardIds = React.useMemo(() => {
    const todayKey = toDayKey(new Date());
    return allCards
      .filter((card) => !!card.createdAt && toDayKey(card.createdAt) === todayKey)
      .map((card) => card.id);
  }, [allCards, toDayKey]);

  const todayUnreviewedCount = React.useMemo(
    () => todayCardIds.filter((id) => !quizReviewedCardIds.has(id)).length,
    [todayCardIds, quizReviewedCardIds]
  );

  const handlePressTodayReview = React.useCallback(() => {
    if (todayCardIds.length === 0) {
      Alert.alert('今天還沒有新增單字', '先新增幾張卡片，再開始今日複習。');
      return;
    }

    navigation.navigate('CardReview', {
      albumId: 'today-added',
      albumName: 'Today Review',
      cardIds: todayCardIds,
      questionCount: todayReviewQuestionCount,
      themeColor: '#2D9E66',
    });
  }, [navigation, todayCardIds, todayReviewQuestionCount]);

  const handleChangeTodayReviewQuestionCount = React.useCallback((nextCount: number) => {
    setTodayReviewQuestionCount(nextCount);
    void saveAlbumReviewPreferences('today-added', { questionCount: nextCount });
  }, []);

  const handleAddAlbum = React.useCallback(() => {
    const trimmedName = newAlbumName.trim();
    if (!trimmedName) return;

    const newAlbum = createCustomAlbum(trimmedName);

    setCustomAlbums((prev) => [newAlbum, ...prev]);
    setIsCreateModalVisible(false);
    setNewAlbumName('');
  }, [newAlbumName]);

  const handleAlbumPress = React.useCallback(
    (album: DeckAlbum) => {
      navigation.navigate('AlbumView', { album, isDefault: album.isDefault });
    },
    [navigation]
  );

  const openAlbumSettings = React.useCallback((album: DeckAlbum) => {
    if (album.isDefault) {
      Alert.alert('無法編輯', '預設資料夾不能修改名稱、圖示或顏色。');
      return;
    }
    setSettingsAlbum(album);
    setSettingsName(album.name);
    setSettingsEmoji(album.emoji || '📁');
    setSettingsColor(album.color || '#4A67D8');
    setSettingsCoverImageUri(album.coverImageUri);
    setSettingsVisible(true);
  }, []);

  const handlePickAlbumCoverImage = React.useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('需要相簿權限', '請允許相簿權限後再選擇相簿封面。');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.95,
      });
      if (result.canceled || !result.assets?.length) return;
      const picked = result.assets[0];
      if (!picked?.uri) return;
      setSettingsCoverImageUri(picked.uri);
    } catch (error) {
      console.error('[DeckMain] pick album cover failed:', error);
      Alert.alert('選圖失敗', '無法讀取相簿圖片，請稍後再試。');
    }
  }, []);

  const handleSaveAlbumSettings = React.useCallback(() => {
    if (!settingsAlbum) return;
    if (settingsAlbum.isDefault) {
      Alert.alert('無法編輯', '預設資料夾不能修改名稱、圖示或顏色。');
      return;
    }

    const nextName = settingsName.trim();
    if (!nextName) {
      Alert.alert('名稱不可為空', '請輸入相簿名稱。');
      return;
    }

    const isCustomAlbum = customAlbums.some((it) => it.id === settingsAlbum.id);
    if (isCustomAlbum) {
      setCustomAlbums((prev) =>
        prev.map((it) =>
          it.id === settingsAlbum.id
            ? { ...it, name: nextName, emoji: settingsEmoji, color: settingsColor, coverImageUri: settingsCoverImageUri }
            : it
        )
      );
    } else {
      setAlbumNameOverrides((prev) => ({ ...prev, [settingsAlbum.id]: nextName }));
      setAlbumEmojiOverrides((prev) => ({ ...prev, [settingsAlbum.id]: settingsEmoji }));
      setAlbumColorOverrides((prev) => ({ ...prev, [settingsAlbum.id]: settingsColor }));
      if (settingsCoverImageUri) {
        setAlbumCoverOverrides((prev) => ({ ...prev, [settingsAlbum.id]: settingsCoverImageUri }));
      } else {
        setAlbumCoverOverrides((prev) => {
          const next = { ...prev };
          delete next[settingsAlbum.id];
          return next;
        });
      }
    }

    setSettingsVisible(false);
    setSettingsAlbum(null);
    setSettingsCoverImageUri(undefined);
  }, [customAlbums, settingsAlbum, settingsName, settingsEmoji, settingsColor, settingsCoverImageUri]);

  const handleDeleteAlbum = React.useCallback((album: DeckAlbum) => {
    if (album.isDefault) {
      Alert.alert('無法刪除', '預設資料夾不能刪除。');
      return;
    }

    Alert.alert('刪除相簿', `確定要刪除「${album.name}」嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: () => {
          const isCustomAlbum = customAlbums.some((it) => it.id === album.id);
          if (isCustomAlbum) {
            setCustomAlbums((prev) => prev.filter((it) => it.id !== album.id));
          } else {
            setDeletedAlbumIds((prev) => (prev.includes(album.id) ? prev : [...prev, album.id]));
          }
        },
      },
    ]);
  }, [customAlbums]);

  const handleActionEnd = React.useCallback(
    (album: DeckAlbum, action: 'none' | 'sort' | 'edit' | 'delete') => {
      if (action === 'edit') {
        openAlbumSettings(album);
        return;
      }
      if (action === 'delete') {
        handleDeleteAlbum(album);
      }
    },
    [handleDeleteAlbum, openAlbumSettings]
  );

  const handleMenuStart = React.useCallback(
    (album: DeckAlbum, layout: { x: number; y: number; width: number; height: number }) => {
      setActiveAlbum(album);
      setActiveLayout(layout);
    },
    []
  );

  const handleMenuFinish = React.useCallback(() => {
    setActiveAlbum(null);
    setActiveLayout(null);
  }, []);

  const handleAvatarPress = React.useCallback(() => {
    if (onPressAvatar) {
      onPressAvatar();
      return;
    }
    console.log('[DeckHub] Avatar pressed');
  }, [onPressAvatar]);

  const handleCacheFabPress = React.useCallback(() => {
    if (onPressCacheFab) {
      onPressCacheFab();
      return;
    }
    tabSwipeContext?.goToTab(1);
    setTimeout(() => {
      tabSwipeContext?.triggerCacheAddAction();
    }, 280);
  }, [onPressCacheFab, tabSwipeContext]);

  const handlePressWordPopItem = React.useCallback(
    (item: { cardId: string; text: string; imageUri?: string }) => {
      if (!item?.cardId) return;
      const scopedCardIds = allCards.map((card) => card.id);
      if (scopedCardIds.length === 0) {
        Alert.alert('目前沒有可開啟的卡片', '請先新增或同步卡片後再試。');
        return;
      }
      const targetCardId = scopedCardIds.includes(item.cardId) ? item.cardId : scopedCardIds[0];
      navigation.navigate('CardDetail', {
        cardId: targetCardId,
        cardIds: scopedCardIds,
        albumName: 'All cards',
        headerTitle: 'All cards',
      });
    },
    [allCards, navigation]
  );

  return (
    <>
      <DeckMainScreenUI
        appTheme={appTheme}
        heroStatusText={allCards.length > 0 ? "Cache isn't empty" : 'Cache is empty'}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClearSearch={() => setSearchQuery('')}
        onPressAvatar={handleAvatarPress}
        onPressCacheFab={handleCacheFabPress}
        onOpenCreateAlbum={() => setIsCreateModalVisible(true)}
        sortOrder={sortOrder}
        onToggleSort={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
        filterPills={filterPills}
        todayReviewTotalCount={todayCardIds.length}
        todayReviewPendingCount={todayUnreviewedCount}
        onPressTodayReview={handlePressTodayReview}
        onPressTodayReviewTuning={() => setShowTodayReviewTuningModal(true)}
        slideshowItems={slideshowItems}
        onPressSlideshowItem={handlePressWordPopItem}
        albums={processedAlbums}
        onPressAlbum={handleAlbumPress}
        isMenuVisible={isMenuVisible}
        startX={startX}
        startY={startY}
        hoveredAction={hoveredAction}
        activeAlbumId={activeAlbum?.id || null}
        onMenuStart={handleMenuStart}
        onMenuFinish={handleMenuFinish}
        onActionEnd={handleActionEnd}
      />

      <ReviewTuningModalUI
        visible={showTodayReviewTuningModal}
        questionCount={todayReviewQuestionCount}
        onClose={() => setShowTodayReviewTuningModal(false)}
        onChangeQuestionCount={handleChangeTodayReviewQuestionCount}
      />

      <CreateAlbumModalUI
        visible={isCreateModalVisible}
        albumName={newAlbumName}
        onChangeAlbumName={setNewAlbumName}
        onCancel={() => {
          setIsCreateModalVisible(false);
          setNewAlbumName('');
        }}
        onConfirm={handleAddAlbum}
      />

      <AlbumSettingsModalUI
        visible={settingsVisible}
        settingsName={settingsName}
        settingsEmoji={settingsEmoji}
        settingsColor={settingsColor}
        onChangeName={setSettingsName}
        onChangeEmoji={setSettingsEmoji}
        onChangeColor={setSettingsColor}
        settingsCoverImageUri={settingsCoverImageUri}
        onPickCoverImage={handlePickAlbumCoverImage}
        onRemoveCoverImage={() => setSettingsCoverImageUri(undefined)}
        onCancel={() => {
          setSettingsVisible(false);
          setSettingsAlbum(null);
          setSettingsCoverImageUri(undefined);
        }}
        onSave={handleSaveAlbumSettings}
      />

      <AlbumActionMenuOverlayUI
        isMenuVisible={isMenuVisible}
        startX={startX}
        startY={startY}
        hoveredAction={hoveredAction}
        activeAlbum={activeAlbum}
        activeLayout={activeLayout}
      />
    </>
  );
}
