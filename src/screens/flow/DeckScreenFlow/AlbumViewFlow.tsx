import React from 'react';
import { Alert, Animated, Easing, TextInput } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import { resolveCardImageUri } from '@services/media/cardImage';
import CardViewUI from '../../../components/UI/DeckScreenUI/CardViewUI';
import AlbumSortModalUI from '../../../components/UI/DeckScreenUI/AlbumSortModalUI';
import CardActionModalUI from '../../../components/UI/DeckScreenUI/CardActionModalUI';

type Album = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  cardIds: string[];
};

type RouteParams = {
  album?: Album;
};

type Props = {
  navigation: any;
  route: { params?: RouteParams };
};

type SortMode = 'recently_added' | 'recently_reviewed' | 'alphabetical';

function getDefaultAlbum(cards: Card[]): Album {
  return {
    id: 'all-cards',
    name: 'All Cards',
    emoji: '📚',
    color: '#EAF1FF',
    cardIds: cards.map((card) => card.id),
  };
}

function getLearningStatus(card: Card): { label: 'NEW' | 'LEARNING'; icon: string; bgColor: string } {
  const reps = Number(card.repetitions || 0);
  if (reps >= 2) {
    return {
      label: 'LEARNING',
      icon: '◌',
      bgColor: '#702459',
    };
  }
  return {
    label: 'NEW',
    icon: '✦',
    bgColor: '#2D3748',
  };
}

function getWordText(card: Card): string {
  return (card.targetWord || card.targetPhrase || card.definition || 'WORD').toUpperCase();
}

function withHexAlpha(color: string, alphaHex: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return `${color}${alphaHex}`;
  return color;
}

