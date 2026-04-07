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

type Props = {
  navigation: any;
};

function getTagsArray(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (typeof tags === 'string') {
    const trimmed = tags.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
    } catch {
      return trimmed
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function buildPreviewCards(cards: Card[], cardImageMap: Record<string, string>) {
  return cards.slice(0, 3).map((card) => {
    const imageUrl = cardImageMap[card.id];
    return {
      ...(imageUrl ? { imageUrl } : {}),
      cardTypeText: card.partOfSpeech || 'word',
      previewText: (card.targetWord || card.definition || 'card').trim(),
      createdAtMs: new Date(card.createdAt).getTime(),
    };
  });
}

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

  const albums = React.useMemo<DeckAlbum[]>(() => {
    const slangCards: Card[] = [];
    const cultureCards: Card[] = [];
    const workCards: Card[] = [];

    allCards.forEach((card) => {
      const tags = getTagsArray(card.tags).map((t) => t.toLowerCase());
      const albumTagIds = tags
        .filter((tag) => tag.startsWith('album:'))
        .map((tag) => tag.slice('album:'.length).trim());
      const source = (card.sourceApp || '').toLowerCase();
      const text = `${card.targetWord || ''} ${card.definition || ''}`.toLowerCase();

      if (
        tags.some((t) => ['slang', 'internet', 'social'].includes(t)) ||
        albumTagIds.includes('slang') ||
        /slang|internet|meme/.test(text)
      ) {
        slangCards.push(card);
      }

      if (
        tags.some((t) => ['culture', 'pop', 'movie'].includes(t)) ||
        albumTagIds.includes('culture') ||
        /culture|movie|music|pop/.test(text)
      ) {
        cultureCards.push(card);
      }

      if (
        tags.some((t) => ['work', 'business', 'office'].includes(t)) ||
        albumTagIds.includes('work') ||
        /work|business|office/.test(text) ||
        source.includes('slack')
      ) {
        workCards.push(card);
      }
    });

    return [
      {
        id: 'all',
        name: 'All cards',
        emoji: '📌',
        color: '#1B1B1F',
        cardIds: allCards.map((card) => card.id),
        wordCount: allCards.length,
        latestCards: buildPreviewCards(allCards, cardImageMap),
        isDefault: true,
      },
      {
        id: 'slang',
        name: 'Internet Slang',
        emoji: '💬',
        color: '#1B1B1F',
        cardIds: Array.from(new Set(slangCards.map((card) => card.id))),
        wordCount: slangCards.length,
        latestCards: buildPreviewCards(slangCards, cardImageMap),
      },
      {
        id: 'culture',
        name: 'Pop Culture',
        emoji: '🎬',
        color: '#1B1B1F',
        cardIds: Array.from(new Set(cultureCards.map((card) => card.id))),
        wordCount: cultureCards.length,
        latestCards: buildPreviewCards(cultureCards, cardImageMap),
      },
      {
        id: 'work',
        name: 'Work Phrases',
        emoji: '💼',
        color: '#1B1B1F',
        cardIds: Array.from(new Set(workCards.map((card) => card.id))),
        wordCount: workCards.length,
        latestCards: buildPreviewCards(workCards, cardImageMap),
      },
    ];
  }, [allCards, cardImageMap]);

  const mergedAlbums = React.useMemo(() => {
    const allMerged = [...albums, ...customAlbums].map((album) => ({
      ...album,
      name: albumNameOverrides[album.id] || album.name,
      emoji: albumEmojiOverrides[album.id] || album.emoji,
      color: albumColorOverrides[album.id] || album.color,
    }));

    return allMerged.filter((album) => !deletedAlbumIds.includes(album.id));
  }, [albums, customAlbums, albumNameOverrides, albumEmojiOverrides, albumColorOverrides, deletedAlbumIds]);

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

    const newAlbum: DeckAlbum = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      emoji: '📁',
      color: '#E5E5EA',
      cardIds: [],
      wordCount: 0,
      latestCards: [],
    };

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
    setSettingsAlbum(album);
    setSettingsName(album.name);
    setSettingsEmoji(album.emoji || '📁');
    setSettingsColor(album.color || '#4A67D8');
    setSettingsVisible(true);
  }, []);

  const handleSaveAlbumSettings = React.useCallback(() => {
    if (!settingsAlbum) return;

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
      Alert.alert('無法刪除', 'All cards 是預設相簿，不能刪除。');
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
