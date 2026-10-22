import type { CloudPhonemeFeedback } from '@services/pronunciation/cloudCoach';

// 發音教練重新打開卡片時要重畫的上次結果；只有發音教練會寫入。
export type CoachResult = {
  score: number | null;
  feedbackLines: string[];
  phonemeFeedback: CloudPhonemeFeedback[];
  showFeedback: boolean;
};

// Pronunciation Record：每張卡的發音紀錄（發音教練和測驗都算）。
export type PronunciationRecord = {
  // 舊資料推不回第一次分數，是 null。
  firstScore: number | null;
  latestScore: number;
  bestScore: number;
  attempts: number;
  updatedAt: string;
  coach: CoachResult | null;
};

export type PronunciationAssessment = {
  score: number | null;
  // 教學導覽、App 導覽或預設體驗的示範評分。
  demo: boolean;
  at: string;
  // 只有發音教練會帶；測驗不帶，就保留原本的教練結果。
  coach?: CoachResult;
};

// 記錄一次評分：只有拿到分數、而且不是示範的評分才算一次練習。
export function recordAssessment(
  prev: PronunciationRecord | null,
  assessment: PronunciationAssessment
): PronunciationRecord | null {
  const { score, demo, at, coach } = assessment;
  if (score === null || demo) return prev;
  if (prev) {
    return {
      ...prev,
      latestScore: score,
      bestScore: Math.max(prev.bestScore, score),
      attempts: prev.attempts + 1,
      updatedAt: at,
      coach: coach ?? prev.coach,
    };
  }
  return {
    firstScore: score,
    latestScore: score,
    bestScore: score,
    attempts: 1,
    updatedAt: at,
    coach: coach ?? null,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readCoachResult(raw: Record<string, unknown>): CoachResult {
  const score = isFiniteNumber(raw.score) ? raw.score : null;
  const feedbackLines = Array.isArray(raw.feedbackLines)
    ? raw.feedbackLines.filter((item): item is string => typeof item === 'string')
    : [];
  const phonemeFeedback = Array.isArray(raw.phonemeFeedback)
    ? raw.phonemeFeedback.filter((item): item is CloudPhonemeFeedback =>
        Boolean(item && typeof item === 'object' && typeof item.phoneme === 'string')
      )
    : [];
  return {
    score,
    feedbackLines,
    phonemeFeedback,
    showFeedback: Boolean(
      raw.showFeedback ?? (score !== null || phonemeFeedback.length > 0)
    ),
  };
}

// 讀取已存的紀錄。舊格式只有最近一次結果：當成練過 1 次、第一次分數不明。
export function readStoredRecord(input: unknown): PronunciationRecord | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : '';
  if ('attempts' in raw) {
    const { firstScore, latestScore, bestScore, attempts } = raw;
    if (
      !isFiniteNumber(latestScore) ||
      !isFiniteNumber(bestScore) ||
      !isFiniteNumber(attempts) ||
      attempts < 1 ||
      (firstScore !== null && !isFiniteNumber(firstScore))
    ) {
      return null;
    }
    const storedCoach =
      raw.coach && typeof raw.coach === 'object' && !Array.isArray(raw.coach)
        ? readCoachResult(raw.coach as Record<string, unknown>)
        : null;
    return {
      firstScore,
      latestScore,
      bestScore,
      attempts,
      updatedAt,
      coach: storedCoach,
    };
  }
  const coach = readCoachResult(raw);
  if (coach.score === null) return null;
  return {
    firstScore: null,
    latestScore: coach.score,
    bestScore: coach.score,
    attempts: 1,
    updatedAt,
    coach,
  };
}
