// Decides when a pronunciation recording can stop on its own: once the user has
// spoken and then gone quiet. Fed the recorder's metering samples; pure logic so
// it can be unit-tested without a microphone.

export type SpeechEndDecision = 'continue' | 'silence_after_speech' | 'max_duration';

export type SpeechEndDetectorOptions = {
  /** Initial window used to measure the room's background level. */
  calibrationMs?: number;
  /** How far above background a sample must be to count as speech. */
  speechMarginDb?: number;
  /** Speech must be sustained this long before we trust it (ignores taps/clicks). */
  minSpeechMs?: number;
  /** Quiet this long after speech ends the recording. */
  trailingSilenceMs?: number;
  /** Hard stop regardless of what was heard. */
  maxDurationMs?: number;
};

export type SpeechEndSnapshot = {
  noiseFloorDb: number | null;
  peakDb: number;
  speechStartedAtMs: number | null;
  lastSpeechAtMs: number | null;
};

const DEFAULTS: Required<SpeechEndDetectorOptions> = {
  calibrationMs: 300,
  speechMarginDb: 15,
  minSpeechMs: 250,
  trailingSilenceMs: 800,
  maxDurationMs: 10000,
};

// A silent mic reports -160; don't let that drag the speech threshold down to
// where any rustle counts as speech.
const MIN_NOISE_FLOOR_DB = -60;
// In a loud room, don't demand shouting: cap the threshold.
const MAX_SPEECH_THRESHOLD_DB = -20;
// Once speech started, a sample only counts as quiet below this (hysteresis).
const SILENCE_HYSTERESIS_DB = 6;

/**
 * expo-av reports iOS metering in dBFS, but on Android it computes
 * 20 * ln(amplitude / 32767) — natural log — so values run ~2.3x more negative.
 * Convert to dBFS so both platforms share thresholds.
 */
export function normalizeMeteringDb(raw: number, platform: string): number {
  if (!Number.isFinite(raw)) return -160;
  return platform === 'android' ? raw / Math.LN10 : raw;
}

function lowerQuartile(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * 0.25)];
}

export function createSpeechEndDetector(options: SpeechEndDetectorOptions = {}) {
  const config = { ...DEFAULTS, ...options };
  const calibrationSamples: number[] = [];
  let noiseFloorDb: number | null = null;
  let speechThresholdDb = 0;
  let silenceThresholdDb = 0;
  let peakDb = -160;
  let loudSinceMs: number | null = null;
  let speechStartedAtMs: number | null = null;
  let lastSpeechAtMs: number | null = null;
  let decided: SpeechEndDecision = 'continue';

  const finishCalibration = () => {
    const measured = calibrationSamples.length > 0 ? lowerQuartile(calibrationSamples) : MIN_NOISE_FLOOR_DB;
    noiseFloorDb = Math.max(measured, MIN_NOISE_FLOOR_DB);
    speechThresholdDb = Math.min(noiseFloorDb + config.speechMarginDb, MAX_SPEECH_THRESHOLD_DB);
    silenceThresholdDb = speechThresholdDb - SILENCE_HYSTERESIS_DB;
  };

  /** Feed one sample (dBFS) at `elapsedMs` since recording started. */
  const push = (levelDb: number, elapsedMs: number): SpeechEndDecision => {
    if (decided !== 'continue') return decided;
    peakDb = Math.max(peakDb, levelDb);

    if (elapsedMs >= config.maxDurationMs) {
      decided = 'max_duration';
      return decided;
    }

    if (noiseFloorDb === null) {
      if (elapsedMs < config.calibrationMs) {
        calibrationSamples.push(levelDb);
        return decided;
      }
      finishCalibration();
    }

    if (speechStartedAtMs === null) {
      if (levelDb >= speechThresholdDb) {
        loudSinceMs ??= elapsedMs;
        if (elapsedMs - loudSinceMs >= config.minSpeechMs) {
          speechStartedAtMs = loudSinceMs;
          lastSpeechAtMs = elapsedMs;
        }
      } else if (levelDb < silenceThresholdDb) {
        loudSinceMs = null;
      }
      return decided;
    }

    if (levelDb >= silenceThresholdDb) {
      lastSpeechAtMs = elapsedMs;
    } else if (lastSpeechAtMs !== null && elapsedMs - lastSpeechAtMs >= config.trailingSilenceMs) {
      decided = 'silence_after_speech';
    }
    return decided;
  };

  const snapshot = (): SpeechEndSnapshot => ({
    noiseFloorDb,
    peakDb,
    speechStartedAtMs,
    lastSpeechAtMs,
  });

  return { push, snapshot };
}

export type SpeechEndDetector = ReturnType<typeof createSpeechEndDetector>;
