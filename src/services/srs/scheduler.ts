// Spaced Repetition System (SRS) using FSRS algorithm
// Based on Free Spaced Repetition Scheduler

export type ReviewRating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export type SRSCard = {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: Date;
  lastReviewedAt?: Date;
};

/**
 * Calculate next review date based on user's rating
 * Using simplified SM-2 algorithm
 */
export function calculateNextReview(
  card: SRSCard,
  rating: ReviewRating
): SRSCard {
  let { easeFactor, intervalDays, repetitions } = card;

  // Update ease factor based on rating
  easeFactor = Math.max(
    1.3,
    easeFactor + (0.1 - (4 - rating) * (0.08 + (4 - rating) * 0.02))
  );

  // Calculate new interval
  if (rating === 1) {
    // Again: Reset
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;

    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
  }

  // Calculate next review date
  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);

  return {
    easeFactor,
    intervalDays,
    repetitions,
    nextReviewAt,
    lastReviewedAt: new Date(),
  };
}

/**
 * Get cards due for review
 */
export function getCardsDueForReview(cards: SRSCard[]): SRSCard[] {
  const now = new Date();
  return cards.filter((card) => card.nextReviewAt <= now);
}

/**
 * Initialize a new card with default SRS values
 */
export function initializeSRSCard(): SRSCard {
  return {
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 0,
    nextReviewAt: new Date(),
  };
}
