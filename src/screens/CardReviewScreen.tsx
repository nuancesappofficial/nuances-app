// Card Review Screen with flip animation
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react';
import type Card from '@database/models/Card';
import { calculateNextReview, type ReviewRating } from '../services/srs/scheduler';
import { database } from '@database/index';

type Props = {
  card: Card;
  onReviewComplete: (rating: ReviewRating) => void;
};

export default function CardReviewScreen({ card, onReviewComplete }: Props) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [flipAnimation] = useState(new Animated.Value(0));

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
    try {
      // Update card with new SRS values
      const newSRSData = calculateNextReview(
        {
          easeFactor: card.easeFactor,
          intervalDays: card.intervalDays,
          repetitions: card.repetitions,
          nextReviewAt: card.nextReviewAt,
          lastReviewedAt: card.lastReviewedAt,
        },
        rating
      );

      await database.write(async () => {
        await card.update((c) => {
          c.easeFactor = newSRSData.easeFactor;
          c.intervalDays = newSRSData.intervalDays;
          c.repetitions = newSRSData.repetitions;
          c.nextReviewAt = newSRSData.nextReviewAt;
          c.lastReviewedAt = newSRSData.lastReviewedAt;
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

      onReviewComplete(rating);
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

  return (
    <View style={styles.container}>
      <View style={styles.cardContainer}>
        {/* Front Side */}
        {!isFlipped && (
          <Animated.View style={[styles.card, frontAnimatedStyle]}>
            <View style={styles.cardContent}>
              <Text style={styles.label}>Word</Text>
              <Text style={styles.targetWord}>{card.targetWord}</Text>

              {card.targetPhrase && (
                <>
                  <Text style={styles.label}>Phrase</Text>
                  <Text style={styles.targetPhrase}>{card.targetPhrase}</Text>
                </>
              )}

              <Text style={styles.label}>Context</Text>
              <Text style={styles.originalSentence}>
                {card.originalSentence}
              </Text>

              {card.phoneticTranscription && (
                <>
                  <Text style={styles.label}>Pronunciation</Text>
                  <Text style={styles.phonetic}>
                    {card.phoneticTranscription}
                  </Text>
                </>
              )}
            </View>

            <TouchableOpacity style={styles.flipButton} onPress={flipCard}>
              <Text style={styles.flipButtonText}>🔄 Show Answer</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Back Side */}
        {isFlipped && (
          <Animated.View style={[styles.card, backAnimatedStyle]}>
            <View style={styles.cardContent}>
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

              {card.tags && card.tags.length > 0 && (
                <View style={styles.tagsContainer}>
                  {card.tags.map((tag, index) => (
                    <View key={index} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

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
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
    justifyContent: 'center',
  },
  cardContainer: {
    height: 400,
    marginBottom: 24,
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
    marginBottom: 16,
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
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
  },
});
