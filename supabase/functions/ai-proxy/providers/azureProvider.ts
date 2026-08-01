import { jsonResponse } from '../_shared/httpResponse.ts';
import { sanitizeText } from '../_shared/requestSanitizers.ts';
import { withDependencyGuard } from '../../_shared/dependencyGuard.ts';
import {
  AZURE_MIN_WAV_BYTES,
  AZURE_REQUEST_TIMEOUT_MS,
  AZURE_SPEECH_KEY,
  AZURE_SPEECH_REGION,
  AZURE_TOKEN_TIMEOUT_MS,
  MAX_SENTENCE_CHARS,
} from '../_shared/runtimeConfig.ts';

type PronunciationAssessPayload = {
  referenceText: string;
  audioBase64: string;
  locale?: string;
};

async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await withDependencyGuard(
      'azure-speech',
      () =>
        fetch(input, {
          ...init,
          signal: controller.signal,
        }),
      {
        isFailure: (response) =>
          response.status === 429 || response.status >= 500,
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

function toAccuracyLevel(score: number): 'red' | 'yellow' | 'green' {
  if (score < 60) return 'red';
  if (score < 80) return 'yellow';
  return 'green';
}

function clampPronScore(score: unknown): number | null {
  const value = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function extractAccuracyScore(source: unknown): number | null {
  if (!source || typeof source !== 'object') return null;
  const obj = source as Record<string, unknown>;
  return (
    clampPronScore((obj.PronunciationAssessment as Record<string, unknown> | undefined)?.AccuracyScore)
    ?? clampPronScore(obj.AccuracyScore)
    ?? clampPronScore(obj.accuracyScore)
    ?? clampPronScore(obj.Score)
    ?? clampPronScore(obj.score)
  );
}

function sanitizeLocale(locale: unknown): string {
  const normalized = sanitizeText(locale, 20);
  if (!normalized) return 'en-US';
  return /^[a-z]{2,3}-[A-Z]{2}$/.test(normalized) ? normalized : 'en-US';
}

function parseAzureJsonResponse(rawText: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return {
      error: {
        message: trimmed.slice(0, 500),
      },
    };
  }
}

function normalizeAudioBase64(input: string): string {
  const trimmed = input.trim();
  const commaIndex = trimmed.indexOf(',');
  if (commaIndex >= 0 && trimmed.slice(0, commaIndex).includes('base64')) {
    return trimmed.slice(commaIndex + 1).trim();
  }
  return trimmed;
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function readUint16LE(bytes: Uint8Array, offset: number): number | null {
  if (offset + 2 > bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number | null {
  if (offset + 4 > bytes.length) return null;
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

function isLikelyWav(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const riff =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const wave =
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
  return riff && wave;
}

function parseWavFormat(bytes: Uint8Array): {
  audioFormat: number | null;
  channels: number | null;
  sampleRate: number | null;
  byteRate: number | null;
  bitsPerSample: number | null;
} {
  if (!isLikelyWav(bytes)) {
    return {
      audioFormat: null,
      channels: null,
      sampleRate: null,
      byteRate: null,
      bitsPerSample: null,
    };
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    const chunkSize = readUint32LE(bytes, offset + 4);
    if (chunkSize === null) break;
    if (chunkId === 'fmt ') {
      return {
        audioFormat: readUint16LE(bytes, offset + 8),
        channels: readUint16LE(bytes, offset + 10),
        sampleRate: readUint32LE(bytes, offset + 12),
        byteRate: readUint32LE(bytes, offset + 16),
        bitsPerSample: readUint16LE(bytes, offset + 22),
      };
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return {
    audioFormat: null,
    channels: null,
    sampleRate: null,
    byteRate: null,
    bitsPerSample: null,
  };
}

export function estimateWavDurationSecondsFromBase64(input: string): number {
  try {
    const bytes = decodeBase64ToBytes(normalizeAudioBase64(input));
    if (!isLikelyWav(bytes)) return 0;
    const format = parseWavFormat(bytes);
    if (!format.byteRate || format.byteRate <= 0) return 0;

    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunkId = String.fromCharCode(
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3]
      );
      const chunkSize = readUint32LE(bytes, offset + 4);
      if (chunkSize === null) break;
      if (chunkId === 'data') {
        return Math.max(0, chunkSize / format.byteRate);
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }

    return Math.max(0, (bytes.length - 44) / format.byteRate);
  } catch {
    return 0;
  }
}

function buildArticulationHint(expected: string, spoken: string | null): string {
  const substitution = spoken && spoken !== expected
    ? `你目前更接近 ${spoken}，目標要更靠近 ${expected}。`
    : '';
  if (expected === 'θ' || expected === 'ð') return `${substitution}舌尖輕放在上下門牙之間，再平穩送氣。`.trim();
  if (expected === 'r') return `${substitution}R 音舌頭後縮並懸空，不要碰上顎。`.trim();
  if (expected === 'l') return `${substitution}L 音舌尖要碰齒齦，尾音不要糊掉。`.trim();
  if (expected === 'i' || expected === 'iː') return `${substitution}長母音要拉長，嘴角更展開。`.trim();
  return `${substitution}放慢速度重讀此音段，確保子音釋放清楚。`.trim();
}

function splitWordIntoLetterSegments(word: string, segmentCount: number): string[] {
  const normalized = sanitizeText(word, 80);
  if (!normalized) return [];
  if (!Number.isFinite(segmentCount) || segmentCount <= 1) return [normalized];
  const total = Math.min(segmentCount, normalized.length);
  const baseSize = Math.floor(normalized.length / total);
  const remainder = normalized.length % total;
  const segments: string[] = [];
  let offset = 0;
  for (let i = 0; i < total; i += 1) {
    const size = baseSize + (i < remainder ? 1 : 0);
    const next = normalized.slice(offset, offset + size);
    if (next) segments.push(next);
    offset += size;
  }
  return segments.length > 0 ? segments : [normalized];
}

export async function handlePronunciationAssess(
  payload: PronunciationAssessPayload
): Promise<Response> {
  const referenceText = sanitizeText(payload.referenceText, MAX_SENTENCE_CHARS);
  const locale = sanitizeLocale(payload.locale);
  const audioBase64 = normalizeAudioBase64(payload.audioBase64 || '');

  if (!referenceText || !audioBase64) {
    return jsonResponse({ error: 'referenceText and audioBase64 are required' }, 400);
  }
  if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
    throw new Error('Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION in Edge Function secrets');
  }

  const tokenEndpoint = `https://${AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
  const tokenResponse = await fetchWithTimeout(
    tokenEndpoint,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
        'Content-Length': '0',
      },
    },
    AZURE_TOKEN_TIMEOUT_MS
  );
  if (!tokenResponse.ok) {
    const tokenBody = await tokenResponse.text().catch(() => '');
    throw new Error(
      `Azure token endpoint failed (${tokenResponse.status}) body=${tokenBody || '<empty>'}`
    );
  }

  const audioBytes = decodeBase64ToBytes(audioBase64);
  const wavFormat = parseWavFormat(audioBytes);
  if (!isLikelyWav(audioBytes)) {
    throw new Error(`Audio payload is not WAV RIFF/WAVE header (bytes=${audioBytes.length})`);
  }
  if (audioBytes.length < AZURE_MIN_WAV_BYTES) {
    return jsonResponse(
      { error: `Audio too short for cloud assessment (wavBytes=${audioBytes.length}, min=${AZURE_MIN_WAV_BYTES})` },
      400
    );
  }

  const pronunciationHeader = btoa(JSON.stringify({
    ReferenceText: referenceText,
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    Dimension: 'Comprehensive',
    EnableMiscue: true,
    EnableProsodyAssessment: true,
    PhonemeAlphabet: 'IPA',
    NBestPhonemeCount: 3,
  }));
  const endpoint =
    `https://${AZURE_SPEECH_REGION}.stt.speech.microsoft.com/` +
    `speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(locale)}&format=detailed`;

  const audioBuffer = audioBytes.buffer.slice(
    audioBytes.byteOffset,
    audioBytes.byteOffset + audioBytes.byteLength
  ) as ArrayBuffer;
  const azureResponse = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
        'Content-Type': 'audio/wav',
        Accept: 'application/json',
        'Pronunciation-Assessment': pronunciationHeader,
      },
      body: audioBuffer,
    },
    AZURE_REQUEST_TIMEOUT_MS
  );

  const rawText = await azureResponse.text().catch(() => '');
  const raw = parseAzureJsonResponse(rawText);
  if (!azureResponse.ok) {
    const detail =
      (raw as { error?: { message?: string }; RecognitionStatus?: string } | null)?.error?.message
      || (raw as { RecognitionStatus?: string } | null)?.RecognitionStatus
      || `Azure Speech request failed (${azureResponse.status})`;
    return jsonResponse(
      {
        error: `${detail} (wavBytes=${audioBytes.length})`,
        reason: 'azure_pronunciation_failed',
        locale,
        wavFormat,
      },
      azureResponse.status >= 400 && azureResponse.status < 500 ? 400 : 502
    );
  }

  const rawRecord = (raw || {}) as {
    RecognitionStatus?: string;
    DisplayText?: string;
    PronunciationAssessment?: {
      PronScore?: number;
      AccuracyScore?: number;
      FluencyScore?: number;
      CompletenessScore?: number;
      ProsodyScore?: number;
    };
    Words?: Array<{
      Word?: string;
      PronunciationAssessment?: { AccuracyScore?: number };
      Syllables?: Array<{
        Syllable?: string;
        PronunciationAssessment?: { AccuracyScore?: number };
      }>;
      Phonemes?: Array<{
        Phoneme?: string;
        PronunciationAssessment?: {
          AccuracyScore?: number;
          NBestPhonemes?: Array<{ Phoneme?: string }>;
        };
      }>;
    }>;
    NBest?: Array<{
      Display?: string;
      Lexical?: string;
      PronunciationAssessment?: {
        PronScore?: number;
        AccuracyScore?: number;
        FluencyScore?: number;
        CompletenessScore?: number;
        ProsodyScore?: number;
      };
      Words?: Array<{
        Word?: string;
        PronunciationAssessment?: { AccuracyScore?: number };
        Syllables?: Array<{
          Syllable?: string;
          PronunciationAssessment?: { AccuracyScore?: number };
        }>;
        Phonemes?: Array<{
          Phoneme?: string;
          PronunciationAssessment?: {
            AccuracyScore?: number;
            NBestPhonemes?: Array<{ Phoneme?: string }>;
          };
        }>;
      }>;
    }>;
  };
  const best = Array.isArray(rawRecord.NBest) ? rawRecord.NBest[0] : undefined;
  const pa = best?.PronunciationAssessment || rawRecord.PronunciationAssessment;
  const wordsRaw = Array.isArray(best?.Words)
    ? best.Words
    : (Array.isArray(rawRecord.Words) ? rawRecord.Words : []);
  const phonemeFeedback: Array<{
    phoneme: string;
    letters?: string;
    spokenPhoneme: string | null;
    accuracy: number;
    level: 'red' | 'yellow' | 'green';
    suggestion: string;
  }> = [];
  const letterSegments: Array<{
    text: string;
    letters: string;
    phoneme: string;
    spokenPhoneme: string | null;
    accuracy: number;
    level: 'red' | 'yellow' | 'green';
    suggestion: string;
  }> = [];

  const wordFeedback = wordsRaw
    .map((wordItem) => {
      const word = sanitizeText(wordItem?.Word, 80);
      if (!word) return null;
      const phonemesRaw = Array.isArray(wordItem?.Phonemes) ? wordItem.Phonemes : [];
      const syllablesRaw = Array.isArray(wordItem?.Syllables) ? wordItem.Syllables : [];
      const perWordPhonemes: Array<{
        phoneme: string;
        spokenPhoneme: string | null;
        accuracy: number;
        level: 'red' | 'yellow' | 'green';
        suggestion: string;
      }> = [];
      for (const phonemeItem of phonemesRaw) {
        const phoneme = sanitizeText(phonemeItem?.Phoneme, 20);
        const accuracy = extractAccuracyScore(phonemeItem);
        if (!phoneme || accuracy === null) continue;
        const spokenPhoneme =
          typeof phonemeItem?.PronunciationAssessment?.NBestPhonemes?.[0]?.Phoneme === 'string'
            ? sanitizeText(phonemeItem.PronunciationAssessment.NBestPhonemes[0].Phoneme, 20)
            : '';
        const item = {
          phoneme,
          spokenPhoneme: spokenPhoneme || null,
          accuracy,
          level: toAccuracyLevel(accuracy),
          suggestion: buildArticulationHint(phoneme, spokenPhoneme || null),
        };
        perWordPhonemes.push(item);
        phonemeFeedback.push(item);
      }
      const perWordSyllables: Array<{
        phoneme: string;
        spokenPhoneme: null;
        accuracy: number;
        level: 'red' | 'yellow' | 'green';
        suggestion: string;
      }> = [];
      for (const syllableItem of syllablesRaw) {
        const syllable = sanitizeText(syllableItem?.Syllable, 40);
        const accuracy = extractAccuracyScore(syllableItem);
        if (!syllable || accuracy === null) continue;
        perWordSyllables.push({
          phoneme: syllable,
          spokenPhoneme: null,
          accuracy,
          level: toAccuracyLevel(accuracy),
          suggestion: '放慢語速，將此音節拆開重讀，先求清楚再求連貫。',
        });
      }
      const mappedLettersByPhoneme = splitWordIntoLetterSegments(word, perWordPhonemes.length);
      for (const [index, p] of perWordPhonemes.entries()) {
        letterSegments.push({
          text: word,
          letters: mappedLettersByPhoneme[index] || p.phoneme || word,
          phoneme: p.phoneme,
          spokenPhoneme: p.spokenPhoneme,
          accuracy: p.accuracy,
          level: p.level,
          suggestion: p.suggestion,
        });
      }
      const accuracy =
        extractAccuracyScore(wordItem)
        ?? (perWordPhonemes.length > 0
          ? Math.round(perWordPhonemes.reduce((sum, item) => sum + item.accuracy, 0) / perWordPhonemes.length)
          : perWordSyllables.length > 0
            ? Math.round(perWordSyllables.reduce((sum, item) => sum + item.accuracy, 0) / perWordSyllables.length)
            : null);
      if (accuracy === null) return null;
      return { word, accuracy, level: toAccuracyLevel(accuracy) };
    })
    .filter((item): item is { word: string; accuracy: number; level: 'red' | 'yellow' | 'green' } => Boolean(item));

  const wordAvgScore = wordFeedback.length > 0
    ? Math.round(wordFeedback.reduce((sum, item) => sum + item.accuracy, 0) / wordFeedback.length)
    : null;
  const hasTopLevelScores =
    clampPronScore(pa?.PronScore) !== null
    || clampPronScore(pa?.AccuracyScore) !== null
    || clampPronScore(pa?.FluencyScore) !== null
    || clampPronScore(pa?.CompletenessScore) !== null
    || clampPronScore(pa?.ProsodyScore) !== null;
  const hasPronunciationAssessment =
    hasTopLevelScores || wordFeedback.length > 0 || phonemeFeedback.length > 0;
  const overallScore =
    clampPronScore(pa?.PronScore)
    ?? clampPronScore(pa?.AccuracyScore)
    ?? clampPronScore(pa?.FluencyScore)
    ?? clampPronScore(pa?.CompletenessScore)
    ?? extractAccuracyScore(wordsRaw[0])
    ?? wordAvgScore
    ?? 0;
  return jsonResponse({
    result: {
      overallScore,
      accuracyScore: clampPronScore(pa?.AccuracyScore) ?? overallScore,
      fluencyScore: clampPronScore(pa?.FluencyScore) ?? overallScore,
      completenessScore: clampPronScore(pa?.CompletenessScore) ?? overallScore,
      prosodyScore: clampPronScore(pa?.ProsodyScore) ?? overallScore,
      hasPronunciationAssessment,
      wordFeedback,
      phonemeFeedback,
      letterSegments,
      recognitionStatus: sanitizeText(rawRecord.RecognitionStatus, 40) || 'Unknown',
      displayText:
        sanitizeText(best?.Display, 300)
        || sanitizeText(rawRecord.DisplayText, 300)
        || sanitizeText(best?.Lexical, 300),
      wavFormat,
      raw,
    },
  });
}
