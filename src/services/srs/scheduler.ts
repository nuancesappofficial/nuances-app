// SRS (Spaced Repetition System) Scheduler
// 使用 SM-2 演算法實現

export type ReviewRating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export type SRSData = {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: Date;
  lastReviewedAt: Date | null;
};

/**
 * 根據用戶評分計算下次複習時間
 * 基於 SM-2 演算法
 * 
 * @param currentData 當前卡片的 SRS 數據
 * @param rating 用戶評分 (1=Again, 2=Hard, 3=Good, 4=Easy)
 * @returns 更新後的 SRS 數據
 */
export function calculateNextReview(
  currentData: SRSData,
  rating: ReviewRating
): SRSData {
  const now = new Date();
  let { easeFactor, intervalDays, repetitions } = currentData;

  // SM-2 演算法核心邏輯
  if (rating >= 3) {
    // Good 或 Easy - 成功記住
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
    repetitions += 1;
  } else {
    // Again 或 Hard - 重新開始
    repetitions = 0;
    intervalDays = 1;
  }

  // 更新 Ease Factor
  easeFactor = easeFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));
  
  // Ease Factor 不能低於 1.3
  if (easeFactor < 1.3) {
    easeFactor = 1.3;
  }

  // 根據評分調整間隔
  if (rating === 2) {
    // Hard - 縮短間隔
    intervalDays = Math.round(intervalDays * 1.2);
  } else if (rating === 4) {
    // Easy - 延長間隔
    intervalDays = Math.round(intervalDays * easeFactor);
  }

  // 計算下次複習時間
  const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    easeFactor,
    intervalDays,
    repetitions,
    nextReviewAt,
    lastReviewedAt: now,
  };
}

/**
 * 檢查卡片是否到期需要複習
 */
export function isDue(nextReviewAt: Date): boolean {
  return new Date(nextReviewAt) <= new Date();
}

/**
 * 獲取到期時間的文字描述
 */
export function getDueTimeText(nextReviewAt: Date): string {
  const now = new Date();
  const dueDate = new Date(nextReviewAt);
  const diffMs = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `過期 ${Math.abs(diffDays)} 天`;
  } else if (diffDays === 0) {
    return '今天';
  } else if (diffDays === 1) {
    return '明天';
  } else {
    return `${diffDays} 天後`;
  }
}
