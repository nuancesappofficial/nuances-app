import type { PronunciationFeedback } from '../../types/database.types';

export type PronunciationAnalysis = {
  score: number;
  referenceWaveform: number[];
  userWaveform: number[];
  feedbackLines: string[];
  feedbackPayload: PronunciationFeedback;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeArray(values: number[]): number[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => clamp01((v - min) / (max - min)));
}

export function buildReferenceWaveform(
  text: string,
  bins = 24
): number[] {
  const source = text.trim();
  if (!source) return new Array(bins).fill(0.3);

  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return new Array(bins).fill(0.3);

  const values: number[] = [];
  for (let i = 0; i < bins; i += 1) {
    const word = words[i % words.length];
    const base = Math.min(1, word.length / 10);
    const pulse = 0.2 * Math.sin((i / bins) * Math.PI * 4);
    values.push(clamp01(0.25 + base * 0.55 + pulse));
  }
  return normalizeArray(values);
}

export function normalizeMeteringToWaveform(
  meteringValues: number[],
  bins = 24
): number[] {
  if (meteringValues.length === 0) return new Array(bins).fill(0);

  const normalized = meteringValues.map((meter) => {
    const db = Number.isFinite(meter) ? meter : -160;
    return clamp01((db + 60) / 60);
  });

  const chunkSize = Math.max(1, Math.floor(normalized.length / bins));
  const downsampled: number[] = [];
  for (let i = 0; i < bins; i += 1) {
    const start = i * chunkSize;
    const end = Math.min(normalized.length, start + chunkSize);
    if (start >= normalized.length) {
      downsampled.push(0);
      continue;
    }
    const slice = normalized.slice(start, end);
    const avg = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    downsampled.push(avg);
  }

  return normalizeArray(downsampled);
}

function computeWaveSimilarity(referenceWave: number[], userWave: number[]): number {
  if (referenceWave.length === 0 || userWave.length === 0) return 0;
  const len = Math.min(referenceWave.length, userWave.length);
  let diffSum = 0;
  for (let i = 0; i < len; i += 1) {
    diffSum += Math.abs(referenceWave[i] - userWave[i]);
  }
  const avgDiff = diffSum / len;
  return clamp01(1 - avgDiff);
}

function buildArticulationHints(text: string, score: number): string[] {
  const lower = text.toLowerCase();
  const hints: string[] = [];

  if (score < 70) {
    hints.push('先放慢速度，句子切成 2-3 段再讀一次。');
  }

  if (/\bth\b|th/.test(lower)) {
    hints.push('舌尖輕觸上排牙齒後方，再送氣發 /th/。');
  }
  if (/\br\b|r/.test(lower)) {
    hints.push('R 音避免捲舌過度，舌頭懸空不要碰到上顎。');
  }
  if (/\bl\b|l/.test(lower)) {
    hints.push('L 音舌尖要碰齒齦，句尾 L 保持清楚。');
  }
  if (/\bw\b|w/.test(lower)) {
    hints.push('W 音先圓唇再打開，嘴型轉換要明確。');
  }
  if (/\bp\b|p|t|k/.test(lower)) {
    hints.push('清子音（p/t/k）送氣要更明顯。');
  }

  if (hints.length === 0) {
    hints.push('重點放在句子的重音詞，弱讀功能詞。');
  }
  return hints.slice(0, 4);
}

export function analyzePronunciation(
  inputText: string,
  referenceWave: number[],
  userWave: number[]
): PronunciationAnalysis {
  const similarity = computeWaveSimilarity(referenceWave, userWave);
  const score = Math.round(similarity * 100);
  const feedbackLines = buildArticulationHints(inputText, score);

  const payload: PronunciationFeedback = {
    accuracy_score: score,
    fluency_score: Math.max(0, Math.min(100, score + (score >= 75 ? 5 : -5))),
    completeness_score: Math.max(0, Math.min(100, score + (score >= 80 ? 4 : -8))),
    prosody_score: Math.max(0, Math.min(100, score + (score >= 70 ? 3 : -7))),
    phonemes: [],
    words: [],
    feedback_text: feedbackLines.join(' '),
  };

  return {
    score,
    referenceWaveform: referenceWave,
    userWaveform: userWave,
    feedbackLines,
    feedbackPayload: payload,
  };
}
