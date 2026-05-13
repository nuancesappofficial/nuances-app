import React from 'react';
import { Alert, Animated, Easing, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import { resolveCardImageUri } from '@services/media/cardImage';
import CardViewUI from '../../../components/UI/DeckScreenUI/CardViewUI';
import AlbumSortModalUI from '../../../components/UI/DeckScreenUI/AlbumSortModalUI';
import CardActionModalUI from '../../../components/UI/DeckScreenUI/CardActionModalUI';
import { loadSeenCardIds } from '../../../features/deck/cardDetailSeen';
import ReviewTuningModalUI from '../../../components/UI/DeckScreenUI/ReviewTuningModalUI';
import {
  DEFAULT_ALBUM_REVIEW_PREFERENCES,
  loadAlbumReviewPreferences,
  saveAlbumReviewPreferences,
  type ReviewQuestionType,
} from '../../../features/deck/reviewPreferences';
import { consumeAlbumPreload } from '../../../features/deck/albumPreloadCache';

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

function getDefaultAlbum(): Album {
  return {
    id: 'all-cards',
    name: 'All Cards',
    emoji: '📚',
    color: '#EAF1FF',
    cardIds: [],
  };
}

function getLearningStatus(
  card: Card,
  seenCardIds: Set<string>
): { label: 'NEW' | 'LEARNING'; icon: string; bgColor: string } | null {
  if (!seenCardIds.has(card.id)) {
    return {
      label: 'NEW',
      icon: '✦',
      bgColor: 'rgba(255,107,107,0.15)',
    };
  }
  return null;
}

function getWordText(card: Card): string {
  return card.targetWord || card.targetPhrase || card.definition || 'WORD';
}

function withHexAlpha(color: string, alphaHex: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return `${color}${alphaHex}`;
  return color;
}

export default function AlbumViewFlow({ navigation, route }: Props) {
  const album = React.useMemo(() => {
    return route.params?.album ?? getDefaultAlbum();
  }, [route.params?.album]);
  const initialPreloadRef = React.useRef(consumeAlbumPreload(album.id));
  const [albumCards, setAlbumCards] = React.useState<Card[]>(() => initialPreloadRef.current?.cards ?? []);
  const [cardImageMap, setCardImageMap] = React.useState<Record<string, string>>(
    () => initialPreloadRef.current?.cardImageMap ?? {}
  );
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sortMode, setSortMode] = React.useState<SortMode>('recently_added');
  const [showSortModal, setShowSortModal] = React.useState(false);
  const [isSearchVisible, setIsSearchVisible] = React.useState(false);
  const [showCardActionModal, setShowCardActionModal] = React.useState(false);
  const [showReviewTuningModal, setShowReviewTuningModal] = React.useState(false);
  const [selectedCard, setSelectedCard] = React.useState<Card | null>(null);
  const [seenCardIds, setSeenCardIds] = React.useState<Set<string>>(
    () => initialPreloadRef.current?.seenCardIds ?? new Set()
  );
  const [reviewQuestionCount, setReviewQuestionCount] = React.useState(
    DEFAULT_ALBUM_REVIEW_PREFERENCES.questionCount
  );
  const [selectedQuestionTypes, setSelectedQuestionTypes] = React.useState<ReviewQuestionType[]>(
    DEFAULT_ALBUM_REVIEW_PREFERENCES.selectedQuestionTypes
  );
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

  const themeColor = React.useMemo(() => album.color || '#3B82F6', [album.color]);
  React.useEffect(() => {
    const cardsCollection = database.get<Card>('cards');
    const queryCards =
      album.id === 'all-cards' || !album.cardIds.length
        ? cardsCollection.query(Q.where('deleted_at', null), Q.sortBy('created_at', Q.desc))
        : cardsCollection.query(
            Q.where('deleted_at', null),
            Q.where('id', Q.oneOf(album.cardIds)),
            Q.sortBy('created_at', Q.desc)
          );

    const load = async () => {
      try {
        const data = await queryCards.fetch();
        setAlbumCards(data);
      } catch (error) {
        console.error('[AlbumView] load album cards failed:', error);
        setAlbumCards([]);
      }
    };

    void load();
    const sub = queryCards.observe().subscribe((data) => setAlbumCards(data));
    return () => sub.unsubscribe();
  }, [album.cardIds, album.id]);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;

      const hydrateSeenCards = async () => {
        const nextSeenCardIds = await loadSeenCardIds();
        if (active) {
          setSeenCardIds(nextSeenCardIds);
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

      const hydrateReviewPreferences = async () => {
        const prefs = await loadAlbumReviewPreferences(album.id);
        if (active) {
          setReviewQuestionCount(prefs.questionCount);
          setSelectedQuestionTypes(prefs.selectedQuestionTypes);
        }
      };

      void hydrateReviewPreferences();
      return () => {
        active = false;
      };
    }, [album.id])
  );

  React.useEffect(() => {
    let cancelled = false;
    const currentCardIds = new Set(albumCards.map((card) => card.id));
    setCardImageMap((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([id, uri]) => {
        if (currentCardIds.has(id)) {
          next[id] = uri;
        }
      });
      return next;
    });

    const loadCardImages = async () => {
      for (const card of albumCards) {
        if (cancelled) break;
        const uri = await resolveCardImageUri({
          cardId: card.id,
          remoteUri: card.imageUrl,
        });
        if (cancelled || !uri) continue;
        setCardImageMap((prev) => (prev[card.id] === uri ? prev : { ...prev, [card.id]: uri }));
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

  const handleChangeQuestionCount = React.useCallback(
    (nextCount: number) => {
      setReviewQuestionCount(nextCount);
      void saveAlbumReviewPreferences(album.id, { questionCount: nextCount });
    },
    [album.id]
  );

  const handleChangeSelectedQuestionTypes = React.useCallback(
    (nextTypes: ReviewQuestionType[]) => {
      setSelectedQuestionTypes(nextTypes);
      void saveAlbumReviewPreferences(album.id, { selectedQuestionTypes: nextTypes });
    },
    [album.id]
  );

  const handlePressPlay = React.useCallback(() => {
    const sourceCards = processedCards.length > 0 ? processedCards : albumCards;
    if (!sourceCards.length) {
      Alert.alert('沒有可測驗的字卡', '這個資料夾目前沒有可用題目。');
      return;
    }

    navigation.navigate('CardReview', {
      albumId: album.id,
      albumName: album.name || 'Made for You',
      cardIds: sourceCards.map((card) => card.id),
      questionCount: reviewQuestionCount,
      selectedQuestionTypes,
      themeColor,
    });
  }, [album.id, album.name, albumCards, navigation, processedCards, reviewQuestionCount, selectedQuestionTypes, themeColor]);

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
          setIsSearchVisible((prev) => {
            const next = !prev;
            if (next) {
              requestAnimationFrame(() => searchInputRef.current?.focus());
            } else {
              setSearchQuery('');
            }
            return next;
          });
        }}
        onPressSort={() => setShowSortModal(true)}
        onPressPlay={handlePressPlay}
        onPressReviewTuning={() => setShowReviewTuningModal(true)}
        onPressCard={(item) =>
          navigation.navigate('CardDetail', {
            cardId: item.id,
            cardIds: processedCards.map((card) => card.id),
            albumName: album.name || 'Made for You',
            headerTitle: album.name || 'Made for You',
          })
        }
        onPressMoreCard={openCardActionModal}
        cardImageMap={cardImageMap}
        getWordText={getWordText}
        getLearningStatus={(card) => getLearningStatus(card, seenCardIds)}
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

      <ReviewTuningModalUI
        visible={showReviewTuningModal}
        questionCount={reviewQuestionCount}
        selectedQuestionTypes={selectedQuestionTypes}
        onClose={() => setShowReviewTuningModal(false)}
        onChangeQuestionCount={handleChangeQuestionCount}
        onChangeSelectedQuestionTypes={handleChangeSelectedQuestionTypes}
      />
    </>
  );
}
