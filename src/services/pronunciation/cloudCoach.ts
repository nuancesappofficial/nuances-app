import * as FileSystem from 'expo-file-system/legacy';
import { callAIAction } from '../ai/edgeAiClient';
import { supabase } from '@services/supabase/client';
import type { PronunciationFeedback } from '../../types/database.types';

export type WordFeedbackLevel = 'red' | 'yellow' | 'green';

export type CloudWordFeedback = {
  word: string;
  accuracy: number;
  level: WordFeedbackLevel;
};

export type CloudPhonemeFeedback = {
  phoneme: string;
  letters?: string;
  accuracy: number;
  level: WordFeedbackLevel;
  spokenPhoneme?: string | null;
  suggestion?: string;
};

export type CloudLetterSegmentFeedback = {
  text: string;
  letters?: string;
  phoneme: string;
  spokenPhoneme?: string | null;
  accuracy: number;
  level: WordFeedbackLevel;
  suggestion?: string;
};

export type CloudPronunciationResult = {
  score: number;
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  prosodyScore: number;
  feedbackLines: string[];
  feedbackPayload: PronunciationFeedback;
  wordFeedback: CloudWordFeedback[];
  phonemeFeedback: CloudPhonemeFeedback[];
  letterSegments: CloudLetterSegmentFeedback[];
  wavFormat?: {
    audioFormat?: number | null;
    channels?: number | null;
    sampleRate?: number | null;
    byteRate?: number | null;
    bitsPerSample?: number | null;
  };
  raw?: unknown;
};

type PronunciationAssessRequest = {
  referenceText: string;
  audioBase64: string;
  locale?: string;
  demoExperience?: boolean;
};

type PronunciationAssessResponse = {
  overallScore?: number;
  accuracyScore?: number;
  fluencyScore?: number;
  completenessScore?: number;
  prosodyScore?: number;
  hasPronunciationAssessment?: boolean;
  recognitionStatus?: string;
  displayText?: string;
  wavFormat?: {
    audioFormat?: number | null;
    channels?: number | null;
    sampleRate?: number | null;
    byteRate?: number | null;
    bitsPerSample?: number | null;
  };
  wordFeedback?: Array<{
    word?: string;
    accuracy?: number;
    level?: WordFeedbackLevel;
  }>;
  phonemeFeedback?: Array<{
    phoneme?: string;
    letters?: string;
    accuracy?: number;
    level?: WordFeedbackLevel;
    spokenPhoneme?: string | null;
    suggestion?: string;
  }>;
  letterSegments?: Array<{
    text?: string;
    letters?: string;
    phoneme?: string;
    spokenPhoneme?: string | null;
    accuracy?: number;
    level?: WordFeedbackLevel;
    suggestion?: string;
  }>;
  raw?: unknown;
};

const CLOUD_ASSESS_TIMEOUT_MS = 25_000;
const MAX_AUDIO_BASE64_CHARS = 3_500_000;
const MIN_AUDIO_BASE64_CHARS = 8_000;
const MIN_AUDIO_BYTES = 6_000;
const COACHING_SUGGESTION_THRESHOLD = 90;

export function detectPronunciationLocale(text: string | undefined | null): string {
  const value = (text || '').trim();
  if (!value) return 'en-US';
  if (/[\u3040-\u30ff]/u.test(value)) return 'ja-JP';
  if (/[\uac00-\ud7af]/u.test(value)) return 'ko-KR';
  if (/[\u3400-\u9fff]/u.test(value)) return 'zh-TW';
  if (/[ñáéíóúü¿¡]/iu.test(value)) return 'es-ES';
  return 'en-US';
}

