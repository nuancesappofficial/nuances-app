import React from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

export default function AlbumViewScreen({ navigation, route }: Props) {
  const [allCards, setAllCards] = React.useState<Card[]>([]);
  const [cardImageMap, setCardImageMap] = React.useState<Record<string, string>>({});
  const screenOpacity = React.useRef(new Animated.Value(0)).current;

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

  const listHeader = (
    <View style={styles.headerWrap}>
      <View style={styles.topNavRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconHitArea}>
          <Text style={styles.navIcon}>‹</Text>
        </TouchableOpacity>

        <View style={styles.topNavRightRow}>
          <TouchableOpacity style={styles.iconHitArea}>
            <Text style={styles.navIcon}>⌕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconHitArea}>
            <Text style={styles.navIcon}>⇅</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.titleText}>Made for You</Text>

      <View style={styles.subtitleRow}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoBadgeCheck}>✓</Text>
        </View>
        <Text style={styles.subtitleBrand}>VividVocab</Text>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.subtitlePrivate}>Private</Text>
      </View>

      <Text style={styles.descriptionText}>
        Words picked just for you, with new ones added automatically as you learn them.
      </Text>

      <View style={styles.progressRow}>
        <View style={styles.progressDot} />
        <Text style={styles.progressText}>{`${albumCards.length} words, ${learnedPercent}% learned`}</Text>
      </View>

      <View style={styles.actionButtonsRow}>
        <TouchableOpacity style={styles.actionButton} activeOpacity={0.9}>
          <Text style={styles.actionButtonIcon}>▥</Text>
          <Text style={styles.actionButtonText}>Review words</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} activeOpacity={0.9}>
          <Text style={styles.actionButtonIcon}>☰</Text>
          <Text style={styles.actionButtonText}>Personalize</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Animated.View style={[styles.screenWrap, { opacity: screenOpacity }]}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <FlatList
          data={albumCards}
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
                    <Text style={styles.premiumStar}>☆</Text>
                    <Text style={styles.premiumText}>PREMIUM</Text>
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
                  <Text style={styles.moreIcon}>•••</Text>
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#0B1320',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  headerWrap: {
    paddingTop: 8,
    marginBottom: 8,
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
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  logoBadge: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#228BE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeCheck: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  subtitleBrand: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  lockIcon: {
    fontSize: 12,
  },
  subtitlePrivate: {
    color: '#C6D0E1',
    fontSize: 14,
  },
  descriptionText: {
    color: '#D5DEEC',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
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
  premiumStar: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
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
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  moreIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 20,
    letterSpacing: 1,
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
});
