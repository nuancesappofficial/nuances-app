// Card Review Screen with flip animation
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  SafeAreaView,
  ScrollView,
  Image,
} from 'react-native';
import type Card from '@database/models/Card';
import type CachedItem from '@database/models/CachedItem';
import { calculateNextReview, type ReviewRating } from '../services/srs/scheduler';
import { database } from '@database/index';

type Props = {
  navigation: any;
  route: any;
};

/** 判斷字串是否為檔案路徑而非實際文字內容 */
function isFilePath(text: string | undefined | null): boolean {
  if (!text) return true;
  return text.startsWith('file://') || text.startsWith('/') || text.startsWith('http');
}

export default function CardReviewScreen({ navigation, route }: Props) {
  const params = route.params as {
    card?: Card;
    cardId?: string;
    cardIds?: string[];
    queueIndex?: number;
  };
  const [isFlipped, setIsFlipped] = React.useState(false);
  const [flipAnimation] = React.useState(new Animated.Value(0));
  const [card, setCard] = React.useState<Card | null>(params.card ?? null);
  const [isLoadingCard, setIsLoadingCard] = React.useState(false);
  const [cachedItem, setCachedItem] = React.useState<CachedItem | null>(null);
  const queueCardIds = React.useMemo(() => {
    if (Array.isArray(params.cardIds) && params.cardIds.length > 0) {
      return params.cardIds;
    }
    if (params.cardId) return [params.cardId];
    if (params.card?.id) return [params.card.id];
    return [];
  }, [params.cardIds, params.cardId, params.card]);
  const queueIndex =
    typeof params.queueIndex === 'number' && params.queueIndex >= 0
      ? params.queueIndex
      : 0;
  const currentCardId =
    queueCardIds[queueIndex] || params.cardId || params.card?.id || null;

  React.useEffect(() => {
    setIsFlipped(false);
    flipAnimation.setValue(0);
  }, [currentCardId, flipAnimation]);

  React.useEffect(() => {
    let active = true;
    const loadCard = async () => {
      if (!currentCardId) {
        setCard(null);
        return;
      }

      if (params.card && params.card.id === currentCardId) {
        setCard(params.card);
        return;
      }

      setIsLoadingCard(true);
      try {
        const loaded = await database.get<Card>('cards').find(currentCardId);
        if (active) {
          setCard(loaded);
        }
      } catch (error) {
        console.error('[CardReview] Failed to load card:', error);
        if (active) {
          setCard(null);
        }
      } finally {
        if (active) {
          setIsLoadingCard(false);
        }
      }
    };

    void loadCard();
    return () => {
      active = false;
    };
  }, [currentCardId, params.card]);

  // 取得關聯的 cachedItem（用於顯示原圖）
  React.useEffect(() => {
    if (!card?.cachedItemId) {
      setCachedItem(null);
      return;
    }

    if (card.cachedItemId) {
      database
        .get<CachedItem>('cached_items')
        .find(card.cachedItemId)
        .then(setCachedItem)
        .catch(() => setCachedItem(null));
    }
  }, [card?.cachedItemId]);

  const flipCard = () => {
    Animated.spring(flipAnimation, {
      toValue: isFlipped ? 0 : 180,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const handleRating = async (rating: ReviewRating) => {
    if (!card) return;

    try {
      // Update card with new SRS values
      const newSRSData = calculateNextReview(
        {
          easeFactor: card.easeFactor,
          intervalDays: card.intervalDays,
          repetitions: card.repetitions,
          nextReviewAt: new Date(card.nextReviewAt),
          lastReviewedAt: card.lastReviewedAt ? new Date(card.lastReviewedAt) : null,
        },
        rating
      );

      await database.write(async () => {
        await card.update((c) => {
          c.easeFactor = newSRSData.easeFactor;
          c.intervalDays = newSRSData.intervalDays;
          c.repetitions = newSRSData.repetitions;
          c.nextReviewAt = newSRSData.nextReviewAt;
          c.lastReviewedAt = newSRSData.lastReviewedAt || new Date();
        });
      });

      // Record review history
      const reviewHistoryCollection = database.get('review_history');
      await database.write(async () => {
        await reviewHistoryCollection.create((review: any) => {
          review.userId = card.userId;
          review.cardId = card.id;
          review.rating = rating;
        });
      });

      const nextQueueIndex = queueIndex + 1;
      if (nextQueueIndex < queueCardIds.length) {
        navigation.replace('CardReview', {
          cardId: queueCardIds[nextQueueIndex],
          cardIds: queueCardIds,
          queueIndex: nextQueueIndex,
        });
        return;
      }

      navigation.goBack();
    } catch (error) {
      console.error('Error updating card:', error);
    }
  };

  const frontAnimatedStyle = {
    transform: [
      {
        rotateY: flipAnimation.interpolate({
          inputRange: [0, 180],
          outputRange: ['0deg', '180deg'],
        }),
      },
    ],
  };

  const backAnimatedStyle = {
    transform: [
      {
        rotateY: flipAnimation.interpolate({
          inputRange: [0, 180],
          outputRange: ['180deg', '360deg'],
        }),
      },
    ],
  };

  if (isLoadingCard || !card) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>複習卡片</Text>
          <View style={styles.closeButton} />
        </View>
        <View style={styles.loadingCardContainer}>
          <Text style={styles.loadingCardText}>載入卡片中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Parse tags if they're stored as JSON string
  let tags: string[] = [];
  if (card.tags) {
    if (typeof card.tags === 'string') {
      try {
        const parsed = JSON.parse(card.tags);
        tags = Array.isArray(parsed) ? parsed : [];
      } catch {
        tags = [];
      }
    } else if (Array.isArray(card.tags)) {
      tags = card.tags;
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with close button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>複習卡片</Text>
        {queueCardIds.length > 1 ? (
          <Text style={styles.queueProgressText}>
            {Math.min(queueIndex + 1, queueCardIds.length)}/{queueCardIds.length}
          </Text>
        ) : (
          <View style={styles.closeButton} />
        )}
      </View>

      <View style={styles.cardContainer}>
        {/* Front Side */}
        {!isFlipped && (
          <Animated.View style={[styles.card, frontAnimatedStyle]}>
            <ScrollView style={styles.cardContent} showsVerticalScrollIndicator={false} contentContainerStyle={styles.cardScrollContent}>
              <Text style={styles.label}>Word</Text>
              <Text style={styles.targetWord}>{card.targetWord}</Text>

              {card.targetPhrase && (
                <>
                  <Text style={styles.label}>Phrase</Text>
                  <Text style={styles.targetPhrase}>{card.targetPhrase}</Text>
                </>
              )}

              {/* 原圖預覽 */}
              {cachedItem?.contentType === 'image' && cachedItem.imageStoragePath && (
                <View style={styles.contextImageContainer}>
                  <Image
                    source={{ uri: cachedItem.imageStoragePath }}
                    style={styles.contextImage}
                    resizeMode="contain"
                  />
                </View>
              )}

              {/* Context：只顯示文字，不顯示路徑 */}
              {!isFilePath(card.originalSentence) && (
                <>
                  <Text style={styles.label}>AI Input Sentence</Text>
                  <Text style={styles.originalSentence}>
                    {card.originalSentence}
                  </Text>
                </>
              )}

              {card.frequentCollocations && (
                <>
                  <Text style={styles.label}>Frequent Collocations</Text>
                  <Text style={styles.originalSentence}>
                    {card.frequentCollocations}
                  </Text>
                </>
              )}

              {card.phoneticTranscription && (
                <>
                  <Text style={styles.label}>Pronunciation</Text>
                  <Text style={styles.phonetic}>
                    {card.phoneticTranscription}
                  </Text>
                </>
              )}

              {card.partOfSpeech && (
                <>
                  <Text style={styles.label}>Part of Speech</Text>
                  <Text style={styles.originalSentence}>{card.partOfSpeech}</Text>
                </>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.flipButton} onPress={flipCard}>
              <Text style={styles.flipButtonText}>🔄 Show Answer</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Back Side */}
        {isFlipped && (
          <Animated.View style={[styles.card, backAnimatedStyle]}>
            <ScrollView style={styles.cardContent} showsVerticalScrollIndicator={false} contentContainerStyle={styles.cardScrollContent}>
              <Text style={styles.label}>Definition</Text>
              <Text style={styles.definition}>{card.definition}</Text>

              {card.contextualExplanation && (
                <>
                  <Text style={styles.label}>Explanation</Text>
                  <Text style={styles.explanation}>
                    {card.contextualExplanation}
                  </Text>
                </>
              )}

              {/* 原圖預覽（背面也顯示） */}
              {cachedItem?.contentType === 'image' && cachedItem.imageStoragePath && (
                <View style={styles.contextImageContainer}>
                  <Image
                    source={{ uri: cachedItem.imageStoragePath }}
                    style={styles.contextImage}
                    resizeMode="contain"
                  />
                </View>
              )}

              {/* Context（背面也顯示短句，不顯示路徑） */}
              {!isFilePath(card.originalSentence) && (
                <>
                  <Text style={styles.label}>Context</Text>
                  <Text style={styles.originalSentence}>
                    {card.originalSentence}
                  </Text>
                </>
              )}

              {tags && tags.length > 0 && (
                <View style={styles.tagsContainer}>
                  {tags.map((tag: string, index: number) => (
                    <View key={index} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.flipButton, styles.flipButtonSecondary]}
              onPress={flipCard}
            >
              <Text style={styles.flipButtonText}>🔄 Show Question</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {/* Rating Buttons */}
      {isFlipped && (
        <View style={styles.ratingContainer}>
          <Text style={styles.ratingLabel}>How well did you know this?</Text>
          
          <View style={styles.ratingButtons}>
            <TouchableOpacity
              style={[styles.ratingButton, styles.ratingAgain]}
              onPress={() => handleRating(1)}
            >
              <Text style={styles.ratingButtonText}>Again</Text>
              <Text style={styles.ratingInterval}>{'<1m'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ratingButton, styles.ratingHard]}
              onPress={() => handleRating(2)}
            >
              <Text style={styles.ratingButtonText}>Hard</Text>
              <Text style={styles.ratingInterval}>{'<6m'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ratingButton, styles.ratingGood]}
              onPress={() => handleRating(3)}
            >
              <Text style={styles.ratingButtonText}>Good</Text>
              <Text style={styles.ratingInterval}>
                {card.intervalDays}d
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ratingButton, styles.ratingEasy]}
              onPress={() => handleRating(4)}
            >
              <Text style={styles.ratingButtonText}>Easy</Text>
              <Text style={styles.ratingInterval}>
                {Math.round(card.intervalDays * card.easeFactor)}d
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Progress Info */}
      <View style={styles.progressInfo}>
        <Text style={styles.progressText}>
          Reviewed: {card.repetitions} times
        </Text>
        <Text style={styles.progressText}>
          Interval: {card.intervalDays} days
        </Text>
        <Text style={styles.progressText}>
          Ease: {card.easeFactor.toFixed(2)}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  queueProgressText: {
    minWidth: 40,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  loadingCardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingCardText: {
    fontSize: 15,
    color: '#666',
  },
  cardContainer: {
    flex: 1,
    marginTop: 8,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    backfaceVisibility: 'hidden',
  },
  cardContent: {
    flex: 1,
  },
  cardScrollContent: {
    paddingBottom: 8,
  },
  contextImageContainer: {
    marginTop: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  contextImage: {
    width: '100%',
    height: 160,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 4,
  },
  targetWord: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  targetPhrase: {
    fontSize: 18,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  originalSentence: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
    fontStyle: 'italic',
  },
  phonetic: {
    fontSize: 16,
    color: '#2196F3',
    fontFamily: 'monospace',
  },
  definition: {
    fontSize: 18,
    color: '#333',
    lineHeight: 26,
  },
  explanation: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  tag: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '600',
  },
  flipButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  flipButtonSecondary: {
    backgroundColor: '#2196F3',
  },
  flipButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  ratingContainer: {
    marginBottom: 8,
    marginHorizontal: 12,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  ratingButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  ratingAgain: {
    backgroundColor: '#F44336',
  },
  ratingHard: {
    backgroundColor: '#FF9800',
  },
  ratingGood: {
    backgroundColor: '#4CAF50',
  },
  ratingEasy: {
    backgroundColor: '#2196F3',
  },
  ratingButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  ratingInterval: {
    color: '#fff',
    fontSize: 12,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
  },
});
