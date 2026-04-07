import React from 'react';
import { Alert } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect } from '@react-navigation/native';
import { useSharedValue } from 'react-native-reanimated';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import { resolveCardImageUri } from '@services/media/cardImage';
import CreateAlbumModalUI from '../../../components/UI/DeckScreenUI/CreateAlbumModalUI';
import DeckMainScreenUI from '../../../components/UI/DeckScreenUI/DeckMainScreenUI';
import AlbumSettingsModalUI from '../../../components/UI/DeckScreenUI/AlbumSettingsModalUI';
import AlbumActionMenuOverlayUI from '../../../components/UI/DeckScreenUI/AlbumActionMenuOverlayUI';
import type { DeckAlbum } from '../../../components/UI/DeckScreenUI/deckTypes';
import {
  buildDeckAlbums,
  createCustomAlbum,
  loadDeckAlbumPreferences,
  saveDeckAlbumPreferences,
  type DeckAlbumPreferences,
} from '../../../features/deck/albums';

type Props = {
  navigation: any;
};

export default function DeckMainFlow({ navigation }: Props) {
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
  const [deletedAlbumIds, setDeletedAlbumIds] = React.useState<string[]>([]);
  const [isAlbumPrefsHydrated, setIsAlbumPrefsHydrated] = React.useState(false);
  const [settingsVisible, setSettingsVisible] = React.useState(false);
  const [settingsAlbum, setSettingsAlbum] = React.useState<DeckAlbum | null>(null);
  const [settingsName, setSettingsName] = React.useState('');
  const [settingsEmoji, setSettingsEmoji] = React.useState('📁');
  const [settingsColor, setSettingsColor] = React.useState('#4A67D8');
  const [activeAlbum, setActiveAlbum] = React.useState<DeckAlbum | null>(null);
  const [activeLayout, setActiveLayout] = React.useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const isMenuVisible = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const hoveredAction = useSharedValue<'none' | 'edit' | 'delete'>('none');

  const filterPills = ['群組', '隱私', '已封存'];

  const hydrateAlbumPrefs = React.useCallback(async () => {
    try {
      const prefs = await loadDeckAlbumPreferences();
      setCustomAlbums(prefs.customAlbums);
      setAlbumNameOverrides(prefs.albumNameOverrides);
      setAlbumEmojiOverrides(prefs.albumEmojiOverrides);
      setAlbumColorOverrides(prefs.albumColorOverrides);
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
        deletedAlbumIds,
      }),
    [allCards, cardImageMap, customAlbums, albumNameOverrides, albumEmojiOverrides, albumColorOverrides, deletedAlbumIds]
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
    setSettingsVisible(true);
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
            ? { ...it, name: nextName, emoji: settingsEmoji, color: settingsColor }
            : it
        )
      );
    } else {
      setAlbumNameOverrides((prev) => ({ ...prev, [settingsAlbum.id]: nextName }));
      setAlbumEmojiOverrides((prev) => ({ ...prev, [settingsAlbum.id]: settingsEmoji }));
      setAlbumColorOverrides((prev) => ({ ...prev, [settingsAlbum.id]: settingsColor }));
    }

    setSettingsVisible(false);
    setSettingsAlbum(null);
  }, [customAlbums, settingsAlbum, settingsName, settingsEmoji, settingsColor]);

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
    (album: DeckAlbum, action: 'none' | 'edit' | 'delete') => {
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

  return (
    <>
      <DeckMainScreenUI
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClearSearch={() => setSearchQuery('')}
        onOpenCreateAlbum={() => setIsCreateModalVisible(true)}
        sortOrder={sortOrder}
        onToggleSort={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
        filterPills={filterPills}
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
        onCancel={() => {
          setSettingsVisible(false);
          setSettingsAlbum(null);
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
