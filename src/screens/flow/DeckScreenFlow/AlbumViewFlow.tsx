import React from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Q } from '@nozbe/watermelondb';
import { database } from '@database/index';
import type Card from '@database/models/Card';
import { resolveCardImageUri } from '@services/media/cardImage';

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

export default function AlbumViewScreen({ navigation, route }: Props) {
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
      console.log('[AlbumView] card image map size:', {
        albumCards: albumCards.length,
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

  const listHeader = (
    <View style={styles.headerWrap}>
      <View style={styles.topNavRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconHitArea}>
          <Text style={styles.navIcon}>‹</Text>
        </TouchableOpacity>

        <View style={styles.topNavRightRow}>
          <TouchableOpacity
            style={styles.iconHitArea}
            onPress={() => {
              setIsSearchVisible(true);
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
          >
            <Text style={styles.navIcon}>⌕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconHitArea} onPress={() => setShowSortModal(true)}>
            <Text style={styles.navIcon}>⇅</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isSearchVisible ? (
        <View style={styles.searchWrap}>
          <TextInput
            ref={searchInputRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search words"
            placeholderTextColor="#8DA0BE"
            style={styles.searchInput}
            returnKeyType="search"
            onBlur={() => setIsSearchVisible(false)}
          />
        </View>
      ) : null}

      <Text style={styles.titleText} numberOfLines={1}>
        {album.name || 'Made for You'}
      </Text>

      <View style={styles.progressRow}>
        <View style={styles.progressDot} />
        <Text style={styles.progressText}>{`${processedCards.length} words, ${learnedPercent}% learned`}</Text>
      </View>

      <View style={styles.actionButtonsRow}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: themeColor }]} activeOpacity={0.9}>
          <Text style={styles.actionButtonIcon}>▥</Text>
          <Text style={styles.actionButtonText}>Review words</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: themeColor }]} activeOpacity={0.9}>
          <Text style={styles.actionButtonIcon}>☰</Text>
          <Text style={styles.actionButtonText}>Personalize</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Animated.View style={[styles.screenWrap, { opacity: screenOpacity }]}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <LinearGradient
            colors={[
              withHexAlpha(themeColor, 'F0'),
              withHexAlpha(themeColor, '8C'),
              withHexAlpha(themeColor, '2E'),
              'rgba(0,0,0,0)',
            ]}
            locations={[0, 0.2, 0.46, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.topThemeGradient}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.74)', 'rgba(0,0,0,1)']}
            locations={[0, 0.56, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.bottomBlackGradient}
          />
        </View>
        <FlatList
          data={processedCards}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const status = getLearningStatus(item);
            const imageUri = cardImageMap[item.id];

            return (
              <TouchableOpacity
                style={styles.cardRow}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('CardDetail', { cardId: item.id })}
              >
                <View style={styles.thumbnailWrap}>
                  {imageUri ? (
                    <Image
                      key={imageUri}
                      source={{ uri: imageUri }}
                      style={styles.thumbnailImage}
                      resizeMode="cover"
                      onError={(event) => {
                        console.warn('[AlbumView] thumbnail image load failed', {
                          cardId: item.id,
                          imageUri,
                          error: event.nativeEvent?.error,
                        });
                      }}
                    />
                  ) : (
                    <View style={styles.thumbnailFallback}>
                      <Text style={styles.thumbnailFallbackText} numberOfLines={1}>
                        {getWordText(item).slice(0, 1)}
                      </Text>
                    </View>
                  )}

                  <View style={styles.premiumBadge}>
                    <Text style={styles.premiumText} numberOfLines={1}>
                      {getWordText(item)}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardMiddle}>
                  <Text style={styles.wordText} numberOfLines={1}>
                    {getWordText(item)}
                  </Text>

                  <View style={[styles.statusBadge, { backgroundColor: status.bgColor }]}>
                    <Text style={styles.statusIcon}>{status.icon}</Text>
                    <Text style={styles.statusText}>{status.label}</Text>
                  </View>
                </View>

                <View style={styles.moreWrap}>
                  <TouchableOpacity
                    style={styles.moreButton}
                    onPress={(event) => {
                      event.stopPropagation?.();
                      openCardActionModal(item);
                    }}
                  >
                    <Text style={styles.moreIcon}>⋯</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No words yet</Text>
            </View>
          }
        />
      </SafeAreaView>
      <Modal
        visible={showSortModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSortModal(false)}
      >
        <Pressable style={styles.sortModalOverlay} onPress={() => setShowSortModal(false)}>
          <Pressable style={styles.sortModalCard} onPress={() => undefined}>
            <Text style={styles.sortModalTitle}>Sort by...</Text>

            <TouchableOpacity
              style={[styles.sortOptionBtn, sortMode === 'recently_added' && styles.sortOptionBtnActive]}
              onPress={() => {
                setSortMode('recently_added');
                setShowSortModal(false);
              }}
            >
              <Text style={[styles.sortOptionText, sortMode === 'recently_added' && styles.sortOptionTextActive]}>
                Recently added
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortOptionBtn, sortMode === 'recently_reviewed' && styles.sortOptionBtnActive]}
              onPress={() => {
                setSortMode('recently_reviewed');
                setShowSortModal(false);
              }}
            >
              <Text style={[styles.sortOptionText, sortMode === 'recently_reviewed' && styles.sortOptionTextActive]}>
                Recently reviewed
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortOptionBtn, sortMode === 'alphabetical' && styles.sortOptionBtnActive]}
              onPress={() => {
                setSortMode('alphabetical');
                setShowSortModal(false);
              }}
            >
              <Text style={[styles.sortOptionText, sortMode === 'alphabetical' && styles.sortOptionTextActive]}>
                Alphabetical
              </Text>
            </TouchableOpacity>

            <Text style={styles.sortModeHint}>{`Current: ${sortLabel}`}</Text>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={showCardActionModal}
        transparent
        animationType="slide"
        onRequestClose={closeCardActionModal}
      >
        <Pressable style={styles.sortModalOverlay} onPress={closeCardActionModal}>
          <Pressable style={styles.sortModalCard} onPress={() => undefined}>
            <Text style={styles.sortModalTitle}>{selectedCard ? getWordText(selectedCard) : 'Card Action'}</Text>
            <TouchableOpacity style={styles.deleteOptionBtn} onPress={handleDeleteCard}>
              <Text style={styles.deleteOptionText}>刪掉卡片</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelOptionBtn} onPress={closeCardActionModal}>
              <Text style={styles.cancelOptionText}>取消</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  topThemeGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomBlackGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  headerWrap: {
    paddingTop: 8,
    marginBottom: 8,
  },
  searchWrap: {
    marginBottom: 12,
  },
  searchInput: {
    height: 42,
    borderRadius: 10,
    backgroundColor: '#121D2D',
    borderWidth: 1,
    borderColor: '#2A3D5D',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  topNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  topNavRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconHitArea: {
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIcon: {
    color: '#FFFFFF',
    fontSize: 36,
    lineHeight: 36,
    fontWeight: '500',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  progressDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#364A69',
  },
  progressText: {
    color: '#F0F4FB',
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 32,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  actionButtonIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  thumbnailWrap: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 16,
    backgroundColor: '#1D2737',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1D2737',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailFallbackText: {
    color: '#A8B7CF',
    fontSize: 30,
    fontWeight: '700',
  },
  premiumBadge: {
    position: 'absolute',
    alignSelf: 'center',
    top: 28,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(8, 10, 17, 0.56)',
    borderColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
  },
  premiumText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  cardMiddle: {
    flex: 1,
    justifyContent: 'center',
  },
  wordText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 4,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  statusIcon: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  moreWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreIcon: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 24,
    textAlign: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#8EA0BE',
    fontSize: 14,
  },
  sortModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  sortModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    backgroundColor: '#131F31',
    borderWidth: 1,
    borderColor: '#2A3D5D',
    padding: 14,
    gap: 10,
  },
  sortModalTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  sortOptionBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1B2940',
  },
  sortOptionBtnActive: {
    backgroundColor: '#2E4F80',
  },
  sortOptionText: {
    color: '#D8E2F1',
    fontSize: 15,
    fontWeight: '600',
  },
  sortOptionTextActive: {
    color: '#FFFFFF',
  },
  sortModeHint: {
    marginTop: 4,
    color: '#8EA0BE',
    fontSize: 12,
  },
  deleteOptionBtn: {
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: '#4D1E24',
  },
  deleteOptionText: {
    color: '#FFBFC7',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelOptionBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1B2940',
  },
  cancelOptionText: {
    color: '#D8E2F1',
    fontSize: 15,
    fontWeight: '600',
  },
});