function estimateBytesFromBase64(base64: string): number {
  const normalized = base64.trim();
  if (!normalized) return 0;
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function clampScore(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function toWordLevel(accuracy: number): WordFeedbackLevel {
  if (accuracy < 60) return 'red';
  if (accuracy < 80) return 'yellow';
  return 'green';
}

function buildFeedbackLines(
  metrics: {
    score: number;
    accuracyScore: number;
    fluencyScore: number;
    hasPronunciationAssessment: boolean;
  },
  words: CloudWordFeedback[],
  phonemes: CloudPhonemeFeedback[],
  diagnostics?: { recognitionStatus?: string; displayText?: string }
): string[] {
  const lines: string[] = [];
  const hasPronunciationMetrics =
    metrics.hasPronunciationAssessment || phonemes.length > 0 || words.length > 0;
  lines.push(
    hasPronunciationMetrics
      ? `本次整體發音分數：${metrics.score}/100`
      : '語音辨識成功，但 Azure 未回傳有效的發音評估分數'
  );

  const weakWords = words
    .filter((item) => item.accuracy < COACHING_SUGGESTION_THRESHOLD)
    .slice(0, 3);
  if (weakWords.length > 0) {
    const summary = weakWords.map((item) => `${item.word}(${item.accuracy})`).join('、');
    lines.push(`優先修正單字：${summary}`);
  } else if (hasPronunciationMetrics) {
    lines.push('整體表現穩定，建議持續保持語速與重音。');
  }

  const weakPhonemes = phonemes
    .filter((item) => item.accuracy < COACHING_SUGGESTION_THRESHOLD)
    .slice(0, 3);
  if (weakPhonemes.length > 0) {
    const summary = weakPhonemes
      .map((item) => `${item.letters || item.phoneme}(${item.accuracy})`)
      .join('、');
    lines.push(`需加強音段：${summary}`);
  }

  if (diagnostics?.recognitionStatus && diagnostics.recognitionStatus !== 'Success') {
    lines.push(`辨識狀態：${diagnostics.recognitionStatus}`);
  }
  if (diagnostics?.displayText) {
    lines.push(`AI 聽到：${diagnostics.displayText}`);
  }

  return lines;
}

function normalizeWordFeedback(
  incoming: PronunciationAssessResponse['wordFeedback']
): CloudWordFeedback[] {
  if (!Array.isArray(incoming)) return [];

  return incoming
    .map((item) => {
      const word = typeof item?.word === 'string' ? item.word.trim() : '';
      if (typeof item?.accuracy !== 'number' || !Number.isFinite(item.accuracy)) {
        return null;
      }
      const accuracy = clampScore(item.accuracy);
      if (!word) return null;
      return {
        word,
        accuracy,
        level: item?.level === 'red' || item?.level === 'yellow' || item?.level === 'green'
          ? item.level
          : toWordLevel(accuracy),
      } as CloudWordFeedback;
    })
    .filter((item): item is CloudWordFeedback => Boolean(item));
}

function normalizePhonemeFeedback(
  incoming: PronunciationAssessResponse['phonemeFeedback']
): CloudPhonemeFeedback[] {
  if (!Array.isArray(incoming)) return [];

  return incoming
    .map((item) => {
      const phoneme = typeof item?.phoneme === 'string' ? item.phoneme.trim() : '';
      if (!phoneme || typeof item?.accuracy !== 'number' || !Number.isFinite(item.accuracy)) {
        return null;
      }
      const accuracy = clampScore(item.accuracy);
      return {
        phoneme,
        letters: typeof item?.letters === 'string' ? item.letters : undefined,
        accuracy,
        level: item?.level === 'red' || item?.level === 'yellow' || item?.level === 'green'
          ? item.level
          : toWordLevel(accuracy),
        spokenPhoneme: typeof item?.spokenPhoneme === 'string' ? item.spokenPhoneme : null,
        suggestion: typeof item?.suggestion === 'string' ? item.suggestion : undefined,
      } as CloudPhonemeFeedback;
    })
    .filter((item): item is CloudPhonemeFeedback => Boolean(item));
}

function normalizeLetterSegments(
  incoming: PronunciationAssessResponse['letterSegments']
): CloudLetterSegmentFeedback[] {
  if (!Array.isArray(incoming)) return [];

  return incoming
    .map((item) => {
      const text = typeof item?.text === 'string' ? item.text : '';
      const phoneme = typeof item?.phoneme === 'string' ? item.phoneme : '';
      if (!text || !phoneme || typeof item?.accuracy !== 'number' || !Number.isFinite(item.accuracy)) {
        return null;
      }
      const accuracy = clampScore(item.accuracy);
      return {
        text,
        letters: typeof item?.letters === 'string' ? item.letters : undefined,
        phoneme,
        spokenPhoneme: typeof item?.spokenPhoneme === 'string' ? item.spokenPhoneme : null,
        accuracy,
        level: item?.level === 'red' || item?.level === 'yellow' || item?.level === 'green'
          ? item.level
          : toWordLevel(accuracy),
        suggestion: typeof item?.suggestion === 'string' ? item.suggestion : undefined,
      } as CloudLetterSegmentFeedback;
    })
    .filter((item): item is CloudLetterSegmentFeedback => Boolean(item));
}

export async function assessPronunciationCloud(params: {
  referenceText: string;
  audioUri: string;
  locale?: string;
  demoExperience?: boolean;
}): Promise<CloudPronunciationResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    throw new Error('請先登入後再使用發音教練');
  }
  const referenceText = params.referenceText.trim();
  if (!referenceText) {
    throw new Error('referenceText is required');
  }
  if (!params.audioUri) {
    throw new Error('audioUri is required');
  }

  const audioBase64 = await FileSystem.readAsStringAsync(params.audioUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!audioBase64 || !audioBase64.trim()) {
    throw new Error('錄音內容為空，請重新錄音');
  }
  if (audioBase64.length < MIN_AUDIO_BASE64_CHARS) {
    throw new Error('錄音太短或未成功錄到聲音，請按住錄音 1-2 秒後再試');
  }
  const estimatedAudioBytes = estimateBytesFromBase64(audioBase64);
  if (estimatedAudioBytes < MIN_AUDIO_BYTES) {
    throw new Error('錄音內容過短或近乎無聲，請靠近麥克風並清楚唸出單字後再試');
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    throw new Error('錄音過長，請控制在 8-10 秒內再試');
  }

  const requestPayload = {
    referenceText,
    audioBase64,
    locale: params.locale || detectPronunciationLocale(referenceText),
    demoExperience: params.demoExperience === true,
  };
  const requestPromise = callAIAction<
    PronunciationAssessRequest,
    PronunciationAssessResponse
  >('pronunciation_assess', requestPayload);
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('發音分析逾時，請稍後再試（timeout）')), CLOUD_ASSESS_TIMEOUT_MS);
  });
  const result = await Promise.race([requestPromise, timeoutPromise]);

  const score = clampScore(result?.overallScore);
  const accuracyScore = clampScore(result?.accuracyScore ?? result?.overallScore);
  const fluencyScore = clampScore(result?.fluencyScore);
  const completenessScore = clampScore(result?.completenessScore ?? result?.overallScore);
  const prosodyScore = clampScore(result?.prosodyScore ?? result?.fluencyScore);
  const normalizedWordFeedback = normalizeWordFeedback(result?.wordFeedback);
  const normalizedPhonemeFeedback = normalizePhonemeFeedback(result?.phonemeFeedback);
  const normalizedLetterSegments = normalizeLetterSegments(result?.letterSegments);
  const wordFeedback = normalizedWordFeedback;
  const phonemeFeedback = normalizedPhonemeFeedback;
  const letterSegments = normalizedLetterSegments;
  const feedbackLines = buildFeedbackLines({
    score,
    accuracyScore,
    fluencyScore,
    hasPronunciationAssessment:
      typeof result?.hasPronunciationAssessment === 'boolean'
        ? result.hasPronunciationAssessment
        : Boolean(
          result?.overallScore !== undefined
          || result?.accuracyScore !== undefined
          || result?.fluencyScore !== undefined
          || result?.completenessScore !== undefined
          || result?.prosodyScore !== undefined
        ),
  }, wordFeedback, phonemeFeedback, {
    recognitionStatus:
      typeof result?.recognitionStatus === 'string' ? result.recognitionStatus : undefined,
    displayText: typeof result?.displayText === 'string' ? result.displayText : undefined,
  });
  const feedbackPayload: PronunciationFeedback = {
    accuracy_score: accuracyScore,
    fluency_score: fluencyScore,
    completeness_score: completenessScore,
    prosody_score: prosodyScore,
    phonemes: phonemeFeedback.map((item) => ({
      phoneme: item.phoneme,
      accuracy_score: item.accuracy,
      letters: item.letters,
      level: item.level,
      spoken_phoneme: item.spokenPhoneme ?? null,
      suggestion: item.suggestion,
    })),
    words: wordFeedback.map((item) => ({
      word: item.word,
      accuracy_score: item.accuracy,
      accuracy: item.accuracy,
      level: item.level,
    })),
    feedback_text: feedbackLines.join(' '),
  };

  return {
    score,
    accuracyScore,
    fluencyScore,
    completenessScore,
    prosodyScore,
    feedbackLines,
    feedbackPayload,
    wordFeedback,
    phonemeFeedback,
    letterSegments,
    wavFormat: result?.wavFormat,
    raw: result?.raw,
  };
}