export default function AlbumViewFlow({ navigation, route }: Props) {
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [cardImageMap, setCardImageMap] = React.useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sortMode, setSortMode] = React.useState<SortMode>('recently_added');
  const [showSortModal, setShowSortModal] = React.useState(false);
  const [isSearchVisible, setIsSearchVisible] = React.useState(false);
  const [showCardActionModal, setShowCardActionModal] = React.useState(false);
  const [selectedCard, setSelectedCard] = React.useState<Card | null>(null);
  const screenOpacity = React.useRef(new Animated.Value(0)).current;
  const searchInputRef = React.useRef<TextInput | null>(null);

  const closeCardActionModal = React.useCallback(() => {
    setShowCardActionModal(false);
    setSelectedCard(null);
  }, []);

  const openCardActionModal = React.useCallback((card: Card) => {
    setSelectedCard(card);
    setShowCardActionModal(true);
  }, []);

  const handleDeleteCard = React.useCallback(() => {
    if (!selectedCard) return;
    const targetCard = selectedCard;
    Alert.alert('刪除卡片', `確定要刪除 ${getWordText(targetCard)} 嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: () => {
          void database.write(async () => {
            await targetCard.update((record) => {
              record.deletedAt = new Date();
            });
          });
          closeCardActionModal();
        },
      },
    ]);
  }, [closeCardActionModal, selectedCard]);

  React.useEffect(() => {
    screenOpacity.setValue(0);
    Animated.timing(screenOpacity, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [screenOpacity]);

  React.useEffect(() => {
    const queryCards = database
      .get<Card>('cards')
      .query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc));

    const load = async () => {
      try {
        const data = await queryCards.fetch();
        setAllCards(data);
      } catch (error) {
        console.error('[AlbumView] load cards failed:', error);
        setAllCards([]);
      }
    };

    void load();
    const sub = queryCards.observe().subscribe((data) => setAllCards(data));
    return () => sub.unsubscribe();
  }, []);

  const album = React.useMemo(() => {
    return route.params?.album ?? getDefaultAlbum(allCards);
  }, [allCards, route.params?.album]);
  const themeColor = React.useMemo(() => album.color || '#3B82F6', [album.color]);

  const albumCards = React.useMemo(() => {
    if (!album.cardIds.length) return [];
    const idSet = new Set(album.cardIds);
    return allCards.filter((card) => idSet.has(card.id));
  }, [allCards, album.cardIds]);

  React.useEffect(() => {
    let cancelled = false;

    const loadCardImages = async () => {
      const nextMap: Record<string, string> = {};
      await Promise.all(
        albumCards.map(async (card) => {
          const uri = await resolveCardImageUri({
            cardId: card.id,
            remoteUri: card.imageUrl,
          });
          if (card.imageUrl && !uri) {
            console.warn('[AlbumView] card image resolve failed', {
              cardId: card.id,
              imageUrl: card.imageUrl,
            });
          }
          if (uri) {
            nextMap[card.id] = uri;
          }
        })
      );
      if (!cancelled) {
        setCardImageMap(nextMap);
      }
    };

    void loadCardImages();
    return () => {
      cancelled = true;
    };
  }, [albumCards]);

  const learnedCount = React.useMemo(
    () => albumCards.filter((card) => Number(card.repetitions || 0) > 0).length,
    [albumCards]
  );

  const learnedPercent = React.useMemo(() => {
    if (!albumCards.length) return 0;
    return Math.round((learnedCount / albumCards.length) * 100);
  }, [albumCards.length, learnedCount]);

  const processedCards = React.useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    let result = [...albumCards];

    if (keyword) {
      result = result.filter((card) => {
        const target = `${card.targetWord || ''} ${card.targetPhrase || ''} ${card.definition || ''} ${
          card.partOfSpeech || ''
        }`.toLowerCase();
        return target.includes(keyword);
      });
    }

    result.sort((a, b) => {
      if (sortMode === 'alphabetical') {
        const aWord = (a.targetWord || a.targetPhrase || a.definition || '').toLowerCase();
        const bWord = (b.targetWord || b.targetPhrase || b.definition || '').toLowerCase();
        return aWord.localeCompare(bWord);
      }

      if (sortMode === 'recently_reviewed') {
        const aReviewed = a.lastReviewedAt ? new Date(a.lastReviewedAt).getTime() : 0;
        const bReviewed = b.lastReviewedAt ? new Date(b.lastReviewedAt).getTime() : 0;
        if (bReviewed !== aReviewed) return bReviewed - aReviewed;
      }

      const aCreated = new Date(a.createdAt).getTime();
      const bCreated = new Date(b.createdAt).getTime();
      return bCreated - aCreated;
    });

    return result;
  }, [albumCards, searchQuery, sortMode]);

  const sortLabel = React.useMemo(() => {
    if (sortMode === 'recently_reviewed') return 'Recently reviewed';
    if (sortMode === 'alphabetical') return 'Alphabetical';
    return 'Recently added';
  }, [sortMode]);

  return (
    <>
      <CardViewUI
        screenOpacity={screenOpacity}
        themeColor={themeColor}
        albumName={album.name || 'Made for You'}
        processedCards={processedCards}
        learnedPercent={learnedPercent}
        searchQuery={searchQuery}
        onChangeSearchQuery={setSearchQuery}
        isSearchVisible={isSearchVisible}
        searchInputRef={searchInputRef}
        onPressBack={() => navigation.goBack()}
        onPressSearch={() => {
          setIsSearchVisible(true);
          requestAnimationFrame(() => searchInputRef.current?.focus());
        }}
        onPressSort={() => setShowSortModal(true)}
        onPressCard={(item) =>
          navigation.navigate('CardDetail', {
            cardId: item.id,
            cardIds: processedCards.map((card) => card.id),
          })
        }
        onPressMoreCard={openCardActionModal}
        cardImageMap={cardImageMap}
        getWordText={getWordText}
        getLearningStatus={getLearningStatus}
        withHexAlpha={withHexAlpha}
      />

      <AlbumSortModalUI
        visible={showSortModal}
        sortMode={sortMode}
        sortLabel={sortLabel}
        onClose={() => setShowSortModal(false)}
        onChangeSortMode={(mode) => {
          setSortMode(mode);
          setShowSortModal(false);
        }}
      />

      <CardActionModalUI
        visible={showCardActionModal}
        title={selectedCard ? getWordText(selectedCard) : 'Card Action'}
        onClose={closeCardActionModal}
        onDelete={handleDeleteCard}
      />
    </>
  );
}
