import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechEndDetector, normalizeMeteringDb } from './speechEndDetector.ts';

const STEP_MS = 80;

// segments: [[levelDb, durationMs], ...] → returns { decision, atMs }
function run(segments, options) {
  const detector = createSpeechEndDetector(options);
  let elapsed = 0;
  for (const [level, duration] of segments) {
    const end = elapsed + duration;
    for (; elapsed < end; elapsed += STEP_MS) {
      const decision = detector.push(level, elapsed);
      if (decision !== 'continue') return { decision, atMs: elapsed, detector };
    }
  }
  return { decision: 'continue', atMs: elapsed, detector };
}

test('stops after speech followed by trailing silence in a quiet room', () => {
  const { decision, atMs } = run([[-55, 600], [-20, 700], [-55, 3000]]);
  assert.equal(decision, 'silence_after_speech');
  // speech ends at 1300ms; stop ~800ms later
  assert.ok(atMs >= 2000 && atMs <= 2300, `stopped at ${atMs}`);
});

test('does not cut off a short pause inside a phrase', () => {
  const { decision, atMs } = run([[-55, 400], [-22, 500], [-55, 500], [-22, 500], [-55, 3000]]);
  assert.equal(decision, 'silence_after_speech');
  assert.ok(atMs > 1900 + 700, `stopped too early at ${atMs}`);
});

test('works in a noisy room using the measured background', () => {
  const { decision } = run([[-38, 400], [-15, 700], [-38, 3000]]);
  assert.equal(decision, 'silence_after_speech');
});

test('a brief click is not treated as speech', () => {
  const { decision } = run([[-55, 400], [-15, 120], [-55, 4000]]);
  assert.equal(decision, 'continue');
});

test('never auto-stops on silence alone, only at the max duration', () => {
  assert.equal(run([[-160, 9000]]).decision, 'continue');
  const capped = run([[-160, 11000]]);
  assert.equal(capped.decision, 'max_duration');
  assert.ok(capped.atMs >= 10000);
});

test('keeps listening while the user keeps talking', () => {
  const { decision } = run([[-55, 300], [-20, 6000]]);
  assert.equal(decision, 'continue');
});

test('speaking during calibration still allows an auto-stop', () => {
  const { decision } = run([[-55, 100], [-20, 900], [-55, 3000]]);
  assert.equal(decision, 'silence_after_speech');
});

test('normalizes Android natural-log metering to dBFS', () => {
  const amplitude = 3277; // ~ -20 dBFS
  const androidRaw = 20 * Math.log(amplitude / 32767);
  assert.ok(Math.abs(normalizeMeteringDb(androidRaw, 'android') - -20) < 0.1);
  assert.equal(normalizeMeteringDb(-20, 'ios'), -20);
  assert.equal(normalizeMeteringDb(Number.NaN, 'ios'), -160);
});
